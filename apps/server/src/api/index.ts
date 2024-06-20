import { type MultipartFile } from "@fastify/multipart";
import { PrismaClient } from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import bcrypt from "bcrypt";
import { FastifyPluginCallback, FastifyReply, FastifyRequest } from "fastify";
import * as crypto from "node:crypto";
import path from "node:path";
import { type Readable } from "node:stream";

import {
  HTTPMethod,
  PermissionType,
  Route,
  RouteRequest,
  RouteResponse,
  STATUS,
  hasPermission,
} from "@repo/api";
import { ROUTES } from "@repo/api/server";
import { toHashcatHash } from "@repo/hashcat/data";
import { APIError, AuthError, errorHandler } from "@repo/plugins/error";

import { ClusterConnector } from "../plugins/cluster/connectors/connector";

declare module "fastify" {
  interface Session {
    uid: string;
    username: string;
    permissions: string;
  }
}

function hashPassword(password: string): string {
  const saltRounds = 8;

  return bcrypt.hashSync(password, saltRounds);
}

function checkPassword(inputPassword: string, dbPassword: string): boolean {
  return bcrypt.compareSync(inputPassword, dbPassword);
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: any[] = [];

    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", (err) => reject(err));
  });
}

type RouteHandler<TRoute> =
  TRoute extends Route<infer _TPath, infer _TReq, infer _TRes>
    ? (
        data: RouteRequest<TRoute>["Params"] &
          RouteRequest<TRoute>["Body"] & {
            request: FastifyRequest;
            multipart?: MultipartFile;
            prisma: PrismaClient;
            cluster: ClusterConnector;
            currentUserID: string;
            hasPermission: (permission: PermissionType) => boolean;
          }
      ) => Promise<RouteResponse<TRoute>["response"]>
    : never;

