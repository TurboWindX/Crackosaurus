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

// Job statuses the DB treats as final. Once a job reaches one of these, the DB
// is authoritative and a (possibly stale) cluster report must NOT move it back
// to a live state. Notably, a user cancel sets STOPPED (jobRouter.cancel) while
// the worker may keep reporting RUNNING for a poll cycle or two — without this
// guard the sync would resurrect the cancelled job. COMPLETE/ERROR are final
// for the same reason.
const JOB_TERMINAL_STATUSES: readonly Status[] = [
  STATUS.Stopped,
  STATUS.Complete,
  STATUS.Error,
];

// Instance statuses the DB treats as final. Once an instance reaches one of
// these it must NOT be moved back to a live state by a (possibly stale) cluster
// report — the same DB-authoritative rule the jobs already follow via
// JOB_TERMINAL_STATUSES. Without this, a just-reaped STOPPED instance can be
// resurrected to RUNNING when a second cluster replica (rolling ECS deploy, or
// a 2-replica prod config) serves the next info.status.query off an NFS
// directory cache still listing the now-deleted folder frozen at RUNNING.
const INSTANCE_TERMINAL_STATUSES: readonly Status[] = [
  STATUS.Stopped,
  STATUS.Complete,
  STATUS.Error,
];

// Instance states the reaper considers "should be backed by a live box". An
// instance sitting in one of these with NO live EC2 box (per the cluster's
// authoritative liveInstanceIDs) is dead — a pre-reconciler zombie, or a box
// that crashed / was terminated out of band — and gets stopped.
const REAPABLE_STATUSES: readonly Status[] = [
  STATUS.Running,
  STATUS.Pending,
  STATUS.Unknown,
];

