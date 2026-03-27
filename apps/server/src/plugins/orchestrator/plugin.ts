import { PrismaClient } from "@prisma/client";
import { type CreateTRPCProxyClient } from "@trpc/client";
import fp from "fastify-plugin";

import { STATUS } from "@repo/api";
import type { AppRouter } from "@repo/cluster";
import { NTLM_HASH_TYPE, isShuckableHashType } from "@repo/hashcat/shuck";

import { trpc } from "../cluster/trpc";

type ClusterTRPC = CreateTRPCProxyClient<AppRouter>;

type Hash = {
  HID: string,
  hash: string,
  hashType: number,
  status: string,
};

type Job = {
  JID: string,
  wordlistId: string | null,
  ruleId: string | null,
  instanceType: string | null,
  instanceId: string | null,
  approvalStatus: string,
  attackMode: number,
  mask: string | null,
  cascadeId: string | null,
  cascadeStepIndex: number | null,
  hashes: Hash[],
};

type InstanceResult = {
  IID: string,
  tag: string,
};

export type OrchestratorPluginConfig = {
  pollingRateMs: number;
  maxConcurrent: number;
};

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

const retry = async <T>(fn: () => Promise<T>, attempts: number): Promise<T> => {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (i < attempts - 1) await sleep(1000 * (i + 1));
    }
  }
  throw lastError;
};

