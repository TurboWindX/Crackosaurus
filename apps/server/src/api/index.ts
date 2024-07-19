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

async function checkPassword(
  inputPassword: string,
  dbPassword: string
): Promise<boolean> {
  return bcrypt.compare(inputPassword, dbPassword);
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
    return prisma.$transaction(async (tx) => {
      const firstUser = await tx.user.findFirst({
        select: {
          ID: true,
        },
      });

      if (firstUser !== null) throw new APIError("internal");

      const user = await tx.user.create({
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
    });
  },
  login: async ({ request, prisma, username, password }) => {
    return prisma.$transaction(async (tx) => {
      let user;
      try {
        user = await tx.user.findUniqueOrThrow({
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

        throw err;
      }

      if (!(await checkPassword(password, user.password)))
        throw new APIError("input");

      await request.session.regenerate();

      request.session.uid = user.ID;
      request.session.username = user.username;
      request.session.permissions = user.permissions;

      return user.ID;
    });
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

    return prisma.$transaction(async (tx) => {
      return await tx.user.findUniqueOrThrow({
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
    });
  },
  getUsers: async ({ prisma }) => {
    return prisma.$transaction(async (tx) => {
      return await tx.user.findMany({
        select: {
          ID: true,
          username: true,
          permissions: true,
          updatedAt: true,
        },
      });
    });
  },
  getUserList: async ({ prisma }) => {
    return prisma.$transaction(async (tx) => {
      return await tx.user.findMany({
        select: {
          ID: true,
          username: true,
        },
      });
    });
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

    return prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        select: {
          ID: true,
        },
        data: {
          username,
          password: hashPassword(password),
          permissions: permissions?.join(" ") ?? "",
        },
      });

      return user.ID;
    });
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

    return prisma.$transaction(async (tx) => {
      const { count } = await tx.user.deleteMany({
        where: {
          ID: {
            in: userIDs,
          },
          permissions: {
            notIn: ["root"],
          },
        },
      });

      if (count === 0) throw new APIError("input");

      if (userIDs.some((userID) => userID === currentUserID))
        await request.session.destroy();

      return count;
    });
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

    return prisma.$transaction(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({
        select: {
          permissions: true,
        },
        where: {
          ID: userID,
        },
      });

      const permissionSet = new Set(user.permissions.split(" "));

      permissions.forEach((permission) => permissionSet.add(permission));

      await tx.user.update({
        where: {
          ID: userID,
        },
        data: {
          permissions: [...permissionSet].join(" "),
        },
      });

      return true;
    });
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

    return prisma.$transaction(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({
        select: {
          permissions: true,
        },
        where: {
          ID: userID,
        },
      });

      const permissionSet = new Set(user.permissions.split(" "));

      permissions.forEach((permission) => permissionSet.delete(permission));

      await tx.user.update({
        where: {
          ID: userID,
        },
        data: {
          permissions: [...permissionSet].join(" "),
        },
      });

      return permissionSet.size;
    });
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

    return prisma.$transaction(async (tx) => {
      // Check if old password is valid or bypass
      if (!hasPermission("users:edit")) {
        const user = await tx.user.findUniqueOrThrow({
          select: {
            password: true,
          },
          where: {
            ID: userID,
          },
        });

        if (!(await checkPassword(oldPassword, user.password)))
          throw new APIError("input");
      }

      // Update password for user
      await tx.user.update({
        where: {
          ID: userID,
        },
        data: {
          password: hashPassword(newPassword),
          updatedAt: new Date(),
        },
      });

      return true;
    });
  },
  getProjects: async ({ prisma, hasPermission, currentUserID }) => {
    return prisma.$transaction(async (tx) => {
      return await tx.project.findMany({
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
    });
  },
  getProjectList: async ({ prisma, hasPermission, currentUserID }) => {
    return prisma.$transaction(async (tx) => {
      return await tx.project.findMany({
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
    });
  },
  getProject: async ({ prisma, hasPermission, currentUserID, projectID }) => {
    return prisma.$transaction(async (tx) => {
      return await tx.project.findUniqueOrThrow({
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
    });
  },
  createProject: async ({ prisma, currentUserID, projectName }) => {
    return prisma.$transaction(async (tx) => {
      const project = await tx.project.create({
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

      return project.PID;
    });
  },
  deleteProjects: async ({
    prisma,
    hasPermission,
    currentUserID,
    projectIDs,
  }) => {
    return prisma.$transaction(async (tx) => {
      const projects = await tx.project.findMany({
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

      await tx.hash.deleteMany({
        where: {
          projectId: {
            in: projects.map((project) => project.PID),
          },
        },
      });

      const { count } = await tx.project.deleteMany({
        where: {
          PID: {
            in: projects.map((project) => project.PID),
          },
        },
      });

      return count;
    });
  },
  addUsersToProject: async ({
    prisma,
    hasPermission,
    currentUserID,
    projectID,
    userIDs,
  }) => {
    return prisma.$transaction(async (tx) => {
      await tx.project.update({
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

      return userIDs.length;
    });
  },
  removeUsersFromProject: async ({
    prisma,
    hasPermission,
    currentUserID,
    projectID,
    userIDs,
  }) => {
    return prisma.$transaction(async (tx) => {
      await tx.project.update({
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

      return userIDs.length;
    });
  },
  addHashes: async ({
    prisma,
    hasPermission,
    currentUserID,
    projectID,
    data,
  }) => {
    return prisma.$transaction(async (tx) => {
      await tx.project.update({
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

      const hashValueMap = Object.fromEntries(
        data.map((hash) => [hash.hash, toHashcatHash(hash.hashType, hash.hash)])
      );

      const seenHashes = await tx.hash.findMany({
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

      const seenHashMap = Object.fromEntries(
        seenHashes.map((hash) => [hash.hash, hash.value ?? ""])
      );

      const outHashes = await tx.hash.createManyAndReturn({
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

      const outHashMap = Object.fromEntries(
        outHashes.map((hash) => [hash.hash, hash.HID])
      );

      return data.map((hash) => outHashMap[hashValueMap[hash.hash]!] ?? null);
    });
  },
  removeHashes: async ({
    prisma,
    hasPermission,
    currentUserID,
    projectID,
    hashIDs,
  }) => {
    return prisma.$transaction(async (tx) => {
      await tx.project.update({
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

      const { count } = await tx.hash.deleteMany({
        where: {
          HID: {
            in: hashIDs,
          },
          projectId: projectID,
        },
      });

      return count;
    });
  },
  getInstances: async ({ prisma }) => {
    return prisma.$transaction(async (tx) => {
      return await tx.instance.findMany({
        select: {
          IID: true,
          name: true,
          status: true,
          updatedAt: true,
        },
      });
    });
  },
  getInstanceList: async ({ prisma }) => {
    return prisma.$transaction(async (tx) => {
      return await tx.instance.findMany({
        select: {
          IID: true,
          name: true,
        },
      });
    });
  },
  getInstanceTypes: async () => {
    return ["node"];
  },
  createInstance: async ({ prisma, cluster, name, type }) => {
    return prisma.$transaction(async (tx) => {
      const tag = await cluster.createInstance(type);
      if (!tag) throw new APIError("internal");

      const instance = await tx.instance.create({
        select: {
          IID: true,
        },
        data: {
          name,
          tag,
          type,
        },
      });

      return instance.IID;
    });
  },
  getInstance: async ({ prisma, instanceID }) => {
    return prisma.$transaction(async (tx) => {
      return await tx.instance.findUniqueOrThrow({
        include: {
          jobs: true,
        },
        where: {
          IID: instanceID,
        },
      });
    });
  },
  deleteInstances: async ({ prisma, cluster, instanceIDs }) => {
    return prisma.$transaction(async (tx) => {
      const instances = await tx.instance.findMany({
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

      await tx.job.deleteMany({
        where: {
          instance: {
            IID: {
              in: deletedIDs,
            },
          },
        },
      });

      const { count } = await tx.instance.deleteMany({
        where: {
          IID: {
            in: deletedIDs,
          },
        },
      });

      return count;
    });
  },
  createInstanceJobs: async ({
    prisma,
    cluster,
    hasPermission,
    currentUserID,
    instanceID,
    data,
  }) => {
    const projectIDs = data.flatMap((job) => job.projectIDs);
    const wordlistIDs = data.map((job) => job.wordlistID);

    return prisma.$transaction(async (tx) => {
      const instance = await tx.instance.findUniqueOrThrow({
        select: {
          tag: true,
        },
        where: {
          IID: instanceID,
        },
      });

      const projects = await tx.project.findMany({
        select: {
          PID: true,
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
      const projectMap = Object.fromEntries(
        projects.map((project) => [project.PID, project])
      );

      const wordlists = await tx.wordlist.findMany({
        select: {
          WID: true,
        },
        where: {
          WID: {
            in: wordlistIDs,
          },
        },
      });
      const wordlistIDSet = new Set(wordlists.map(({ WID }) => WID));

      const result = await Promise.allSettled(
        data.map(async (job) => {
          if (!wordlistIDSet.has(job.wordlistID)) return null;

          const jobProjects = job.projectIDs
            .map((projectID) => projectMap[projectID]!)
            .filter((project) => project);

          const jobHashes = jobProjects.flatMap((project) =>
            project.hashes.filter(
              (hash) =>
                hash.hashType === job.hashType &&
                hash.status === STATUS.NotFound
            )
          );

          if (jobHashes.length === 0) return null;

          return [
            job,
            jobHashes,
            await cluster.createJob(
              instance.tag,
              job.wordlistID,
              job.hashType,
              jobHashes.map(({ hash }) => hash)
            ),
          ] as const;
        })
      );

      const jobData = result
        .filter(
          (res) => res.status === "fulfilled" && res.value && res.value[2]
        )
        .map(
          (res) =>
            (res as any).value as [
              (typeof data)[number],
              { HID: string }[],
              string,
            ]
        );

      await Promise.all(
        jobData.map(([{ wordlistID }, hashes, JID]) =>
          tx.job.create({
            data: {
              JID,
              wordlistId: wordlistID,
              instanceId: instanceID,
              hashes: {
                connect: hashes.map(({ HID }) => ({ HID })),
              },
            },
          })
        )
      );

      return jobData.map(([_, __, JID]) => JID);
    });
  },
  deleteInstanceJobs: async ({ prisma, cluster, instanceID, jobIDs }) => {
    return prisma.$transaction(async (tx) => {
      const instance = await tx.instance.findUniqueOrThrow({
        select: {
          IID: true,
          tag: true,
        },
        where: {
          IID: instanceID,
        },
      });

      const jobs = await tx.job.findMany({
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

      const { count } = await tx.job.deleteMany({
        where: {
          JID: {
            in: deletedIDs,
          },
        },
      });

      await tx.instance.update({
        where: {
          IID: instanceID,
        },
        data: {
          updatedAt: new Date(),
        },
      });

      return count;
    });
  },
  getWordlist: async ({ prisma, wordlistID }) => {
    return prisma.$transaction(async (tx) => {
      return tx.wordlist.findUniqueOrThrow({
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
    });
  },
  getWordlists: async ({ prisma }) => {
    return prisma.$transaction(async (tx) => {
      return tx.wordlist.findMany({
        select: {
          WID: true,
          name: true,
          size: true,
          checksum: true,
          updatedAt: true,
        },
      });
    });
  },
  getWordlistList: async ({ prisma }) => {
    return prisma.$transaction(async (tx) => {
      return tx.wordlist.findMany({
        select: {
          WID: true,
          name: true,
        },
      });
    });
  },
  createWordlist: async ({ prisma, cluster, multipart }) => {
    if (multipart === undefined) throw new APIError("input");

    const buffer = await streamToBuffer(multipart.file);
    const size = buffer.length;
    const checksum = crypto.createHash("md5").update(buffer).digest("hex");

    const wordlistID = await cluster.createWordlist(buffer);
    if (wordlistID === null) throw new APIError("internal");

    return prisma.$transaction(async (tx) => {
      const fileName = path.basename(multipart.filename);

      await tx.wordlist.create({
        data: {
          WID: wordlistID,
          name: fileName,
          size,
          checksum,
        },
      });

      return wordlistID;
    });
  },
  deleteWordlists: async ({ prisma, cluster, wordlistIDs }) => {
    return prisma.$transaction(async (tx) => {
      const result = await Promise.allSettled(
        wordlistIDs.map(async (wordlistID) => [
          wordlistID,
          await cluster.deleteWordlist(wordlistID),
        ])
      );

      const deletedIDs = result
        .map(
          (res) => res.status === "fulfilled" && res.value[1] && res.value[0]
        )
        .filter((val) => val) as string[];

      const { count } = await tx.wordlist.deleteMany({
        where: {
          WID: {
            in: deletedIDs,
          },
        },
      });

      return count;
    });
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