// Only reap instances not touched within this window. A freshly created
// instance can sit Pending/Running for a few minutes before its EC2 box appears
// in describeInstances (Step Functions start → runInstances latency), and a
// capacity-parked launch legitimately has no box between backoff attempts —
// but those attempts resolve well within this window (or flip to a terminal
// ERROR the reaper ignores). Keying on updatedAt keeps both cases safe from a
// premature reap.
const INSTANCE_REAP_GRACE_MS = 30 * 60 * 1000; // 30 min

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
    // Re-entrancy guard: setInterval does not await the async callback, so a
    // cycle that runs longer than pollingRateMs would otherwise overlap the
    // next tick and let two advanceCascades run concurrently. Mirrors the
    // orchestrator plugin's `if (orchestrating) return` guard.
    let syncing = false;
    server.addHook("onReady", async () => {
      interval = setInterval(async () => {
        if (syncing) return;
        syncing = true;
        try {
          // Reconcile in-flight EC2 launches BEFORE syncing status: an instance
          // the reconciler just parked (→ Pending) or terminally failed
          // (→ Error) is then picked up by the same updateStatus pass, so the
          // DB and UI reflect it immediately (Error propagates to its jobs).
          // Best-effort — a reconcile failure (non-AWS cluster, transient RPC
          // error) must not block the status sync.
          try {
            const r = await trpc.instance.reconcileLaunches.mutate();
            if (r.parked.length > 0 || r.errored.length > 0) {
              console.log(
                `[Sync] reconcileLaunches: parked ${r.parked.length}, errored ${r.errored.length}`
              );
            }
          } catch (e) {
            console.error("[Sync] reconcileLaunches failed:", e);
          }

          await updateStatus(server.prisma, trpc);
          // Stop DB instances whose EC2 box is gone (authoritative EC2 check).
          // Runs AFTER updateStatus so it acts on the freshest DB state; it
          // clears each dead instance's EFS folder before marking it Stopped so
          // the NEXT updateStatus can't resurrect it from a frozen folder.
          // Best-effort — a reaper failure must not block cascade advancement.
          try {
            await reapDeadInstances(server.prisma, trpc);
          } catch (e) {
            console.error("[Reaper] reapDeadInstances failed:", e);
          }
          // After sync, check if any cascade jobs just completed
          await advanceCascades(server.prisma);
        } finally {
          syncing = false;
        }
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

            if (
              instanceDB.status !== instanceStatus.status &&
              !INSTANCE_TERMINAL_STATUSES.includes(instanceDB.status as Status)
            ) {
              // updateMany + a DB-authoritative terminal guard (mirrors the job
              // write below). The instanceDB snapshot was taken before this
              // pass; a concurrent replica may have written a terminal status
              // (e.g. the reaper just marked it STOPPED) since. Filtering on the
              // persisted status makes that terminal status win (0 rows matched)
              // instead of being resurrected to a live state.
              const updated = await tx.instance.updateMany({
                where: {
                  IID: instanceDB.IID,
                  status: { notIn: [...INSTANCE_TERMINAL_STATUSES] },
                },
                data: {
                  status: instanceStatus.status,
                  updatedAt: new Date(),
                },
              });

              // If an instance transitions to Stopped or Error, mark any of
              // its still-running/pending jobs as Error so they don't hang
              // in the UI forever. Only cascade when we actually flipped the
              // instance (count > 0) — a guarded no-op must not force-Error
              // jobs off a stale snapshot.
              if (
                updated.count > 0 &&
                (instanceStatus.status === STATUS.Stopped ||
                  instanceStatus.status === STATUS.Error)
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

                  // Never overwrite a terminal DB status with a live cluster
                  // report — e.g. a job the user just cancelled (STOPPED) that
                  // the worker still reports as RUNNING until it sees the stop.
                  if (
                    jobDB.status !== jobStatus.status &&
                    !JOB_TERMINAL_STATUSES.includes(jobDB.status as Status)
                  ) {
                    console.log(
                      `[Sync] Updating job ${jobDB.JID} status: ${jobDB.status} → ${jobStatus.status}`
                    );
                    // updateMany + a DB-authoritative terminal guard, NOT a
                    // plain update({where:{JID}}). The jobDB snapshot was taken
                    // (line ~126) BEFORE the instance force-Error block above,
                    // which may have written ERROR to THIS row earlier in the
                    // same transaction. The stale snapshot still reads a live
                    // status, so a plain update would clobber that ERROR back to
                    // a live status and strand the job forever. Filtering on the
                    // persisted status makes the just-written terminal status
                    // win (0 rows matched) instead of being resurrected.
                    await tx.job.updateMany({
                      where: {
                        JID: jobDB.JID,
                        status: { notIn: [...JOB_TERMINAL_STATUSES] },
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
                              // Backfill plaintext: a submit-time row may already
                              // exist with plaintext "" (saved before any crack).
                              // A real crack must fill it, else the shuck /
                              // known-lookup phases never learn the plaintext.
                              // Idempotent — `plain` is the correct plaintext.
                              update: { plaintext: plain },
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
 * Stop DB instances that have no live EC2 box behind them.
 *
 * The cluster is authoritative for liveness: liveInstanceIDs returns the set of
 * instanceIDs currently backed by a running/pending EC2 box, or null if it
 * cannot tell (non-cloud cluster, or a transient EC2 API error). On null we do
 * NOTHING — never a false mass-stop on an unknown answer.
 *
 * For each non-terminal DB instance (older than the grace window) whose tag is
 * absent from the live set, we mark the instance STOPPED and force-Error its
 * still-live jobs — the same treatment updateStatus gives an instance that
 * stops on its own. STOPPED is recoverable: the row survives, visible via the
 * "show terminated" toggle.
 *
 * We deliberately do NOT terminate EC2 or delete the EFS folder here:
 *   • Termination — the reaper only ever touches instances with NO live box, so
 *     there is nothing legitimate to terminate. Keeping the terminate path would
 *     only add blast radius: a describeInstances that succeeds-but-empty (tag /
 *     region drift) would classify healthy boxes as dead and kill them. Dropping
 *     it makes the worst-case misconfig outcome a recoverable status change, not
 *     an irreversible fleet wipe. Explicit user deletes still terminate.
 *   • Resurrection — a folder frozen at RUNNING no longer needs clearing to stay
 *     dead: updateStatus now refuses to move an instance out of a terminal
 *     status (INSTANCE_TERMINAL_STATUSES guard), so the STOPPED write sticks.
 *
 * This clears the pre-reconciler zombies (instances stuck non-terminal for
 * months with no box) from the default listing and prevents recurrence for any
 * future box that vanishes.
 */
async function reapDeadInstances(prisma: PrismaClient, cluster: ClusterTRPC) {
  // 1) Ask the cluster which instanceIDs have a live EC2 box. null = unknown.
  let live: string[] | null;
  try {
    live = await cluster.instance.liveInstanceIDs.query();
  } catch (e) {
    console.error("[Reaper] liveInstanceIDs query failed:", e);
    return;
  }
  if (live === null) return;
  const liveSet = new Set(live);

  // 2) Candidate DB instances: non-terminal and untouched past the grace window.
  const cutoff = new Date(Date.now() - INSTANCE_REAP_GRACE_MS);
  const candidates = await prisma.instance.findMany({
    select: {
      IID: true,
      tag: true,
      jobs: { select: { JID: true, status: true } },
    },
    where: {
      status: { in: [...REAPABLE_STATUSES] },
      updatedAt: { lt: cutoff },
    },
  });

  const dead = candidates.filter(
    (inst: { tag: string }) => !liveSet.has(inst.tag)
  );
  if (dead.length === 0) return;

  // Defense-in-depth signal for Finding 2: a live set that is empty while the DB
  // still holds candidate instances is the shape a misconfig (tag / region /
  // account drift making describeInstances succeed-but-empty) produces. It is
  // ALSO the legitimate steady state once every box is genuinely gone (the
  // pre-reconciler zombie cleanup), so we still proceed — but marking STOPPED is
  // recoverable, and this warning surfaces the drift for an operator to catch.
  if (liveSet.size === 0) {
    console.warn(
      `[Reaper] live EC2 set is EMPTY while ${dead.length} candidate instance(s) exist — ` +
        `expected when all boxes are genuinely gone, but also the signature of a ` +
        `tag/region/credential misconfig. Proceeding (STOPPED is recoverable).`
    );
  }

  console.log(
    `[Reaper] ${dead.length} non-terminal instance(s) have no live EC2 box — stopping: ${dead
      .map((d: { tag: string }) => d.tag)
      .join(", ")}`
  );

  // 3) Mark the dead instances STOPPED and force-Error their live jobs, in one
  //    transaction so a partial failure rolls back and is retried next cycle.
  try {
    await prisma.$transaction(async (tx: TransactionClient) => {
      for (const inst of dead) {
        await tx.instance.update({
          where: { IID: inst.IID },
          data: { status: STATUS.Stopped, updatedAt: new Date() },
        });

        const staleStatuses: Status[] = [STATUS.Running, STATUS.Pending];
        const staleJIDs = inst.jobs
          .filter((j: { status: string }) =>
            staleStatuses.includes(j.status as Status)
          )
          .map((j: { JID: string }) => j.JID);
        if (staleJIDs.length > 0) {
          await tx.job.updateMany({
            where: { JID: { in: staleJIDs }, status: { in: staleStatuses } },
            data: {
              status: STATUS.Error,
              rejectionNote: "Instance had no live EC2 box (reaped as dead)",
              updatedAt: new Date(),
            },
          });
        }
      }
    });
  } catch (e) {
    console.error("[Reaper] Failed to mark dead instances stopped:", e);
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

      // Check if THIS job already spawned a successor. Keying on parentJobId
      // rather than (cascadeId, cascadeStepIndex) is essential for correctness:
      // a cascade step spawns one job per hash type (requestJobsForHashes groups
      // by hashType), and each sibling must advance its own not-found hashes
      // independently. The old (cascadeId, stepIndex) key made the first sibling
      // to complete block all the others — their hashes were silently abandoned.
      const existingNext = await prisma.job.findFirst({
        where: { parentJobId: job.JID },
        select: { JID: true },
      });

      if (existingNext) continue; // This job already advanced

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

      // The check-then-create above (existingNext) is safe in steady state: the
      // server runs single-replica (cdk server.json desiredCount=1, no server
      // autoscaling) and the poll is wrapped in a re-entrancy guard (see
      // clusterPlugin `syncing`), so advanceCascades never overlaps itself.
      // Residual gap: during a rolling ECS deploy the old and new tasks run
      // concurrently for a few seconds, and this findFirst→create is lock-free,
      // so a cascade completing inside that window could be advanced twice. A
      // DB-level unique on (cascadeId, cascadeStepIndex) is NOT the fix — a
      // single cascade step legitimately spawns one job per hash type (jobRouter
      // splits hashes by type), so multiple jobs share that pair. Closing the
      // deploy-window race would need an advisory lock / SELECT … FOR UPDATE or
      // a partial unique that also keys on hash type.
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
          parentJobId: job.JID, // tracks which sibling spawned this successor
          submittedById: job.submittedById,
        },
      });
    }
  } catch (e) {
    console.error("[Cascade] Error advancing cascades:", e);
  }
}
