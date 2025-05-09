import { PrismaClient } from "@prisma/client";
import { type CreateTRPCProxyClient } from "@trpc/client";
import fp from "fastify-plugin";

import { ClusterStatus, STATUS } from "@repo/api";
import type { AppRouter } from "@repo/cluster";

import { trpc } from "./trpc";

type ClusterTRPC = CreateTRPCProxyClient<AppRouter>;

export type ClusterPluginConfig = {
  pollingRateMs: number;
};

export const clusterPlugin = fp<ClusterPluginConfig>(
  async (server, options) => {
    let interval: NodeJS.Timeout | null = null;
    server.addHook("onReady", async () => {
      interval = setInterval(async () => {
        await updateStatus(server.prisma, trpc);
      }, options.pollingRateMs);
    });

    server.addHook("onClose", async () => {
      if (interval) clearInterval(interval);
    });
  }
);

async function updateStatus(prisma: PrismaClient, cluster: ClusterTRPC) {
  let clusterStatus: ClusterStatus;
  try {
    const status = await cluster.info.status.query();
    if (status === null) return;

    clusterStatus = status;
  } catch {
    return;
  }

  try {
    await prisma.$transaction(async (tx) => {
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

      const instances = await tx.instance.findMany({
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
              // Only track new instances if it in a valid state.
              if (
                instanceStatus.status === STATUS.Pending ||
                instanceStatus.status === STATUS.Running
              ) {
                instanceDB = await tx.instance.create({
                  select: instanceSelect,
                  data: {
                    name: instanceTag,
                    tag: instanceTag,
                    type: "external",
                    status: instanceStatus.status,
                  },
                });
              } else return;
            }

            if (instanceDB.status !== instanceStatus.status) {
              await tx.instance.update({
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
                    await tx.job.update({
                      where: {
                        JID: jobDB.JID,
                      },
                      data: {
                        status: jobStatus.status,
                        updatedAt: new Date(),
                      },
                    });
                  }

                  const hashSearch: Record<string, (typeof jobDB)["hashes"]> =
                    {};
                  jobDB.hashes.forEach((hash) => {
                    const entry = hashSearch[hash.hash];
                    if (entry) entry.push(hash);
                    else hashSearch[hash.hash] = [hash];
                  });

                  await Promise.all(
                    Object.entries(jobStatus.hashes).map(
                      async ([hash, plain]) => {
                        const hashDBs = hashSearch[hash];

                        // Unsupported external hashes.
                        if (hashDBs === undefined) return;

                        await Promise.all(
                          hashDBs.map(async (hashDB) => {
                            if (hashDB.status !== STATUS.NotFound) return;

                            await tx.hash.update({
                              where: {
                                HID: hashDB.HID,
                              },
                              data: {
                                status: STATUS.Found,
                                value: plain,
                                updatedAt: new Date(),
                              },
                            });
                          })
                        );
                      }
                    )
                  );
                }
              )
            );
          }
        )
      );
    });
  } catch {
    // ignore error
  }
}