const HANDLERS: {
  [key in keyof typeof ROUTES]: RouteHandler<(typeof ROUTES)[key]>;
} = {
  ping: async () => "pong",
  init: async ({ prisma, username, password }) => {
    let user;
    try {
      user = await prisma.user.findFirst({
        select: {
          ID: true,
        },
      });
    } catch (err) {
      throw new APIError("internal");
    }

    if (user !== null) throw new APIError("Application is already initialized");

    try {
      const user = await prisma.user.create({
        select: {
          ID: true,
        },
        data: {
          username,
          password: hashPassword(password),
          permissions: "root",
        },
      });

      return user.ID;
    } catch (err) {
      throw new APIError("internal");
    }
  },
  login: async ({ request, prisma, username, password }) => {
    let user;
    try {
      user = await prisma.user.findUniqueOrThrow({
        select: {
          ID: true,
          username: true,
          permissions: true,
          password: true,
        },
        where: {
          username: username,
        },
      });
    } catch (err) {
      if (err instanceof PrismaClientKnownRequestError) {
        if (err.code === "P2025") throw new APIError("input");
      }

      throw new APIError("internal");
    }

    if (!checkPassword(password, user.password)) throw new APIError("input");

    await request.session.regenerate();

    request.session.uid = user.ID;
    request.session.username = user.username;
    request.session.permissions = user.permissions;

    return user.ID;
  },
  logout: async ({ request }) => {
    await request.session.destroy();

    return true;
  },
  authUser: async ({ request }) => {
    return {
      uid: request.session.uid,
      username: request.session.username,
      permissions: request.session.permissions.split(" ") as PermissionType[],
    };
  },
  getUser: async ({ prisma, hasPermission, currentUserID, userID }) => {
    if (!hasPermission("users:get") && userID !== currentUserID)
      throw new APIError("permission");

    try {
      return await prisma.user.findUniqueOrThrow({
        select: {
          ID: true,
          username: true,
          permissions: true,
          projects: {
            select: {
              PID: true,
              name: true,
            },
            where: hasPermission("projects:get")
              ? undefined
              : {
                  members: {
                    some: {
                      ID: currentUserID,
                    },
                  },
                },
          },
        },
        where: {
          ID: userID,
        },
      });
    } catch (err) {
      throw new APIError("internal");
    }
  },
  getUsers: async ({ prisma }) => {
    try {
      return await prisma.user.findMany({
        select: {
          ID: true,
          username: true,
          permissions: true,
          updatedAt: true,
        },
      });
    } catch (err) {
      throw new APIError("internal");
    }
  },
  getUserList: async ({ prisma }) => {
    try {
      return await prisma.user.findMany({
        select: {
          ID: true,
          username: true,
        },
      });
    } catch (err) {
      throw new APIError("internal");
    }
  },
  register: async ({
    prisma,
    hasPermission,
    username,
    password,
    permissions,
  }) => {
    if ((permissions ?? []).some((permission) => !hasPermission(permission)))
      throw new APIError("permission");

    let user;
    try {
      user = await prisma.user.create({
        select: {
          ID: true,
        },
        data: {
          username,
          password: hashPassword(password),
          permissions: permissions?.join(" ") ?? "",
        },
      });
    } catch (err) {
      throw new APIError("internal");
    }

    return user.ID;
  },
  deleteUsers: async ({
    request,
    prisma,
    hasPermission,
    currentUserID,
    userIDs,
  }) => {
    if (
      !(
        hasPermission("users:remove") ||
        userIDs.every((userID) => userID === currentUserID)
      )
    )
      throw new APIError("permission");

    let count = 0;
    try {
      const res = await prisma.user.deleteMany({
        where: {
          ID: {
            in: userIDs,
          },
          permissions: {
            notIn: ["root"],
          },
        },
      });

      count = res.count;
    } catch (err) {
      throw new APIError("internal");
    }

    if (count === 0) throw new APIError("input");

    if (userIDs.some((userID) => userID === currentUserID))
      await request.session.destroy();

    return count;
  },
  addUserPermissions: async ({
    prisma,
    hasPermission,
    currentUserID,
    userID,
    permissions,
  }) => {
    if (permissions.some((permission) => !hasPermission(permission)))
      throw new APIError("auth");

    if (userID === currentUserID) throw new APIError("input");

    let permissionSet = new Set<string>();
    try {
      const user = await prisma.user.findUniqueOrThrow({
        select: {
          permissions: true,
        },
        where: {
          ID: userID,
        },
      });

      permissionSet = new Set(user.permissions.split(" "));
    } catch (err) {
      throw new APIError("internal");
    }

    permissions.forEach((permission) => permissionSet.add(permission));

    try {
      await prisma.user.update({
        where: {
          ID: userID,
        },
        data: {
          permissions: [...permissionSet].join(" "),
        },
      });
    } catch (err) {
      throw new APIError("internal");
    }

    return true;
  },
  removeUserPermissions: async ({
    prisma,
    hasPermission,
    currentUserID,
    userID,
    permissions,
  }) => {
    if (permissions.some((permission) => !hasPermission(permission)))
      throw new APIError("permission");

    if (userID === currentUserID) throw new APIError("input");

    let permissionSet = new Set<string>();
    try {
      const user = await prisma.user.findUniqueOrThrow({
        select: {
          permissions: true,
        },
        where: {
          ID: userID,
        },
      });

      permissionSet = new Set(user.permissions.split(" "));
    } catch (err) {
      throw new APIError("internal");
    }

    permissions.forEach((permission) => permissionSet.delete(permission));

    try {
      await prisma.user.update({
        where: {
          ID: userID,
        },
        data: {
          permissions: [...permissionSet].join(" "),
        },
      });
    } catch (err) {
      throw new APIError("internal");
    }

    return permissionSet.size;
  },
  changePassword: async ({
    prisma,
    hasPermission,
    currentUserID,
    userID,
    oldPassword,
    newPassword,
  }) => {
    if (!hasPermission("users:edit") && userID !== currentUserID)
      throw new APIError("Cannot edit user");

    // Check if old password is valid or bypass
    if (!hasPermission("users:edit")) {
      let userPassword = "";
      try {
        const user = await prisma.user.findUniqueOrThrow({
          select: {
            password: true,
          },
          where: {
            ID: userID,
          },
        });

        userPassword = user.password;
      } catch (err) {
        throw new APIError("internal");
      }

      if (!checkPassword(oldPassword, userPassword))
        throw new APIError("input");
    }

    // Update password for user
    try {
      await prisma.user.update({
        where: {
          ID: userID,
        },
        data: {
          password: hashPassword(newPassword),
          updatedAt: new Date(),
        },
      });
    } catch (err) {
      throw new APIError("internal");
    }

    return true;
  },
  getProjects: async ({ prisma, hasPermission, currentUserID }) => {
    try {
      return await prisma.project.findMany({
        select: {
          PID: true,
          name: true,
          updatedAt: true,
          members: hasPermission("projects:users:get")
            ? {
                select: {
                  ID: true,
                  username: true,
                },
              }
            : undefined,
        },
        where: hasPermission("root")
          ? undefined
          : {
              members: {
                some: {
                  ID: currentUserID,
                },
              },
            },
      });
    } catch (err) {
      throw new APIError("internal");
    }
  },
  getProjectList: async ({ prisma, hasPermission, currentUserID }) => {
    try {
      return await prisma.project.findMany({
        select: {
          PID: true,
          name: true,
        },
        where: hasPermission("projects:get")
          ? undefined
          : {
              members: {
                some: {
                  ID: currentUserID,
                },
              },
            },
      });
    } catch (err) {
      throw new APIError("internal");
    }
  },
  getProject: async ({ prisma, hasPermission, currentUserID, projectID }) => {
    try {
      return await prisma.project.findUniqueOrThrow({
        select: {
          PID: true,
          name: true,
          updatedAt: true,
          members: hasPermission("projects:users:get")
            ? {
                select: {
                  ID: true,
                  username: true,
                },
              }
            : undefined,
          hashes: hasPermission("hashes:get")
            ? {
                select: {
                  HID: true,
                  hash: true,
                  hashType: true,
                  value: hasPermission("hashes:view"),
                  status: true,
                  updatedAt: true,
                  jobs: hasPermission("instances:jobs:get")
                    ? {
                        select: {
                          JID: true,
                          status: true,
                          updatedAt: true,
                          instance: {
                            select: {
                              IID: true,
                              name: true,
                            },
                          },
                        },
                      }
                    : undefined,
                },
              }
            : undefined,
        },
        where: {
          PID: projectID,
          members: hasPermission("projects:get")
            ? undefined
            : {
                some: {
                  ID: currentUserID,
                },
              },
        },
      });
    } catch (err) {
      throw new APIError("internal");
    }
  },
  createProject: async ({ prisma, currentUserID, projectName }) => {
    let project;
    try {
      project = await prisma.project.create({
        select: {
          PID: true,
        },
        data: {
          name: projectName,
          members: {
            connect: {
              ID: currentUserID,
            },
          },
        },
      });
    } catch (error) {
      throw new APIError("internal");
    }

    return project.PID;
  },
  deleteProjects: async ({
    prisma,
    hasPermission,
    currentUserID,
    projectIDs,
  }) => {
    let projects;
    try {
      projects = await prisma.project.findMany({
        select: {
          PID: true,
        },
        where: {
          PID: {
            in: projectIDs,
          },
          members: hasPermission("root")
            ? undefined
            : {
                some: {
                  ID: currentUserID,
                },
              },
        },
      });
    } catch (err) {
      throw new APIError("internal");
    }

    try {
      await prisma.hash.deleteMany({
        where: {
          projectId: {
            in: projects.map((project) => project.PID),
          },
        },
      });
    } catch (err) {
      throw new APIError("internal");
    }

    let count = 0;
    try {
      const res = await prisma.project.deleteMany({
        where: {
          PID: {
            in: projects.map((project) => project.PID),
          },
        },
      });

      count = res.count;
    } catch (err) {
      throw new APIError("internal");
    }

    return count;
  },
  addUsersToProject: async ({
    prisma,
    hasPermission,
    currentUserID,
    projectID,
    userIDs,
  }) => {
    try {
      await prisma.project.update({
        where: {
          PID: projectID,
          members: hasPermission("root")
            ? undefined
            : {
                some: {
                  ID: currentUserID,
                },
              },
        },
        data: {
          members: {
            connect: userIDs.map((ID) => ({ ID })),
          },
        },
      });
    } catch (err) {
      throw new APIError("internal");
    }

    return userIDs.length;
  },
  removeUsersFromProject: async ({
    prisma,
    hasPermission,
    currentUserID,
    projectID,
    userIDs,
  }) => {
    try {
      await prisma.project.update({
        where: {
          PID: projectID,
          members: hasPermission("root")
            ? undefined
            : {
                some: {
                  ID: currentUserID,
                },
              },
        },
        data: {
          members: {
            disconnect: userIDs
              .filter((ID) => ID !== currentUserID)
              .map((ID) => ({ ID })),
          },
        },
      });
    } catch (err) {
      throw new APIError("internal");
    }

    return userIDs.length;
  },
  addHashes: async ({
    prisma,
    hasPermission,
    currentUserID,
    projectID,
    data,
  }) => {
    try {
      await prisma.project.update({
        where: {
          PID: projectID,
          members: hasPermission("root")
            ? undefined
            : {
                some: {
                  ID: currentUserID,
                },
              },
        },
        data: {
          updatedAt: new Date(),
        },
      });
    } catch (err) {
      throw new APIError("internal");
    }

    const hashValueMap = Object.fromEntries(
      data.map((hash) => [hash.hash, toHashcatHash(hash.hashType, hash.hash)])
    );

    let seenHashes;
    try {
      seenHashes = await prisma.hash.findMany({
        select: {
          hash: true,
          value: true,
        },
        where: {
          hash: {
            in: Object.values(hashValueMap),
          },
          status: "FOUND",
        },
      });
    } catch (err) {
      throw new APIError("internal");
    }

    const seenHashMap = Object.fromEntries(
      seenHashes.map((hash) => [hash.hash, hash.value ?? ""])
    );

    let outHashes;
    try {
      outHashes = await prisma.hash.createManyAndReturn({
        select: {
          HID: true,
          hash: true,
        },
        data: data.map((hash) => {
          const hashValue = hashValueMap[hash.hash]!;
          const seenHash = seenHashMap[hashValue];

          return {
            hash: hashValue,
            hashType: hash.hashType,
            value: seenHash,
            status: seenHash ? STATUS.Found : undefined,
            projectId: projectID,
          };
        }),
      });
    } catch (err) {
      throw new APIError("internal");
    }

    const outHashMap = Object.fromEntries(
      outHashes.map((hash) => [hash.hash, hash.HID])
    );

    return data.map((hash) => outHashMap[hashValueMap[hash.hash]!] ?? null);
  },
  removeHashes: async ({
    prisma,
    hasPermission,
    currentUserID,
    projectID,
    hashIDs,
  }) => {
    try {
      await prisma.project.update({
        where: {
          PID: projectID,
          members: hasPermission("root")
            ? undefined
            : {
                some: {
                  ID: currentUserID,
                },
              },
        },
        data: {
          updatedAt: new Date(),
        },
      });
    } catch (err) {
      throw new APIError("internal");
    }

    let count = 0;
    try {
      const res = await prisma.hash.deleteMany({
        where: {
          HID: {
            in: hashIDs,
          },
          projectId: projectID,
        },
      });

      count = res.count;
    } catch (err) {
      throw new APIError("internal");
    }

    return count;
  },
  getInstances: async ({ prisma }) => {
    try {
      return await prisma.instance.findMany({
        select: {
          IID: true,
          name: true,
          status: true,
          updatedAt: true,
        },
      });
    } catch (e) {
      throw new APIError("internal");
    }
  },
  getInstanceList: async ({ prisma }) => {
    try {
      return await prisma.instance.findMany({
        select: {
          IID: true,
          name: true,
        },
      });
    } catch (e) {
      throw new APIError("internal");
    }
  },
  createInstance: async ({ prisma, cluster, name, type }) => {
    const tag = await cluster.createInstance(type);
    if (!tag) throw new APIError("internal");

    let instanceID: string;
    try {
      const instance = await prisma.instance.create({
        select: {
          IID: true,
        },
        data: {
          name,
          tag,
          type,
        },
      });

      instanceID = instance.IID;
    } catch (e) {
      throw new APIError("internal");
    }

    return instanceID;
  },
  getInstance: async ({ prisma, instanceID }) => {
    try {
      return await prisma.instance.findUniqueOrThrow({
        include: {
          jobs: true,
        },
        where: {
          IID: instanceID,
        },
      });
    } catch (e) {
      throw new APIError("internal");
    }
  },
  deleteInstances: async ({ prisma, cluster, instanceIDs }) => {
    let instances;
    try {
      instances = await prisma.instance.findMany({
        select: {
          IID: true,
          tag: true,
        },
        where: {
          IID: {
            in: instanceIDs,
          },
        },
      });
    } catch (e) {
      throw new APIError("internal");
    }

    const results = await Promise.allSettled(
      instances.map(
        async (instance) =>
          [instance.IID, await cluster.deleteInstance(instance.tag)] as const
      )
    );
    const deletedIDs = results
      .map(
        (res) =>
          (res.status === "fulfilled" && res.value[1]
            ? res.value[0]
            : null) as string
      )
      .filter((value) => value !== null);

    try {
      await prisma.job.deleteMany({
        where: {
          instance: {
            IID: {
              in: deletedIDs,
            },
          },
        },
      });
    } catch (e) {
      throw new APIError("internal");
    }

    let count = 0;
    try {
      const res = await prisma.instance.deleteMany({
        where: {
          IID: {
            in: deletedIDs,
          },
        },
      });

      count = res.count;
    } catch (e) {
      throw new APIError("internal");
    }

    return count;
  },
  createInstanceJob: async ({
    prisma,
    cluster,
    hasPermission,
    currentUserID,
    instanceID,
    hashType,
    projectIDs,
    wordlistID,
  }) => {
    let instance;
    try {
      instance = await prisma.instance.findUniqueOrThrow({
        select: {
          tag: true,
        },
        where: {
          IID: instanceID,
        },
      });
    } catch (e) {
      throw new APIError("internal");
    }

    let projects;
    try {
      projects = await prisma.project.findMany({
        select: {
          hashes: {
            select: {
              HID: true,
              hash: true,
              hashType: true,
              status: true,
            },
          },
        },
        where: {
          PID: {
            in: projectIDs,
          },
          members: hasPermission("root")
            ? undefined
            : {
                some: {
                  ID: currentUserID,
                },
              },
        },
      });
    } catch (e) {
      throw new APIError("internal");
    }

    let wordlist;
    try {
      wordlist = await prisma.wordlist.findUniqueOrThrow({
        select: {
          WID: true,
        },
        where: {
          WID: wordlistID,
        },
      });
    } catch (e) {
      throw new APIError("internal");
    }

    const hashes = projects.flatMap((project) =>
      project.hashes.filter(
        (hash) => hash.hashType === hashType && hash.status === STATUS.NotFound
      )
    );

    if (hashes.length === 0) throw new APIError("input");

    const jobID = await cluster.createJob(
      instance.tag,
      wordlist.WID,
      hashType,
      hashes.map(({ hash }) => hash)
    );
    if (!jobID) throw new APIError("internal");

    try {
      await prisma.job.create({
        data: {
          JID: jobID,
          wordlist: {
            connect: {
              WID: wordlist.WID,
            },
          },
          instance: {
            connect: {
              IID: instanceID,
            },
          },
          hashes: {
            connect: hashes.map(({ HID }) => ({ HID })),
          },
        },
      });
    } catch (e) {
      throw new APIError("internal");
    }

    return jobID;
  },
  deleteInstanceJobs: async ({ prisma, cluster, instanceID, jobIDs }) => {
    let instance;
    try {
      instance = await prisma.instance.findUniqueOrThrow({
        select: {
          IID: true,
          tag: true,
        },
        where: {
          IID: instanceID,
        },
      });
    } catch (e) {
      throw new APIError("internal");
    }

    let jobs;
    try {
      jobs = await prisma.job.findMany({
        select: {
          JID: true,
        },
        where: {
          JID: {
            in: jobIDs,
          },
          instance: {
            IID: instanceID,
          },
        },
      });
    } catch (e) {
      throw new APIError("internal");
    }

    const results = await Promise.allSettled(
      jobs.map(
        async ({ JID }) =>
          [JID, await cluster.deleteJob(instance.tag, JID)] as const
      )
    );
    const deletedIDs = results
      .map(
        (res) =>
          (res.status === "fulfilled" && res.value[1]
            ? res.value[0]
            : null) as string
      )
      .filter((value) => value !== null);

    let count = 0;
    try {
      const res = await prisma.job.deleteMany({
        where: {
          JID: {
            in: deletedIDs,
          },
        },
      });

      count = res.count;
    } catch (e) {
      throw new APIError("internal");
    }

    try {
      await prisma.instance.update({
        where: {
          IID: instanceID,
        },
        data: {
          updatedAt: new Date(),
        },
      });
    } catch (e) {}

    return count;
  },
  getWordlist: async ({ prisma, wordlistID }) => {
    try {
      return prisma.wordlist.findUniqueOrThrow({
        select: {
          WID: true,
          name: true,
          size: true,
          checksum: true,
          updatedAt: true,
        },
        where: {
          WID: wordlistID,
        },
      });
    } catch (e) {
      throw new APIError("internal");
    }
  },
  getWordlists: async ({ prisma }) => {
    try {
      return prisma.wordlist.findMany({
        select: {
          WID: true,
          name: true,
          size: true,
          checksum: true,
          updatedAt: true,
        },
      });
    } catch (e) {
      throw new APIError("internal");
    }
  },
  getWordlistList: async ({ prisma }) => {
    try {
      return prisma.wordlist.findMany({
        select: {
          WID: true,
          name: true,
        },
      });
    } catch (e) {
      throw new APIError("internal");
    }
  },
  createWordlist: async ({ prisma, cluster, multipart }) => {
    if (multipart === undefined) throw new APIError("input");

    const buffer = await streamToBuffer(multipart.file);
    const size = buffer.length;
    const checksum = crypto.createHash("md5").update(buffer).digest("hex");

    const wordlistID = await cluster.createWordlist(buffer);
    if (wordlistID === null) throw new APIError("internal");

    const fileName = path.basename(multipart.filename);

    try {
      await prisma.wordlist.create({
        data: {
          WID: wordlistID,
          name: fileName,
          size,
          checksum,
        },
      });
    } catch (e) {
      throw new APIError("internal");
    }

    return wordlistID;
  },
  deleteWordlists: async ({ prisma, cluster, wordlistIDs }) => {
    try {
      await Promise.all(
        wordlistIDs.map((wordlistID) => cluster.deleteWordlist(wordlistID))
      );
    } catch (e) {
      throw new APIError("internal");
    }

    let count = 0;
    try {
      const res = await prisma.wordlist.deleteMany({
        where: {
          WID: {
            in: wordlistIDs,
          },
        },
      });

      count = res.count;
    } catch (e) {
      throw new APIError("internal");
    }

    return count;
  },
} as const;