async function orchestrateJob(
  prisma: PrismaClient,
  cluster: ClusterTRPC,
  jobID: string
): Promise<boolean> {
  console.log(`[Orchestrator] Starting orchestration for job ${jobID}`);

  // Get job details
  const job = await prisma.job.findUnique({
    where: { JID: jobID },
    select: {
      JID: true,
      wordlistId: true,
      ruleId: true,
      instanceType: true,
      instanceId: true,
      approvalStatus: true,
      attackMode: true,
      mask: true,
      cascadeId: true,
      cascadeStepIndex: true,
      hashes: {
        select: {
          HID: true,
          hash: true,
          hashType: true,
          status: true,
        },
      },
    },
  });

  if (!job) {
    console.error(`[Orchestrator] Job ${jobID} not found`);
    return false;
  }

  if (
    job.approvalStatus !== "APPROVED" &&
    job.approvalStatus !== "ORCHESTRATING"
  ) {
    console.log(
      `[Orchestrator] Job ${jobID} is not approved (status: ${job.approvalStatus})`
    );
    return false;
  }

  const isMaskAttack = (job.attackMode ?? 0) === 3;

  if (
    (!job.instanceType && !job.instanceId) ||
    (!isMaskAttack && !job.wordlistId) ||
    !job.hashes?.length
  ) {
    console.error(`[Orchestrator] Job ${jobID} is missing required fields:`, {
      hasInstanceType: !!job.instanceType,
      instanceType: job.instanceType,
      hasWordlistId: !!job.wordlistId,
      wordlistId: job.wordlistId,
      attackMode: job.attackMode,
      mask: job.mask,
      hasHashes: !!job.hashes?.length,
      hashCount: job.hashes?.length || 0,
      approvalStatus: job.approvalStatus,
    });
    // Mark job as error so it stops being retried
    await prisma.job.update({
      where: { JID: jobID },
      data: {
        status: STATUS.Error,
        rejectionNote: `Job missing required fields: instanceType=${!job.instanceType ? "MISSING" : "OK"}, wordlist=${!isMaskAttack && !job.wordlistId ? "MISSING" : "OK"}, hashes=${!job.hashes?.length ? "MISSING" : "OK"}`,
        updatedAt: new Date(),
      },
    });
    return false;
  }

  let instanceResult: InstanceResult | null = null;

  // ── Pre-flight lookup: resolve hashes from the KnownHash table ──
  const unresolvedHashes = job.hashes.filter(
    (h: { status: string }) => h.status === STATUS.NotFound
  );

  if (unresolvedHashes.length > 0) {
    // Batch lookup: find all known plaintext values for this job's unresolved hashes
    const knownMatches = await prisma.knownHash.findMany({
      where: {
        OR: unresolvedHashes.map((h: { hash: string; hashType: number }) => ({
          hash: h.hash,
          hashType: h.hashType,
        })),
      },
      select: { hash: true, hashType: true, plaintext: true },
    });

    if (knownMatches.length > 0) {
      // Build a lookup map: "hash:hashType" → plaintext
      const knownMap = new Map(
        knownMatches.map(
          (k: { hash: string; hashType: number; plaintext: string }) => [
            `${k.hash}:${k.hashType}`,
            k.plaintext,
          ]
        )
      );

      // Mark matched hashes as FOUND in the database
      let knownCount = 0;
      await Promise.all(
        unresolvedHashes.map(
          async (h: { HID: string; hash: string; hashType: number }) => {
            const plaintext = knownMap.get(`${h.hash}:${h.hashType}`);
            if (plaintext !== undefined) {
              await prisma.hash.update({
                where: { HID: h.HID },
                data: {
                  status: STATUS.Found,
                  value: plaintext,
                  source: "KNOWN",
                  updatedAt: new Date(),
                },
              });
              knownCount++;
            }
          }
        )
      );

      if (knownCount > 0) {
        console.log(
          `[Orchestrator] Pre-flight lookup resolved ${knownCount}/${unresolvedHashes.length} hash(es) for job ${jobID}`
        );
      }

      // Check if ALL hashes are now resolved (original found + newly matched)
      const remainingUnresolved = unresolvedHashes.length - knownCount;
      const alreadyFound = job.hashes.length - unresolvedHashes.length;
      if (remainingUnresolved === 0) {
        console.log(
          `[Orchestrator] All ${job.hashes.length} hash(es) resolved (${alreadyFound} already found, ${knownCount} known) — skipping GPU for job ${jobID}`
        );
        await prisma.job.update({
          where: { JID: jobID },
          data: {
            status: STATUS.Complete,
            approvalStatus: "ORCHESTRATED",
            updatedAt: new Date(),
          },
        });
        return true;
      }
    }
  }

  
  try {
    if (!job.instanceId) {
      instanceResult = await createInstance(prisma, cluster, job);
    } else {
      instanceResult = await prisma.instance.findUnique({
        where: { IID: job.instanceId },
        select: {
          IID: true,
          tag: true,
        }
      });
    }
    if (!instanceResult) {
      throw new Error("[Orchestrator] Was not able to get a instance");
    }
    // Create job folder
    const hashStrings = job.hashes.map((h: { hash: string }) => h.hash);
    const jobHashType = job.hashes[0]?.hashType || 0;

    // ── Shucking: gather NTLM hashes as an NT wordlist for shuckable types ──
    let ntWordlist: string[] | undefined;
    if (isShuckableHashType(jobHashType)) {
      try {
        const ntHashes = await prisma.knownHash.findMany({
          where: { hashType: NTLM_HASH_TYPE },
          select: { hash: true },
        });
        if (ntHashes.length > 0) {
          ntWordlist = ntHashes.map((h: { hash: string }) => h.hash);
          console.log(
            `[Orchestrator] Providing ${ntHashes.length} NT hash(es) for shuck pre-phase on job ${jobID} (hashType=${jobHashType})`
          );
        }
      } catch (e) {
        console.error(
          `[Orchestrator] Failed to query NT hashes for shucking:`,
          e
        );
        // Non-fatal — job will still run without shucking
      }
    }

    console.log(
      `[Orchestrator] Creating job folder for job ${jobID} in instance ${instanceResult!.tag}`
    );
    const ok = await retry(
      () =>
        cluster.instance.createJobWithID.mutate({
          instanceID: instanceResult!.tag,
          jobID,
          wordlistID: job.wordlistId ?? "",
          hashType: jobHashType,
          hashes: hashStrings,
          ruleID: job.ruleId ?? undefined,
          attackMode: job.attackMode ?? undefined,
          mask: job.mask ?? undefined,
          ntWordlist,
        }),
      3
    );

    if (!ok) {
      throw new Error("createJobWithID returned false");
    }
    console.log(`[Orchestrator] Created job folder for job ${jobID}`);

    // Launch instance
    console.log(
      `[Orchestrator] Launching EC2 instance ${instanceResult!.tag} for job ${jobID}`
    );
    await retry(() => cluster.instance.launch.mutate({ instanceID: instanceResult!.tag }), 3);
    console.log(`[Orchestrator] Successfully launched EC2 instance ${instanceResult!.tag}`);

    // Mark orchestration complete so the job won't be picked up again
    await prisma.job.update({
      where: { JID: jobID },
      data: { approvalStatus: "ORCHESTRATED", updatedAt: new Date() },
    });

    return true;
  } catch (e) {
    console.error(`[Orchestrator] Failed to orchestrate job ${jobID}:`, e);

    // Best-effort cleanup
    if (instanceResult!.IID) {
      try {
        await prisma.job.update({
          where: { JID: jobID },
          data: { instanceId: null, updatedAt: new Date() },
        });
        await prisma.instance.delete({ where: { IID: instanceResult!.IID } });
        console.log(`[Orchestrator] Cleaned up instance record ${instanceResult!.IID}`);
      } catch (cleanupError) {
        console.error(
          `[Orchestrator] Cleanup failed for instance ${instanceResult!.IID}:`,
          cleanupError
        );
      }
    }

    if (instanceResult!.tag) {
      try {
        await cluster.instance.deleteMany.mutate({ instanceIDs: [instanceResult!.tag] });
        console.log(`[Orchestrator] Cleaned up instance folder ${instanceResult!.tag}`);
      } catch (cleanupError) {
        console.error(
          `[Orchestrator] Cleanup failed for folder ${instanceResult!.tag}:`,
          cleanupError
        );
      }
    }

    return false;
  }
}

