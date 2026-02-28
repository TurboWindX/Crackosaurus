import { PrismaClient } from "@prisma/client";
import { type CreateTRPCProxyClient } from "@trpc/client";
import crypto from "crypto";
import fp from "fastify-plugin";

import { ClusterStatus, STATUS } from "@repo/api";
import type { JobProgress, Status } from "@repo/api";
import type { AppRouter } from "@repo/cluster";

import { trpc } from "./trpc";

type ClusterTRPC = CreateTRPCProxyClient<AppRouter>;
type TransactionClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

// In-memory cache of job progress (ETA, speed, %). Keyed by JID.
// Updated every sync cycle from the ClusterStatus response.
const jobProgressCache = new Map<string, JobProgress>();

/** Get cached progress for a running job, if available. */
export function getJobProgressCached(jobID: string): JobProgress | undefined {
  return jobProgressCache.get(jobID);
}

/** Get all cached job progress entries. */
export function getAllJobProgress(): ReadonlyMap<string, JobProgress> {
  return jobProgressCache;
}

export type ClusterPluginConfig = {
  pollingRateMs: number;
};

export const clusterPlugin = fp<ClusterPluginConfig>(
  async (server, options) => {
    let interval: NodeJS.Timeout | null = null;
    server.addHook("onReady", async () => {
      interval = setInterval(async () => {
        await updateStatus(server.prisma, trpc);
        // After sync, check if any cascade jobs just completed
        await advanceCascades(server.prisma);
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
    await prisma.$transaction(async (tx: TransactionClient) => {
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
        instances.map((instance: (typeof instances)[number]) => [
          instance.tag,
          instance,
        ])
      );
      /*
      console.log(
        `[Sync] Processing ${instances.length} instances from database`
      );
      console.log(
        `[Sync] Cluster status has ${Object.keys(clusterStatus.instances).length} instances`
      );
      */
      await Promise.all(
        Object.entries(clusterStatus.instances).map(
          async ([instanceTag, instanceStatus]) => {
            let instanceDB = instanceSearch[instanceTag];
            if (instanceDB === undefined) {
              // Check if instance exists in DB but wasn't in our initial query
              // (e.g., instance was just created and EFS folder appeared after query)
              const existing = await tx.instance.findFirst({
                select: instanceSelect,
                where: { tag: instanceTag },
              });

              if (existing) {
                instanceDB = existing;
                instanceSearch[instanceTag] = existing; // Cache it
              } else {
                // Only create new instance record if it's in a valid state.
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

              // If an instance transitions to Stopped or Error, mark any of
              // its still-running/pending jobs as Error so they don't hang
              // in the UI forever.
              if (
                instanceStatus.status === STATUS.Stopped ||
                instanceStatus.status === STATUS.Error
              ) {
                const staleStatuses: Status[] = [STATUS.Running, STATUS.Pending];
                const staleJobs = instanceDB.jobs.filter(
                  (j: { status: string }) =>
                    staleStatuses.includes(j.status as Status)
                );
                if (staleJobs.length > 0) {
                  const staleJIDs = staleJobs.map(
                    (j: { JID: string }) => j.JID
                  );
                  console.log(
                    `[Sync] Instance ${instanceDB.tag} is ${instanceStatus.status} — marking ${staleJIDs.length} stale job(s) as Error: ${staleJIDs.join(", ")}`
                  );
                  await tx.job.updateMany({
                    where: {
                      JID: { in: staleJIDs },
                      status: { in: staleStatuses },
                    },
                    data: {
                      status: STATUS.Error,
                      rejectionNote: `Instance ${instanceStatus.status.toLowerCase()} before job completed`,
                      updatedAt: new Date(),
                    },
                  });
                }
              }
            }

            const jobSearch = Object.fromEntries(
              instanceDB.jobs.map((job: (typeof instanceDB.jobs)[number]) => [
                job.JID,
                job,
              ])
            );

            // Only log if there are jobs or mismatches (reduce log spam)
            const dbJobCount = instanceDB.jobs.length;
            const efsJobCount = Object.keys(instanceStatus.jobs).length;
            if (dbJobCount > 0 || efsJobCount > 0) {
              if (dbJobCount !== efsJobCount) {
                console.log(
                  `[Sync] Instance ${instanceDB.tag} job count mismatch: DB=${dbJobCount}, EFS=${efsJobCount}`
                );
              }
            }

            await Promise.all(
              Object.entries(instanceStatus.jobs).map(
                async ([jobID, jobStatus]) => {
                  const jobDB = jobSearch[jobID];

                  // Unsupported external jobs.
                  if (jobDB === undefined) {
                    // Only log once per job (check if we've seen this before)
                    return;
                  }

                  // Update in-memory progress cache
                  if (jobStatus.progress) {
                    jobProgressCache.set(jobDB.JID, jobStatus.progress);
                  } else if (
                    jobStatus.status !== STATUS.Running &&
                    jobStatus.status !== STATUS.Pending
                  ) {
                    // Remove progress for terminal jobs
                    jobProgressCache.delete(jobDB.JID);
                  }

                  if (jobDB.status !== jobStatus.status) {
                    console.log(
                      `[Sync] Updating job ${jobDB.JID} status: ${jobDB.status} → ${jobStatus.status}`
                    );
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

                  // Build lookup of shucked hashes for source tagging
                  const shuckedHashSet = new Set(jobStatus.shuckedHashes ?? []);

                  const hashSearch: Record<string, (typeof jobDB)["hashes"]> =
                    {};
                  jobDB.hashes.forEach(
                    (hash: (typeof jobDB.hashes)[number]) => {
                      const entry = hashSearch[hash.hash];
                      if (entry) entry.push(hash);
                      else hashSearch[hash.hash] = [hash];
                    }
                  );

                  await Promise.all(
                    Object.entries(jobStatus.hashes).map(
                      async ([hash, plain]) => {
                        const hashDBs = hashSearch[hash];

                        // Unsupported external hashes.
                        if (hashDBs === undefined) return;

                        let didCrack = false;
                        let hashType: number | null = null;

                        await Promise.all(
                          hashDBs.map(
                            async (hashDB: (typeof jobDB.hashes)[number]) => {
                              if (hashDB.status !== STATUS.NotFound) return;

                              const source = shuckedHashSet.has(hash)
                                ? "SHUCKED"
                                : "GPU";

                              await tx.hash.update({
                                where: {
                                  HID: hashDB.HID,
                                },
                                data: {
                                  status: STATUS.Found,
                                  value: plain,
                                  source,
                                  updatedAt: new Date(),
                                },
                              });

                              didCrack = true;
                              hashType = hashDB.hashType;
                            }
                          )
                        );

                        // Auto-learn: store cracked hash→plaintext in KnownHash
                        // so future jobs can resolve it via known hash lookup.
                        if (didCrack && hashType !== null) {
                          try {
                            await tx.knownHash.upsert({
                              where: {
                                hash_hashType: { hash, hashType },
                              },
                              update: {}, // already known — no-op
                              create: {
                                hash,
                                hashType,
                                plaintext: plain,
                              },
                            });
                          } catch {
                            // Ignore unique constraint race — another sync
                            // cycle may have inserted it concurrently.
                          }
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
    });
  } catch {
    // ignore error
  }
}

/**
 * After each sync cycle, check for cascade jobs that just completed and
 * haven't yet spawned their successor step. If remaining NOT_FOUND hashes
 * exist and a next cascade step is defined, create a new job for that step.
 */
async function advanceCascades(prisma: PrismaClient) {
  try {
    // Find completed cascade jobs that haven't yet spawned a successor.
    // A completed cascade job will have cascadeId set and a cascadeStepIndex.
    // We detect "needs advancing" by checking that no sibling job exists at
    // cascadeStepIndex + 1 for the same cascade.
    const completedCascadeJobs = await prisma.job.findMany({
      where: {
        cascadeId: { not: null },
        cascadeStepIndex: { not: null },
        status: { in: [STATUS.Complete, STATUS.Error] },
      },
      select: {
        JID: true,
        cascadeId: true,
        cascadeStepIndex: true,
        status: true,
        hashes: {
          select: {
            HID: true,
            hash: true,
            hashType: true,
            status: true,
          },
        },
        submittedById: true,
      },
    });

    if (completedCascadeJobs.length === 0) return;

    for (const job of completedCascadeJobs) {
      if (!job.cascadeId || job.cascadeStepIndex == null) continue;

      const nextStepIndex = job.cascadeStepIndex + 1;

      // Check if successor job already exists for this cascade at the next step
      const existingNext = await prisma.job.findFirst({
        where: {
          cascadeId: job.cascadeId,
          cascadeStepIndex: nextStepIndex,
        },
        select: { JID: true },
      });

      if (existingNext) continue; // Already advanced

      // Get remaining NOT_FOUND hashes from this job
      const notFoundHashes = job.hashes.filter(
        (h: { HID: string; status: string }) => h.status === STATUS.NotFound
      );

      if (notFoundHashes.length === 0) {
        console.log(
          `[Cascade] Job ${job.JID} (cascade ${job.cascadeId} step ${job.cascadeStepIndex}) completed with all hashes found — cascade done`
        );
        continue;
      }

      // If the job errored, don't advance - let the user decide
      if (job.status === STATUS.Error) {
        console.log(
          `[Cascade] Job ${job.JID} (cascade ${job.cascadeId} step ${job.cascadeStepIndex}) errored — not advancing`
        );
        continue;
      }

      // Get the next cascade step definition
      const nextStep = await prisma.cascadeStep.findUnique({
        where: {
          cascadeId_order: {
            cascadeId: job.cascadeId,
            order: nextStepIndex,
          },
        },
        select: {
          attackMode: true,
          wordlistId: true,
          ruleId: true,
          mask: true,
          instanceType: true,
        },
      });

      if (!nextStep) {
        console.log(
          `[Cascade] Job ${job.JID} (cascade ${job.cascadeId} step ${job.cascadeStepIndex}) — no more cascade steps. ${notFoundHashes.length} hash(es) remain uncracked.`
        );
        continue;
      }

      // Determine instance type: step override > first hash's job instanceType
      const instanceType = nextStep.instanceType ?? "g5.xlarge";

      // Create the next job with remaining hashes
      const JID = crypto.randomUUID();
      console.log(
        `[Cascade] Advancing cascade ${job.cascadeId}: step ${job.cascadeStepIndex} → ${nextStepIndex} with ${notFoundHashes.length} remaining hash(es), job ${JID}`
      );

      await prisma.job.create({
        data: {
          JID,
          wordlistId: nextStep.wordlistId ?? null,
          ruleId: nextStep.ruleId ?? null,
          instanceId: null,
          hashes: {
            connect: notFoundHashes.map((h: { HID: string }) => ({
              HID: h.HID,
            })),
          },
          approvalStatus: "APPROVED", // Auto-approve cascade continuations
          instanceType,
          attackMode: nextStep.attackMode,
          mask: nextStep.mask ?? null,
          cascadeId: job.cascadeId,
          cascadeStepIndex: nextStepIndex,
          submittedById: job.submittedById,
        },
      });
    }
  } catch (e) {
    console.error("[Cascade] Error advancing cascades:", e);
  }
}