function checkPermission(permission: PermissionType) {
  return (
    request: FastifyRequest,
    _reply: FastifyReply,
    next: (err?: Error | undefined) => void
  ) => {
    if (!hasPermission(request.session.permissions, permission))
      throw new AuthError("auth");

    next();
  };
}

function validate(
  validator: { parse?: (data: any) => any },
  type: "json" | "multipart"
) {
  return (
    request: FastifyRequest,
    _reply: FastifyReply,
    next: (err?: Error | undefined) => void
  ) => {
    if (type === "json") {
      if (request.isMultipart()) throw new APIError("input");

      try {
        if (validator.parse) validator.parse(request.body ?? {});
      } catch (e) {
        throw new APIError("input");
      }
    } else if (type === "multipart") {
      if (!request.isMultipart()) throw new APIError("input");

      // TODO: Validate body.
    }

    next();
  };
}

export const api: FastifyPluginCallback<{}> = (instance, _opts, next) => {
  instance.setErrorHandler(errorHandler);

  for (const [key, route] of Object.entries(ROUTES)) {
    const method = route.method.toLowerCase() as Lowercase<HTTPMethod>;
    const handler = HANDLERS[key as keyof typeof ROUTES];

    instance[method](
      route.path,
      {
        preHandler: route.permissions.map((permission) =>
          checkPermission(permission)
        ),
        preValidation: [validate(route.request, route.type)],
      },
      async (request: FastifyRequest) => {
        let body: any = {};
        let multipart: MultipartFile | undefined = undefined;
        if (request.isMultipart()) {
          multipart = await request.file();

          // TODO: Handle body.
        } else {
          body = request.body;
        }

        return {
          response: await handler({
            ...(request.params as any),
            ...body,
            request,
            multipart,
            prisma: request.server.prisma,
            cluster: request.server.cluster,
            hasPermission: (permission: PermissionType) =>
              hasPermission(request.session.permissions ?? [], permission),
            currentUserID: request.session.uid ?? "",
          }),
        };
      }
    );
  }

  next();
};