async function createInstance(
  prisma: PrismaClient,
  cluster: ClusterTRPC,
  job: Job): Promise<InstanceResult> {
    // 1. Create instance folder
    console.log(
      `[Orchestrator] Creating instance folder for job ${job.JID} with type ${job.instanceType}`
    );
    let tag: string | null = await retry(
      () =>
        cluster.instance.createFolder.mutate({
          instanceType: job.instanceType!,
        }),
      3
    );
    console.log(`[Orchestrator] Created instance folder with tag: ${tag}`);

    if (!tag) {
      throw new Error("createFolder returned null");
    }

    // 2. Create DB instance record
    const instance = await prisma.instance.create({
      data: {
        name: `Auto-created for job ${job.JID.slice(0, 8)}`,
        tag,
        type: job.instanceType,
        status: STATUS.Pending,
      },
    });
    if (!instance) {
      throw new Error("createInstance returned null");
    }

    console.log(
      `[Orchestrator] Created instance record ${instance.IID} (tag: ${tag})`
    );

    // 3. Link job to instance immediately (prevents sync mismatch)
    await prisma.job.update({
      where: { JID: job.JID },
      data: {
        instanceId: instance.IID,
        updatedAt: new Date(),
      },
    });
    return { IID: instance.IID, tag: tag };
}

async function orchestrateApprovedJobs(
  prisma: PrismaClient,
  cluster: ClusterTRPC,
  maxConcurrent: number
) {
  try {
    // Find approved jobs without instances (excluding jobs already marked as Error)
    const pendingOrchestration = await prisma.job.findMany({
      where: {
        approvalStatus: "APPROVED",
        status: { notIn: [STATUS.Error, STATUS.Stopped] },
      },
      select: { JID: true },
      take: maxConcurrent,
    });

    if (pendingOrchestration.length === 0) return;

    console.log(
      `[Orchestrator] Found ${pendingOrchestration.length} job(s) awaiting orchestration`
    );

    // Atomically claim jobs by setting approvalStatus to ORCHESTRATING.
    // This prevents the next polling cycle from picking them up again if
    // orchestration takes longer than the polling interval.
    const jobIDs = pendingOrchestration.map((j: { JID: string }) => j.JID);
    const claimed = await prisma.job.updateMany({
      where: {
        JID: { in: jobIDs },
        approvalStatus: "APPROVED", // only claim if still APPROVED
        status: { notIn: [STATUS.Error, STATUS.Stopped] },
      },
      data: {
        approvalStatus: "ORCHESTRATING",
        updatedAt: new Date(),
      },
    });

    if (claimed.count === 0) {
      console.log(
        `[Orchestrator] All jobs were claimed by another cycle, skipping`
      );
      return;
    }

    // Re-fetch only the jobs we successfully claimed
    const claimedJobs = await prisma.job.findMany({
      where: {
        JID: { in: jobIDs },
        approvalStatus: "ORCHESTRATING",
      },
      select: { JID: true },
    });

    // Process sequentially to avoid racing for the same resources
    for (const job of claimedJobs) {
      const success = await orchestrateJob(prisma, cluster, job.JID);
      if (!success) {
        // Reset approvalStatus back to APPROVED so it can be retried
        // on the next cycle (unless orchestrateJob marked it as Error)
        const current = await prisma.job.findUnique({
          where: { JID: job.JID },
          select: { status: true, approvalStatus: true },
        });
        if (current && current.status !== STATUS.Error) {
          await prisma.job.update({
            where: { JID: job.JID },
            data: { approvalStatus: "APPROVED", updatedAt: new Date() },
          });
        }
      }
    }
  } catch (e) {
    console.error(`[Orchestrator] Error in orchestration cycle:`, e);
  }
}

export const orchestratorPlugin = fp<OrchestratorPluginConfig>(
  async (server, options) => {
    let interval: NodeJS.Timeout | null = null;
    let cleanupInterval: NodeJS.Timeout | null = null;
    let orchestrating = false;

    server.addHook("onReady", async () => {
      console.log(
        `[Orchestrator] Starting job orchestration worker (polling every ${options.pollingRateMs}ms, max ${options.maxConcurrent} concurrent)`
      );

      interval = setInterval(async () => {
        // Guard: skip if the previous cycle is still running
        if (orchestrating) return;
        orchestrating = true;
        try {
          await orchestrateApprovedJobs(
            server.prisma,
            trpc,
            options.maxConcurrent
          );
        } finally {
          orchestrating = false;
        }
      }, options.pollingRateMs);

      // Periodically clean up stale instance folders (every 5 minutes)
      cleanupInterval = setInterval(
        async () => {
          try {
            const removed = await trpc.instance.cleanupStale.mutate();
            if (removed > 0) {
              console.log(
                `[Orchestrator] Cleaned up ${removed} stale instance folders`
              );
            }
          } catch (e) {
            console.error(`[Orchestrator] Stale instance cleanup failed:`, e);
          }
        },
        5 * 60 * 1000
      );
    });

    server.addHook("onClose", async () => {
      if (interval) {
        clearInterval(interval);
        console.log(`[Orchestrator] Stopped job orchestration worker`);
      }
      if (cleanupInterval) {
        clearInterval(cleanupInterval);
        console.log(`[Orchestrator] Stopped stale instance cleanup worker`);
      }
    });
  }
);
