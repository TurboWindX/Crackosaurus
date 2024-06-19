import { type MultipartFile } from "@fastify/multipart";
import { PrismaClient } from "@prisma/client";
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
      throw new APIError("User error");
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
      throw new APIError("User error");
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
      throw new APIError("Login failed");
    }

    if (!checkPassword(password, user.password))
      throw new APIError("Login failed");

    await request.session.regenerate();

    request.session.uid = user.ID;
    request.session.username = user.username;
    request.session.permissions = user.permissions;

    return user.ID;
  },
  logout: async ({ request }) => {
    await request.session.destroy();

    return "Logout successful";
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
      throw new APIError("Cannot get user");

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
      throw new APIError("User error");
    }
  },
  getUsers: async ({ prisma }) => {
    try {
      return await prisma.user.findMany({
        select: {
          ID: true,
          username: true,
          permissions: true,
        },
      });
    } catch (err) {
      throw new APIError("User error");
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
      throw new APIError("User error");
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
      throw new APIError("Cannot add permission without having it");

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
      throw new APIError("User error");
    }

    return user.ID;
  },
  deleteUser: async ({
    request,
    prisma,
    hasPermission,
    currentUserID,
    userID,
  }) => {
    if (!hasPermission("users:remove") && userID !== currentUserID)
      throw new APIError("Cannot remove user");

    let user;
    try {
      user = await prisma.user.findUniqueOrThrow({
        select: {
          projects: {
            select: {
              PID: true,
              members: {
                select: {
                  ID: true,
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
      throw new APIError("User error");
    }

    try {
      await prisma.user.delete({
        where: {
          ID: userID,
        },
      });
    } catch (err) {
      throw new APIError("Delete error");
    }

    if (userID === currentUserID) await request.session.destroy();

    const emptyProjectIDs = user.projects
      .filter(({ members }) => members.length === 1)
      .map(({ PID }) => PID);
    if (emptyProjectIDs.length > 0) {
      try {
        user = await prisma.project.deleteMany({
          where: {
            PID: {
              in: emptyProjectIDs,
            },
          },
        });
      } catch (err) {}
    }

    return "User has been obliterated into oblivion";
  },
  addUserPermissions: async ({
    prisma,
    hasPermission,
    currentUserID,
    userID,
    permissions,
  }) => {
    if (permissions.some((permission) => !hasPermission(permission)))
      throw new APIError("Cannot add permission without having it");

    if (userID === currentUserID)
      throw new APIError("Cannot add permission to self");

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
      throw new APIError("User error");
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
      throw new APIError("User error");
    }

    return "User permissions added";
  },
  removeUserPermissions: async ({
    prisma,
    hasPermission,
    currentUserID,
    userID,
    permissions,
  }) => {
    if (permissions.some((permission) => !hasPermission(permission)))
      throw new APIError("Cannot remove permission without having it");

    if (userID === currentUserID)
      throw new APIError("Cannot remove permission from self");

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
      throw new APIError("User error");
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
      throw new APIError("User error");
    }

    return "User permissions removed";
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
        throw new APIError("User error");
      }

      if (!checkPassword(oldPassword, userPassword))
        throw new APIError("Invalid old password");
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
      throw new APIError("User error");
    }

    return "Password has been changed";
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
      throw new APIError("Project error");
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
      throw new APIError("Project error");
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
      throw new APIError("Project error");
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
      throw new APIError("Project error");
    }

    return project.PID;
  },
  deleteProject: async ({
    prisma,
    hasPermission,
    currentUserID,
    projectID,
  }) => {
    let project;
    try {
      project = await prisma.project.findUniqueOrThrow({
        select: {
          hashes: {
            select: {
              HID: true,
            },
          },
        },
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
      });
    } catch (err) {
      throw new APIError("Project error");
    }

    try {
      await prisma.hash.deleteMany({
        where: {
          HID: {
            in: project.hashes.map(({ HID }) => HID),
          },
        },
      });
    } catch (err) {
      throw new APIError("Hash error");
    }

    try {
      await prisma.project.delete({
        where: {
          PID: projectID,
        },
      });
    } catch (err) {
      throw new APIError("Project error");
    }

    return "Project has been deleted";
  },
  addUserToProject: async ({
    prisma,
    hasPermission,
    currentUserID,
    projectID,
    userID,
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
            connect: {
              ID: userID,
            },
          },
        },
      });
    } catch (err) {
      throw new APIError("Project error");
    }

    return "User has been added to the project";
  },
  removeUserFromProject: async ({
    prisma,
    hasPermission,
    currentUserID,
    projectID,
    userID,
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
            disconnect: {
              ID: userID,
            },
          },
        },
      });
    } catch (err) {
      throw new APIError("Project error");
    }

    return "User has been removed from the project";
  },
  addHash: async ({
    prisma,
    hasPermission,
    currentUserID,
    projectID,
    hash,
    hashType,
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
    } catch (err) {}

    const hashValue = toHashcatHash(hashType, hash);

    let seenHash;
    try {
      seenHash = await prisma.hash.findFirst({
        select: {
          value: true,
        },
        where: {
          hash: hashValue,
          hashType,
          status: "FOUND",
        },
      });
    } catch (err) {
      throw new APIError("Hash error");
    }

    let outHash;
    try {
      outHash = await prisma.hash.create({
        select: {
          HID: true,
        },
        data: {
          hash: hashValue,
          hashType,
          value: seenHash ? seenHash.value : undefined,
          status: seenHash ? "FOUND" : undefined,
          project: {
            connect: {
              PID: projectID,
            },
          },
        },
      });
    } catch (err) {
      throw new APIError("Hash error");
    }

    return outHash.HID;
  },
  removeHash: async ({
    prisma,
    hasPermission,
    currentUserID,
    projectID,
    hashID,
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
    } catch (err) {}

    try {
      await prisma.hash.delete({
        where: {
          HID: hashID,
        },
      });
    } catch (err) {
      throw new APIError("Hash error");
    }

    return "Hash has been removed";
  },
  viewHash: async ({ prisma, hasPermission, currentUserID, hashID }) => {
    let hash;
    try {
      hash = await prisma.hash.findUniqueOrThrow({
        select: {
          value: true,
        },
        where: {
          HID: hashID,
          project: {
            members: {
              some: hasPermission("root")
                ? undefined
                : {
                    ID: currentUserID,
                  },
            },
          },
        },
      });
    } catch (e) {
      throw new APIError("Hash error");
    }

    return hash.value;
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
      throw new APIError("Instance error");
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
      throw new APIError("Instance error");
    }
  },
  createInstance: async ({ prisma, cluster, name, type }) => {
    const tag = await cluster.createInstance(type);
    if (!tag) throw new APIError("Instance not created");

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
      throw new APIError("Instance not created");
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
      throw new APIError("Instance error");
    }
  },
  deleteInstance: async ({ prisma, cluster, instanceID }) => {
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
      throw new APIError("Instance error");
    }

    if (!(await cluster.deleteInstance(instance.tag)))
      throw new APIError("Could not terminate instance");

    try {
      await prisma.job.deleteMany({
        where: {
          instance: {
            IID: instanceID,
          },
        },
      });
    } catch (e) {
      throw new APIError("Job error");
    }

    try {
      await prisma.instance.delete({
        where: {
          IID: instanceID,
        },
      });
    } catch (e) {
      throw new APIError("Instance error");
    }

    return "Instance has been destroy";
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
      throw new APIError("Instance error");
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
      throw new APIError("Project error");
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
      throw new APIError("Wordlist error");
    }

    const hashes = projects.flatMap((project) =>
      project.hashes.filter(
        (hash) => hash.hashType === hashType && hash.status === STATUS.NotFound
      )
    );
    if (hashes.length === 0)
      throw new APIError("Cannot create a job without any valid hashes");

    const jobID = await cluster.createJob(
      instance.tag,
      wordlist.WID,
      hashType,
      hashes.map(({ hash }) => hash)
    );
    if (!jobID) throw new APIError("Cannot queue job");

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
      throw new APIError("Job error");
    }

    return jobID;
  },
  deleteInstanceJob: async ({ prisma, cluster, instanceID, jobID }) => {
    let job;
    try {
      job = await prisma.job.findUniqueOrThrow({
        select: {
          instance: {
            select: {
              IID: true,
              tag: true,
            },
          },
        },
        where: {
          JID: jobID,
          instance: {
            IID: instanceID,
          },
        },
      });
    } catch (e) {
      throw new APIError("Job error");
    }

    if (!(await cluster.deleteJob(job.instance.tag, jobID)))
      throw new APIError("Could not dequeue job");

    try {
      await prisma.job.delete({
        where: {
          JID: jobID,
        },
      });
    } catch (e) {
      throw new APIError("Job error");
    }

    try {
      await prisma.instance.update({
        where: {
          IID: job.instance.IID,
        },
        data: {
          updatedAt: new Date(),
        },
      });
    } catch (e) {}

    return "Job destroyed";
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
      throw new APIError("Wordlist error");
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
      throw new APIError("Wordlist error");
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
      throw new APIError("Wordlist error");
    }
  },
  createWordlist: async ({ prisma, cluster, multipart }) => {
    if (multipart === undefined) throw new APIError("No file");

    const buffer = await streamToBuffer(multipart.file);
    const size = buffer.length;
    const checksum = crypto.createHash("md5").update(buffer).digest("hex");

    const wordlistID = await cluster.createWordlist(buffer);
    if (wordlistID === null) throw new APIError("Could not create wordlist");

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
      throw new APIError("Could not create wordlist");
    }

    return wordlistID;
  },
  deleteWordlist: async ({ prisma, cluster, wordlistID }) => {
    await cluster.deleteWordlist(wordlistID);

    try {
      await prisma.wordlist.delete({
        where: {
          WID: wordlistID,
        },
      });
    } catch (e) {}

    return "Wordlist destroyed";
  },
} as const;

function checkPermission(permission: PermissionType) {
  return (
    request: FastifyRequest,
    _reply: FastifyReply,
    next: (err?: Error | undefined) => void
  ) => {
    if (!hasPermission(request.session.permissions, permission))
      throw new AuthError("Access denied");

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
      if (request.isMultipart())
        throw new APIError("Only supports application/json");

      try {
        if (validator.parse) validator.parse(request.body ?? {});
      } catch (e) {
        throw new APIError("Invalid input");
      }
    } else if (type === "multipart") {
      if (!request.isMultipart())
        throw new APIError("Only supports multipart/form-data");

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
