import { PrismaClient } from "@prisma/client";
import { type FastifyPluginOptions } from "fastify";
import fp from "fastify-plugin";

import { ClusterStatus, STATUS } from "@repo/api";

import { ClusterConnector } from "./connectors/connector";
import {
  HTTPClusterConnector,
  HTTPClusterConnectorConfig,
} from "./connectors/http";

declare module "fastify" {
  interface FastifyInstance {
    cluster: ClusterConnector;
  }
}

interface ClusterPluginBaseConfig extends FastifyPluginOptions {
  pollingRateMs: number;
}

interface ClusterPluginHttpConfig extends ClusterPluginBaseConfig {
  http: HTTPClusterConnectorConfig;
}

export type ClusterPluginConfig = ClusterPluginHttpConfig;

export const clusterPlugin = fp<ClusterPluginConfig>(
  async (server, options) => {
    let cluster: ClusterConnector<any>;
    if (options.http) {
      cluster = new HTTPClusterConnector(options.http);
    } else throw new Error("No valid config");

    if (!(await cluster.load())) throw new Error("Cannot load cluster");

    server.decorate("cluster", cluster);

    let interval: NodeJS.Timeout | null = null;

    server.addHook("onReady", async () => {
      interval = setInterval(async () => {
        await updateStatus(server.prisma, server.cluster);
      }, options.pollingRateMs);
    });

    server.addHook("onClose", async () => {
      if (interval) clearInterval(interval);
    });
  }
);

async function updateStatus(prisma: PrismaClient, cluster: ClusterConnector) {
  let clusterStatus: ClusterStatus;
  try {
    const status = await cluster.getStatus();
    if (status === null) return;

    clusterStatus = status;
  } catch (e) {
    return;
  }

  const instanceSelect = {
    IID: true,
    tag: true,
    status: true,
    jobs: {
      select: {
        JID: true,
        status: true,
        hashes: {
          select: {
            HID: true,
            hash: true,
            hashType: true,
            status: true,
          },
        },
      },
    },
  } as const;

  const instances = await prisma.instance.findMany({
    select: instanceSelect,
    where: {
      tag: {
        in: Object.keys(clusterStatus.instances),
      },
    },
  });

  const instanceSearch = Object.fromEntries(
    instances.map((instance) => [instance.tag, instance])
  );

  await Promise.all(
    Object.entries(clusterStatus.instances).map(
      async ([instanceTag, instanceStatus]) => {
        let instanceDB = instanceSearch[instanceTag];
        if (instanceDB === undefined) {
          instanceDB = await prisma.instance.create({
            select: instanceSelect,
            data: {
              name: instanceTag,
              tag: instanceTag,
              type: "external",
              status: instanceStatus.status,
            },
          });
        }

        if (instanceDB.status !== instanceStatus.status) {
          await prisma.instance.update({
            where: {
              IID: instanceDB.IID,
            },
            data: {
              status: instanceStatus.status,
              updatedAt: new Date(),
            },
          });
        }

        const jobSearch = Object.fromEntries(
          instanceDB.jobs.map((job) => [job.JID, job])
        );

        await Promise.all(
          Object.entries(instanceStatus.jobs).map(
            async ([jobID, jobStatus]) => {
              const jobDB = jobSearch[jobID];

              // Unsupported external jobs.
              if (jobDB === undefined) return;

              if (jobDB.status !== jobStatus.status) {
                await prisma.job.update({
                  where: {
                    JID: jobDB.JID,
                  },
                  data: {
                    status: jobStatus.status,
                    updatedAt: new Date(),
                  },
                });
              }

              const hashSearch = Object.fromEntries(
                jobDB.hashes.map((hash) => [hash.HID, hash])
              );

              await Promise.all(
                Object.entries(jobStatus.hashes).map(
                  async ([hashID, hashValue]) => {
                    const hashDB = hashSearch[hashID];

                    // Unsupported external hashes.
                    if (hashDB === undefined) return;

                    if (hashDB.status === STATUS.NotFound && hashValue) {
                      await prisma.hash.updateMany({
                        where: {
                          hash: hashDB.hash,
                          hashType: hashDB.hashType,
                        },
                        data: {
                          status: STATUS.Found,
                          value: hashValue,
                          updatedAt: new Date(),
                        },
                      });
                    }
                  }
                )
              );
            }
          )
        );
      }
    )
  );
}
