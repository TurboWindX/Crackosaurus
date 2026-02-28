import * as AWS from "aws-sdk";
import { type ChildProcess, execSync, spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import process from "process";

import { STATUS } from "@repo/api";
import type { JobProgress } from "@repo/api";
import {
  type JobMetadata,
  createInstanceFolder,
  getInstanceFolderJobs,
  getInstanceMetadata,
  getJobFolderPath,
  getJobHashPath,
  getJobMetadata,
  getJobNtWordlistPath,
  getJobOutputPath,
  scheduleTempFileCleanup,
  writeInstanceMetadata,
  writeJobMetadata,
  writeJobProgress,
  writeJobStatus,
  writeNtlmv1Results,
  writeShuckResults,
} from "@repo/filesystem/cluster";
import { getRulePath, getWordlistPath } from "@repo/filesystem/wordlist";
import { parseHashcatPot } from "@repo/hashcat/data";
import { hashcat } from "@repo/hashcat/exe";
import {
  DES_BRUTE_FORCE_MASK,
  DES_FULL_CHARSET,
  batchNtlmv1ToDes,
  isNtlmv1HashType,
  processDesResults,
} from "@repo/hashcat/ntlmv1";
import { SHUCK_POT_FILE, getShuckMode } from "@repo/hashcat/shuck";

import config from "./config";

// Log environment variables for debugging
console.log(`[DEBUG] INSTANCE_ID env var: ${process.env.INSTANCE_ID}`);
console.log(`[DEBUG] INSTANCE_TYPE env var: ${process.env.INSTANCE_TYPE}`);
console.log(`[DEBUG] config.instanceID: ${config.instanceID}`);
console.log(`[DEBUG] config.instanceType: ${config.instanceType}`);

const EXIT_CASES = [0, 1, 2] as const;
type ExitCase = (typeof EXIT_CASES)[number];

const EXIT_CASE = {
  Stop: EXIT_CASES[0],
  Error: EXIT_CASES[1],
  Cooldown: EXIT_CASES[2],
} as const;

// ---------------------------------------------------------------------------
// NTLMv1 → DES pre-processing
// ---------------------------------------------------------------------------

interface Ntlmv1PreprocessResult {
  desHashFile: string;
  charsetFile: string;
  /** The original NTLMv1 hashes (for post-processing) */
  originalHashes: string[];
  /** The batch conversion data */
  conversionData: ReturnType<typeof batchNtlmv1ToDes>;
}

/**
 * Pre-process NTLMv1 hashes for a job: convert to DES pairs, write
 * temporary files for hashcat mode 14000, and return metadata needed
 * for post-processing after cracking.
 */
function preprocessNtlmv1Job(
  jobDir: string,
  hashesFile: string
): Ntlmv1PreprocessResult {
  const rawHashes = fs
    .readFileSync(hashesFile, "utf-8")
    .trim()
    .split("\n")
    .filter(Boolean);

  console.log(
    `[NTLMv1] Converting ${rawHashes.length} NTLMv1 hash(es) to DES pairs`
  );

  const conversionData = batchNtlmv1ToDes(rawHashes);

  console.log(
    `[NTLMv1] Generated ${conversionData.desLines.length} unique DES pair(s) from ${rawHashes.length} NTLMv1 hash(es)`
  );

  // Write DES hashes file
  const desHashFile = path.join(jobDir, "des-hashes.txt");
  fs.writeFileSync(
    desHashFile,
    conversionData.desLines.join("\n") + "\n",
    "utf-8"
  );

  // Write DES_full charset file
  const charsetFile = path.join(jobDir, "des-charset.hcchr");
  fs.writeFileSync(charsetFile, DES_FULL_CHARSET, "utf-8");

  return {
    desHashFile,
    charsetFile,
    originalHashes: rawHashes,
    conversionData,
  };
}

/**
 * Post-process a completed DES cracking job: read cracked DES keys,
 * reassemble NTLM hashes, and write ntlmv1-results.json.
 */
function postprocessNtlmv1Job(
  instanceRoot: string,
  instanceID: string,
  jobID: string,
  preprocess: Ntlmv1PreprocessResult
): void {
  const potPath = getJobOutputPath(instanceRoot, instanceID, jobID);

  let crackedEntries: Record<string, string> = {};
  if (fs.existsSync(potPath)) {
    crackedEntries = parseHashcatPot(fs.readFileSync(potPath, "utf-8"));
  }

  const crackedDesKeys = new Map(Object.entries(crackedEntries));

  console.log(
    `[NTLMv1] Post-processing: ${crackedDesKeys.size} cracked DES pair(s)`
  );

  const results = processDesResults(
    preprocess.conversionData.conversions,
    crackedDesKeys
  );

  // Build the results map: originalNtlmv1Hash → recoveredNtlmHash
  const resultsMap: Record<string, string> = {};
  let recoveredCount = 0;

  for (const result of results) {
    if (result.ntlmHash) {
      resultsMap[result.originalHash] = result.ntlmHash;
      recoveredCount++;
    }
  }

  console.log(
    `[NTLMv1] Recovered ${recoveredCount}/${results.length} NTLM hash(es) from DES keys`
  );

  // Write results file that the cluster sync will read
  writeNtlmv1Results(instanceRoot, instanceID, jobID, resultsMap);
}

// ---------------------------------------------------------------------------
// Hash Shucking — NT-candidate pre-phase
// ---------------------------------------------------------------------------

/**
 * Run a shuck pre-phase: use NT hashes as a wordlist in hashcat's
 * NT-candidate mode to strip the outer cryptographic layer.
 *
 * Returns the set of target hashes that were shucked (so they can be
 * removed from the main hashcat input to avoid duplicate work).
 */
function runShuckPrePhase(
  instanceRoot: string,
  instanceID: string,
  jobID: string,
  hashType: number
): Set<string> {
  const shuckedTargets = new Set<string>();
  const ntMode = getShuckMode(hashType);
  if (ntMode === null) return shuckedTargets;

  const ntWordlistPath = getJobNtWordlistPath(instanceRoot, instanceID, jobID);
  if (!fs.existsSync(ntWordlistPath)) return shuckedTargets;

  const ntLines = fs
    .readFileSync(ntWordlistPath, "utf-8")
    .trim()
    .split("\n")
    .filter(Boolean);
  if (ntLines.length === 0) return shuckedTargets;

  console.log(
    `[Shuck] [Job ${jobID}] Starting shuck pre-phase: ${ntLines.length} NT hash(es) as wordlist, NT mode ${ntMode}`
  );

  const jobDir = getJobFolderPath(instanceRoot, instanceID, jobID);
  const hashFile = getJobHashPath(instanceRoot, instanceID, jobID);
  const shuckPotPath = path.join(jobDir, SHUCK_POT_FILE);

  // Run hashcat synchronously (shuck pass is fast; NT-candidate mode
  // is dictionary-only with no rules/masks, so it completes quickly).
  const args: string[] = [
    "-a",
    "0", // dictionary attack
    "-m",
    ntMode.toString(), // NT-candidate mode
    "-O", // optimized kernels
    "--potfile-disable",
    "-o",
    shuckPotPath, // output pot
    hashFile, // target hashes
    ntWordlistPath, // NT hash wordlist
  ];

  console.log(
    `[Shuck] [Job ${jobID}] Running: ${config.hashcatPath} ${args.join(" ")}`
  );

  try {
    const result = spawnSync(config.hashcatPath, args, {
      cwd: jobDir,
      timeout: 5 * 60 * 1000, // 5 minute timeout
      stdio: "pipe",
      encoding: "utf-8",
    });

    if (result.stdout)
      console.log(`[Shuck] [Job ${jobID}] STDOUT:`, result.stdout.trim());
    if (result.stderr)
      console.error(`[Shuck] [Job ${jobID}] STDERR:`, result.stderr.trim());

    // Exit code 0 = all cracked, 1 = exhausted, both are success
    if (result.status !== 0 && result.status !== 1) {
      console.error(
        `[Shuck] [Job ${jobID}] Hashcat exited with code ${result.status} — skipping shuck phase`
      );
      return shuckedTargets;
    }
  } catch (e) {
    console.error(`[Shuck] [Job ${jobID}] Shuck pre-phase failed:`, e);
    return shuckedTargets;
  }

  // Read the shuck pot file: target_hash:nt_hash
  if (!fs.existsSync(shuckPotPath)) {
    console.log(`[Shuck] [Job ${jobID}] No shuck results — no matches found`);
    return shuckedTargets;
  }

  const potEntries = parseHashcatPot(fs.readFileSync(shuckPotPath, "utf-8"));
  const matchCount = Object.keys(potEntries).length;

  if (matchCount === 0) {
    console.log(`[Shuck] [Job ${jobID}] Shuck pot empty — no NT hash matched`);
    return shuckedTargets;
  }

  console.log(
    `[Shuck] [Job ${jobID}] Shucked ${matchCount} hash(es) — writing results`
  );

  // Build results: the pot maps target_hash → matched_nt_hash.
  // For the "results" field, the plaintext IS the NT hash (shucking
  // proves reuse, it doesn't recover plaintext from the outer layer).
  // For "shuckedNtHashes" we store the same mapping for audit.
  const results: Record<string, string> = {};
  const shuckedNtHashes: Record<string, string> = {};

  for (const [targetHash, ntHash] of Object.entries(potEntries)) {
    results[targetHash] = ntHash; // value = matched NT hash
    shuckedNtHashes[targetHash] = ntHash;
    shuckedTargets.add(targetHash);
  }

  writeShuckResults(instanceRoot, instanceID, jobID, results, shuckedNtHashes);

  return shuckedTargets;
}

// Track NTLMv1 pre-processing data per job for post-processing
const ntlmv1PreprocessData = new Map<string, Ntlmv1PreprocessResult>();

async function innerMain(): Promise<ExitCase> {
  // eslint-disable-next-line no-async-promise-executor
  return new Promise(async (resolve) => {
    let instanceMetadata = await getInstanceMetadata(
      config.instanceRoot,
      config.instanceID
    );
    console.log(
      `[DEBUG] Initial instance metadata status: ${instanceMetadata.status}`
    );

    if (instanceMetadata.status === STATUS.Stopped) resolve(EXIT_CASE.Stop);
    else if (instanceMetadata.status === STATUS.Pending) {
      console.log(`[DEBUG] Instance is PENDING, setting to RUNNING`);
      instanceMetadata.status = STATUS.Running;

      // Fetch EC2 instance ID from instance metadata service
      try {
        const ec2Metadata = new AWS.MetadataService();
        const ec2InstanceId = await new Promise<string>((resolve, reject) => {
          ec2Metadata.request("/latest/meta-data/instance-id", (err, data) => {
            if (err) reject(err);
            else resolve(data);
          });
        });
        instanceMetadata.ec2InstanceId = ec2InstanceId;
        console.log(`[DEBUG] Fetched EC2 instance ID: ${ec2InstanceId}`);
      } catch (e) {
        console.error(`[DEBUG] Failed to fetch EC2 instance ID:`, e);
      }

      await writeInstanceMetadata(
        config.instanceRoot,
        config.instanceID,
        instanceMetadata
      );
    } else if (instanceMetadata.status === STATUS.Unknown) {
      console.log(`[DEBUG] Instance is UNKNOWN, creating instance folder`);

      // No metadata file found — create the instance folder from scratch
      await createInstanceFolder(config.instanceRoot, config.instanceID, {
        type: config.instanceType,
      });
      console.log(
        `[DEBUG] Instance folder created with type: ${config.instanceType}`
      );

      instanceMetadata = await getInstanceMetadata(
        config.instanceRoot,
        config.instanceID
      );
      console.log(
        `[DEBUG] New instance metadata status: ${instanceMetadata.status}`
      );
    } else {
      console.log(
        `[DEBUG] Instance status is ${instanceMetadata.status}, proceeding to job scan`
      );
    }

    let jobID: string | null = null;
    let jobProcess: ChildProcess | null = null;
    let currentJobRetryCount = 0;
    const jobQueue: { jobID: string; retryCount: number }[] = [];

    // Instead of SQS we scan the instance job folder on disk and pick up any
    // pending jobs. This relies on atomic job creation (temp -> rename) to
    // avoid races.
    const scanJobsOnDisk = async () => {
      try {
        const jobs = await getInstanceFolderJobs(
          config.instanceRoot,
          config.instanceID
        );
        for (const jid of jobs) {
          // Skip if already queued
          if (jobQueue.some((j) => j.jobID === jid)) continue;
          try {
            const meta = await getJobMetadata(
              config.instanceRoot,
              config.instanceID,
              jid
            );
            if (meta.status === STATUS.Pending) {
              jobQueue.push({ jobID: jid, retryCount: 0 });
            }
          } catch {
            // Ignore missing/invalid metadata; job processing loop will retry
          }
        }
      } catch (e) {
        console.error(
          `[Instance ${config.instanceID}] Failed scanning jobs:`,
          e
        );
      }
    };

    // Do an initial scan of jobs already present on disk (in case they were
    // created before the instance agent started).
    await scanJobsOnDisk();

    // Start periodic cleanup of stale temp files created by atomic writers.
    // Only clean this instance's folder, not the entire instanceRoot (which
    // has thousands of folders on shared EFS).
    const instanceFolder = `${config.instanceRoot}/${config.instanceID}`;
    void scheduleTempFileCleanup(
      instanceFolder,
      10 * 60 * 1000,
      10 * 60 * 1000
    );

    console.log(
      `[Instance ${config.instanceID}] Job scan complete. Queue length: ${jobQueue.length}. Starting polling loop (interval=${config.instanceInterval}s, cooldown=${config.instanceCooldown}s)`
    );

    let lastRun = new Date().getTime();
    let hasProcessedAnyJob = false; // Track if we've ever processed a job

    const interval = setInterval(async () => {
      // Scan EFS for new job folders
      await scanJobsOnDisk();

      // Check for instance status updates
      instanceMetadata = await getInstanceMetadata(
        config.instanceRoot,
        config.instanceID
      );

      if (instanceMetadata.status === STATUS.Stopped)
        return resolve(EXIT_CASE.Stop);
      else if (instanceMetadata.status === STATUS.Error)
        return resolve(EXIT_CASE.Error);

      if (jobID === null) {
        const nextJob = jobQueue.shift();
        if (nextJob === undefined) {
          // No jobs available - check cooldown
          const effectiveCooldown = hasProcessedAnyJob
            ? config.instanceCooldown
            : 120; // 2 minutes if no jobs processed yet
          const timeWaited = Math.floor(
            (new Date().getTime() - lastRun) / 1000
          );

          if (timeWaited % 10 === 0) {
            // Log every 10 seconds
            console.log(
              `[Instance ${config.instanceID}] No jobs found. Waiting ${timeWaited}s/${effectiveCooldown}s before shutdown (hasProcessedAnyJob: ${hasProcessedAnyJob})`
            );
          }

          if (
            effectiveCooldown >= 0 &&
            new Date().getTime() - lastRun > effectiveCooldown * 1000
          ) {
            instanceMetadata.status = STATUS.Stopped;
            await writeInstanceMetadata(
              config.instanceRoot,
              config.instanceID,
              instanceMetadata
            );
            console.log(
              `[Instance ${config.instanceID}] Cooldown complete (waited ${effectiveCooldown}s, hasProcessedAnyJob: ${hasProcessedAnyJob}) - shutting down`
            );
            clearInterval(interval);
            resolve(EXIT_CASE.Cooldown);
          }
          return;
        } else {
          lastRun = new Date().getTime();
          hasProcessedAnyJob = true;
        }
        jobID = nextJob.jobID;
        // Keep retryCount tracked separately — don't push back into queue
        currentJobRetryCount = nextJob.retryCount;
      }

      console.log(
        `[Instance ${config.instanceID}] [DEBUG] jobID=${jobID}, jobProcess=${jobProcess ? "exists" : "null"}`
      );

      if (jobID && jobProcess === null) {
        console.log(
          `[Instance ${config.instanceID}] [DEBUG] Starting to process job ${jobID}`
        );
        console.log(
          `[Instance ${config.instanceID}] [DEBUG] Instance root: ${config.instanceRoot}`
        );
        console.log(
          `[Instance ${config.instanceID}] [DEBUG] Looking for job at: ${config.instanceRoot}/${config.instanceID}/jobs/${jobID}/metadata.json`
        );
        const jobMetadata = await getJobMetadata(
          config.instanceRoot,
          config.instanceID,
          jobID
        );

        console.log(
          `[Instance ${config.instanceID}] [DEBUG] Job metadata: ${JSON.stringify(jobMetadata)}`
        );
        console.log(
          `[Instance ${config.instanceID}] [DEBUG] Job metadata status: ${jobMetadata.status}, STATUS.Pending=${STATUS.Pending}`
        );

        // Validate that job's instanceType matches this instance's type (defense in depth)
        if (
          jobMetadata.instanceType &&
          jobMetadata.instanceType !== instanceMetadata.type
        ) {
          console.error(
            `[Instance ${config.instanceID}] [Job ${jobID}] Job requires instanceType '${jobMetadata.instanceType}' but this instance is type '${instanceMetadata.type}'. Skipping job.`
          );
          jobID = null;
          return;
        }

        // If status is UNKNOWN, the job folder might not be visible yet (EFS propagation delay)
        // Put job back in queue and try again next interval, up to maxRetries
        if (jobMetadata.status === STATUS.Unknown) {
          currentJobRetryCount++;
          const maxRetries = 5;
          if (currentJobRetryCount < maxRetries) {
            console.log(
              `[Instance ${config.instanceID}] [DEBUG] Job metadata not ready yet (attempt ${currentJobRetryCount}/${maxRetries}), putting back in queue`
            );
            jobQueue.unshift({ jobID, retryCount: currentJobRetryCount });
            jobID = null;
            currentJobRetryCount = 0;
            return;
          } else {
            console.log(
              `[Instance ${config.instanceID}] [DEBUG] Job metadata still not ready after ${maxRetries} attempts, marking as Error`
            );
            // Write error status so this job doesn't get retried forever
            const errorMeta: JobMetadata = { ...jobMetadata, status: STATUS.Error };
            try {
              await writeJobMetadata(
                config.instanceRoot,
                config.instanceID,
                jobID,
                errorMeta
              );
            } catch {
              /* ignore write failure for unknown jobs */
            }
            jobID = null;
            currentJobRetryCount = 0;
            return;
          }
        }

        if (jobMetadata.status !== STATUS.Pending) {
          console.log(
            `[Instance ${config.instanceID}] [DEBUG] Skipping job - status is ${jobMetadata.status}`
          );
          jobID = null;
          return;
        }

        jobMetadata.status = STATUS.Running;

        console.log(`[Instance ${config.instanceID}] [Job ${jobID}] Started`);

        await writeJobMetadata(
          config.instanceRoot,
          config.instanceID,
          jobID,
          jobMetadata
        );

        const isMaskAttack = (jobMetadata.attackMode ?? 0) === 3;
        const ntlmv1Mode = isNtlmv1HashType(jobMetadata.hashType);

        // ── Shuck pre-phase: use NT hashes as wordlist in NT-candidate mode ──
        // This runs before the main hashcat job and strips any outer-layer
        // hashes that match known NTLM hashes. Shucked hashes are removed
        // from the input file so hashcat doesn't re-crack them.
        let shuckedTargets: Set<string> | undefined;
        try {
          shuckedTargets = runShuckPrePhase(
            config.instanceRoot,
            config.instanceID,
            jobID,
            jobMetadata.hashType
          );
        } catch (e) {
          console.error(
            `[Instance ${config.instanceID}] [Job ${jobID}] Shuck pre-phase error (non-fatal):`,
            e
          );
        }

        // If the shuck phase resolved some hashes, remove them from the input
        // file so the main hashcat run only attacks the remaining ones.
        if (shuckedTargets && shuckedTargets.size > 0) {
          const hashFilePath = getJobHashPath(
            config.instanceRoot,
            config.instanceID,
            jobID
          );
          const allHashes = fs
            .readFileSync(hashFilePath, "utf-8")
            .trim()
            .split("\n")
            .filter(Boolean);
          const remaining = allHashes.filter((h) => !shuckedTargets!.has(h));

          console.log(
            `[Instance ${config.instanceID}] [Job ${jobID}] Shucked ${shuckedTargets.size}/${allHashes.length} hash(es); ${remaining.length} remain for GPU`
          );

          if (remaining.length === 0) {
            // All hashes shucked — skip GPU entirely
            console.log(
              `[Instance ${config.instanceID}] [Job ${jobID}] All hashes resolved by shucking — marking complete`
            );
            jobMetadata.status = STATUS.Complete;
            await writeJobMetadata(
              config.instanceRoot,
              config.instanceID,
              jobID,
              jobMetadata
            );
            jobID = null;
            return;
          }

          // Rewrite the hash file with only unresolved hashes
          fs.writeFileSync(hashFilePath, remaining.join("\n") + "\n", "utf-8");
        }

        // ── NTLMv1 pre-processing: convert NTLMv1 → DES pairs ──
        let hashcatInputFile: string;
        let hashcatHashType: number;
        let hashcatAttackMode: number;
        let hashcatMask: string | undefined;
        let hashcatWordlistFile: string | undefined;
        let hashcatRuleFile: string | undefined;
        let hashcatCharset1: string | undefined;
        let hashcatHexCharset: boolean | undefined;

        if (ntlmv1Mode) {
          console.log(
            `[Instance ${config.instanceID}] [Job ${jobID}] NTLMv1 mode detected (hashType=${jobMetadata.hashType}) — converting to DES brute-force`
          );
          const jobDir = getJobFolderPath(
            config.instanceRoot,
            config.instanceID,
            jobID
          );
          const originalHashFile = getJobHashPath(
            config.instanceRoot,
            config.instanceID,
            jobID
          );

          try {
            const preprocess = preprocessNtlmv1Job(jobDir, originalHashFile);
            ntlmv1PreprocessData.set(jobID, preprocess);

            hashcatInputFile = preprocess.desHashFile;
            hashcatHashType = 14000; // DES mode
            hashcatAttackMode = 3; // Brute-force
            hashcatMask = DES_BRUTE_FORCE_MASK;
            hashcatWordlistFile = undefined;
            hashcatRuleFile = undefined;
            hashcatCharset1 = preprocess.charsetFile;
            hashcatHexCharset = true;
          } catch (e) {
            console.error(
              `[Instance ${config.instanceID}] [Job ${jobID}] NTLMv1 pre-processing failed:`,
              e
            );
            jobMetadata.status = STATUS.Error;
            await writeJobMetadata(
              config.instanceRoot,
              config.instanceID,
              jobID,
              jobMetadata
            );
            jobID = null;
            return;
          }
        } else {
          // Standard hashcat job
          hashcatInputFile = getJobHashPath(
            config.instanceRoot,
            config.instanceID,
            jobID
          );
          hashcatHashType = jobMetadata.hashType;
          hashcatAttackMode = jobMetadata.attackMode ?? 0;
          hashcatMask = jobMetadata.mask;
          hashcatWordlistFile = isMaskAttack
            ? undefined
            : getWordlistPath(config.wordlistRoot, jobMetadata.wordlist);
          hashcatRuleFile =
            jobMetadata.rule && config.ruleRoot
              ? getRulePath(config.ruleRoot, jobMetadata.rule)
              : undefined;
          hashcatCharset1 = undefined;
          hashcatHexCharset = undefined;
        }

        // If the expected wordlist file doesn't exist, capture a full EFS
        // recursive listing and write it to a log file for easier debugging.
        if (hashcatWordlistFile && !fs.existsSync(hashcatWordlistFile)) {
          try {
            console.error(
              `[Instance ${config.instanceID}] [Job ${jobID}] Wordlist file not found: ${hashcatWordlistFile}`
            );
            const listing = execSync("ls -laR /mnt/efs", {
              encoding: "utf8",
              maxBuffer: 20 * 1024 * 1024,
            });
            console.log(
              `[Instance ${config.instanceID}] [Job ${jobID}] EFS recursive listing:\n${listing}`
            );
            try {
              fs.writeFileSync(
                `/var/log/efs-listing-${config.instanceID}-${jobID}.log`,
                listing
              );
            } catch (e) {
              console.error(
                `[Instance ${config.instanceID}] Failed to write EFS listing to /var/log: ${String(e)}`
              );
            }
          } catch (e) {
            console.error(
              `[Instance ${config.instanceID}] Failed to capture EFS listing: ${String(e)}`
            );
          }
        }

        jobProcess = hashcat({
          exePath: config.hashcatPath,
          inputFile: hashcatInputFile,
          outputFile: getJobOutputPath(
            config.instanceRoot,
            config.instanceID,
            jobID
          ),
          hashType: hashcatHashType,
          wordlistFile: hashcatWordlistFile,
          ruleFile: hashcatRuleFile,
          attackMode: hashcatAttackMode,
          mask: hashcatMask,
          customCharset1: hashcatCharset1,
          hexCharset: hashcatHexCharset,
          cwd: getJobFolderPath(config.instanceRoot, config.instanceID, jobID),
          onStatus: (status) => {
            const progress: JobProgress = {
              progressPercent: status.progressPercent,
              speed: status.speed,
              speedFormatted: status.speedFormatted,
              eta: status.eta,
              estimatedStop: status.estimatedStop,
              timestamp: status.timestamp,
            };
            writeJobProgress(
              config.instanceRoot,
              config.instanceID,
              jobID!,
              progress
            );
            // Write full status for WebSocket-based real-time display
            writeJobStatus(config.instanceRoot, config.instanceID, jobID!, {
              ...status,
              instanceId: config.instanceID,
              instanceType: config.instanceType,
              jobId: jobID!,
            });
          },
        });
      } else if (jobProcess && jobProcess.exitCode !== null) {
        const jobMetadata = await getJobMetadata(
          config.instanceRoot,
          config.instanceID,
          jobID
        );

        // Hashcat exit codes:
        // 0 = All hashes cracked
        // 1 = Exhausted (completed but not all hashes cracked) - treat as success
        // 2 = Aborted by user
        // -1 or other = Error (failed to run)
        if (jobProcess.exitCode === 0 || jobProcess.exitCode === 1) {
          jobMetadata.status = STATUS.Complete;
          console.log(
            `[Instance ${config.instanceID}] [Job ${jobID}] Completed with exit code ${jobProcess.exitCode}`
          );

          // ── NTLMv1 post-processing: DES keys → NTLM hashes ──
          const preprocess = ntlmv1PreprocessData.get(jobID!);
          if (preprocess) {
            try {
              postprocessNtlmv1Job(
                config.instanceRoot,
                config.instanceID,
                jobID!,
                preprocess
              );
            } catch (e) {
              console.error(
                `[Instance ${config.instanceID}] [Job ${jobID}] NTLMv1 post-processing failed:`,
                e
              );
              // Don't fail the job — DES results are still in the pot file
            }
            ntlmv1PreprocessData.delete(jobID!);
          }
        } else if (jobProcess.exitCode === 2) {
          jobMetadata.status = STATUS.Stopped;
          console.log(
            `[Instance ${config.instanceID}] [Job ${jobID}] Aborted by user (exit code 2)`
          );
        } else {
          jobMetadata.status = STATUS.Error;
          console.error(
            `[Instance ${config.instanceID}] [Job ${jobID}] Hashcat failed with exit code ${jobProcess.exitCode}`
          );
          console.error(
            `[Instance ${config.instanceID}] [Job ${jobID}] Command: "${jobProcess.spawnargs.join(" ")}"`
          );
        }

        console.log(
          `[Instance ${config.instanceID}] [Job ${jobID}] Exit with code ${jobProcess.exitCode}`
        );

        await writeJobMetadata(
          config.instanceRoot,
          config.instanceID,
          jobID,
          jobMetadata
        );

        jobProcess = null;
        jobID = null;
      }
    }, config.instanceInterval * 1000);

    console.log(`[Instance ${config.instanceID}] Started`);
  });
}

async function main() {
  let status: "PENDING" | "RUNNING" | "STOPPED" | "ERROR" | "UNKNOWN";
  let err: unknown = null;
  try {
    switch (await innerMain()) {
      case EXIT_CASE.Stop:
        status = STATUS.Stopped;
        break;
      case EXIT_CASE.Cooldown:
        // Instance is done with all work and cooldown expired — mark Stopped
        // so the cluster sync knows this instance is finished and can be
        // cleaned up / terminated.
        status = STATUS.Stopped;
        break;
      case EXIT_CASE.Error:
        status = STATUS.Error;
        break;
    }
  } catch (e) {
    status = STATUS.Error;
    err = e;
  }

  const metadata = await getInstanceMetadata(
    config.instanceRoot,
    config.instanceID
  );

  if (metadata.status !== STATUS.Unknown) {
    metadata.status = status!;

    await writeInstanceMetadata(
      config.instanceRoot,
      config.instanceID,
      metadata
    );
  }

  console.log(
    `[Instance ${config.instanceID}] Exiting with status: ${status!}`
  );

  if (err) throw err;
  else process.exit(0);
}

if (require.main === module) main();
