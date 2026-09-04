import * as AWS from "aws-sdk";

import { STATUS } from "@repo/api";
import { type AWSClusterConfig } from "@repo/app-config/cluster";
import { INSTANCE_TYPE_VALUES } from "@repo/app-config/instance-types";
import { DEFAULT_INSTANCE_TYPE } from "@repo/app-config/instance-types";
import {
  getClusterFolderInstances,
  getInstanceMetadata,
  writeInstanceMetadata,
} from "@repo/filesystem/cluster";

import { FileSystemCluster } from "./filesystem";

const DEFAULT_TYPE = DEFAULT_INSTANCE_TYPE;

export class AwsCluster extends FileSystemCluster<AWSClusterConfig> {
  public async listRules(): Promise<string[]> {
    // AWSCluster stores rules in EFS, so delegate to FileSystemCluster
    return super.listRules();
  }
  private stepFunctions!: AWS.StepFunctions;
  private s3!: AWS.S3;
  private ec2!: AWS.EC2;

  // Cache for instance type availability (refreshed every 5 minutes)
  private availabilityCache: {
    data: Record<string, { available: boolean; azs: string[] }>;
    timestamp: number;
  } | null = null;
  private static readonly AVAILABILITY_CACHE_TTL_MS = 5 * 60 * 1000;

  // ── Capacity-aware launch retry (park-and-retry) ──
  // AWS returns these error codes when a GPU instance type is temporarily
  // unavailable or the API is throttling. Failures matching this allowlist are
  // treated as TRANSIENT and PARKED for a later retry; everything else is
  // treated as a terminal launch failure (fail-closed). ca-central-1 has few
  // AZs, so the retry stays in-region and leans on the Step Functions cross-AZ
  // fallback + in-state retries.
  private static readonly LAUNCH_CAPACITY_CODES = [
    "InsufficientInstanceCapacity",
    "Ec2.InsufficientInstanceCapacity",
    "Ec2.Client.InsufficientInstanceCapacity",
    "RequestLimitExceeded",
    "Ec2.Client.RequestLimitExceeded",
    "Throttling",
    "ThrottlingException",
    "Unavailable",
    "Ec2.Client.Unavailable",
  ];
  // Human-readable capacity/throttle phrasings AWS buries in the failure
  // `cause` when the error CODE is a generic wrapper. Step Functions' generic
  // aws-sdk integration (`aws-sdk:ec2:runInstances`) surfaces an
  // InsufficientInstanceCapacity failure as the code `Ec2.Ec2Exception`, with
  // the real reason ("We currently do not have sufficient <type> capacity ...")
  // only in the message — so the exact-code list above never matches it. These
  // patterns catch that phrasing (case-insensitive) so a genuine transient
  // shortage is PARKED, not terminally errored. Kept deliberately narrow: a
  // real misconfig cause ("The image id ... does not exist", "is not authorized
  // to perform") does NOT match, so it still fails closed to ERROR.
  private static readonly LAUNCH_CAPACITY_PATTERNS: readonly RegExp[] = [
    /(insufficient|do not have sufficient|not have enough)[\s\S]{0,80}capacity/i,
    /request limit exceeded/i,
    /\bthrottl/i,
  ];
  private static readonly MAX_LAUNCH_ATTEMPTS = 5;
  private static readonly BACKOFF_BASE_MS = 30_000; // 30s
  private static readonly BACKOFF_CAP_MS = 300_000; // 5m
  private static readonly STUCK_EXECUTION_MS = 15 * 60_000; // 15m

  /**
   * Backoff for the Nth completed attempt: 30s, 60s, 120s, 240s, capped at 5m.
   */
  private launchBackoffMs(attempts: number): number {
    return Math.min(
      AwsCluster.BACKOFF_BASE_MS * Math.pow(2, Math.max(0, attempts - 1)),
      AwsCluster.BACKOFF_CAP_MS
    );
  }

  /**
   * Decide whether a launch failure is a transient capacity/throttle blip we
   * should PARK and retry, or a terminal ERROR. Fails closed: an unrecognised
   * failure is terminal so we never silently retry a genuinely broken launch
   * (bad AMI, missing IAM, invalid type) forever. Matches by substring so a
   * generic `States.TaskFailed` whose `cause` embeds the real EC2 code is
   * still classified correctly.
   */
  private classifyLaunchError(
    error?: string,
    cause?: string
  ): "park" | "error" {
    const haystack = `${error ?? ""} ${cause ?? ""}`;
    for (const code of AwsCluster.LAUNCH_CAPACITY_CODES) {
      if (haystack.includes(code)) return "park";
    }
    for (const re of AwsCluster.LAUNCH_CAPACITY_PATTERNS) {
      if (re.test(haystack)) return "park";
    }
    return "error";
  }

  public getName(): string {
    return "aws";
  }

  public getTypes(): string[] {
    // Use canonical list from shared config so UI and server stay in sync
    return INSTANCE_TYPE_VALUES.concat([DEFAULT_TYPE]);
  }

  /**
   * Check which GPU instance types are actually offered in the current AWS
   * region and in which AZs.  Results are cached for 5 minutes.
   */
  public async checkInstanceAvailability(): Promise<
    Record<string, { available: boolean; azs: string[] }>
  > {
    // Return cached result if fresh
    if (
      this.availabilityCache &&
      Date.now() - this.availabilityCache.timestamp <
        AwsCluster.AVAILABILITY_CACHE_TTL_MS
    ) {
      return this.availabilityCache.data;
    }

    const types = this.getTypes();
    const result: Record<string, { available: boolean; azs: string[] }> = {};
    for (const t of types) {
      result[t] = { available: false, azs: [] };
    }

    try {
      // EC2 DescribeInstanceTypeOfferings tells us which types are offered
      // per AZ in this region, paginated.
      let nextToken: string | undefined;
      do {
        const resp = await this.ec2
          .describeInstanceTypeOfferings({
            LocationType: "availability-zone",
            Filters: [
              {
                Name: "instance-type",
                Values: types,
              },
            ],
            NextToken: nextToken,
          })
          .promise();

        for (const offering of resp.InstanceTypeOfferings ?? []) {
          const t = offering.InstanceType;
          const az = offering.Location;
          if (t && result[t]) {
            result[t].available = true;
            if (az) result[t].azs.push(az);
          }
        }

        nextToken = resp.NextToken;
      } while (nextToken);

      console.log(
        `[AWS Cluster] Instance availability: ${
          Object.entries(result).filter(([, v]) => v.available).length
        }/${types.length} types available in region`
      );
    } catch (e) {
      console.error(
        "[AWS Cluster] Failed to check instance type availability:",
        e
      );
      // On error, mark all as available so we don't block users
      for (const t of types) {
        result[t] = { available: true, azs: [] };
      }
    }

    this.availabilityCache = { data: result, timestamp: Date.now() };
    return result;
  }

  private loadCredentials(): Promise<boolean> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.error("[AWS Cluster] Credentials loading timed out after 5s");
        resolve(false);
      }, 5000);

      AWS.config.getCredentials((err) => {
        clearTimeout(timeout);
        if (err) {
          console.error("[AWS Cluster] Failed to load credentials:", err);
          resolve(false);
        } else {
          console.log("[AWS Cluster] Successfully loaded AWS credentials");
          resolve(true);
        }
      });
    });
  }

  public async load(): Promise<boolean> {
    console.log("[AWS Cluster] Loading filesystem cluster...");
    if (!(await super.load())) {
      console.error("[AWS Cluster] Failed to load filesystem cluster");
      return false;
    }

    console.log("[AWS Cluster] Loading AWS credentials...");
    if (!(await this.loadCredentials())) {
      console.error("[AWS Cluster] Failed to load AWS credentials");
      return false;
    }

    this.stepFunctions = new AWS.StepFunctions();
    this.s3 = new AWS.S3();
    this.ec2 = new AWS.EC2();

    console.log("[AWS Cluster] Successfully initialized AWS cluster");
    return true;
  }

  /**
   * Create instance folder only, without launching EC2.
   * Returns instanceID which can be used to create job folders before launching.
   */
  public async createInstanceFolder(
    instanceType: string
  ): Promise<string | null> {
    // Call parent to create instance folder and metadata
    const instanceID = await super.createInstanceFolder(instanceType);

    if (!instanceID) {
      console.log(
        `[AWS Cluster] Failed to create instance folder for type ${instanceType}`
      );
      return null;
    }

    // Validate instance type early so we fail fast with a clear message
    const supported = this.getTypes();
    if (!supported.includes(instanceType)) {
      console.error(
        `[AWS Cluster] Unsupported instance type requested: ${instanceType}`
      );
      // Mark instance as error in metadata so it's visible in EFS
      try {
        const metadata = await getInstanceMetadata(
          this.config.instanceRoot,
          instanceID
        );
        metadata.status = STATUS.Error;
        metadata.launchError = `Unsupported instance type: ${instanceType}`;
        await writeInstanceMetadata(
          this.config.instanceRoot,
          instanceID,
          metadata
        );
      } catch {
        // ignore metadata write errors
      }

      throw new Error(`Unsupported instance type: ${instanceType}`);
    }

    return instanceID;
  }

  /**
   * Launch EC2 instance for an existing instance folder.
   * Should be called after job folders are created.
   */
  public async launchInstance(instanceID: string): Promise<void> {
    console.log(
      `[AWS Cluster] launchInstance() called with instanceID: ${instanceID}`
    );

    // Verify the instance folder exists before launching EC2
    // Retry a few times to account for EFS propagation delays
    let metadata = await getInstanceMetadata(
      this.config.instanceRoot,
      instanceID
    );

    let attempts = 0;
    const maxAttempts = 10;
    while (metadata.status === STATUS.Unknown && attempts < maxAttempts) {
      console.log(
        `[AWS Cluster] Instance folder not found yet, waiting 500ms (attempt ${attempts + 1}/${maxAttempts})...`
      );
      await new Promise((resolve) => setTimeout(resolve, 500));
      metadata = await getInstanceMetadata(
        this.config.instanceRoot,
        instanceID
      );
      attempts++;
    }

    console.log(
      `[AWS Cluster] Verified instance folder exists with metadata:`,
      JSON.stringify(metadata)
    );

    if (metadata.status === STATUS.Unknown) {
      throw new Error(
        `Instance folder ${instanceID} not found on EFS after ${maxAttempts} attempts`
      );
    }

    await this.run(instanceID);
  }

  public async createInstance(instanceType: string): Promise<string | null> {
    const instanceID = await this.createInstanceFolder(instanceType);
    if (!instanceID) return null;

    await this.launchInstance(instanceID);
    return instanceID;
  }

  public async createWordlistFromStream(
    stream: NodeJS.ReadableStream,
    options?: { originBucket?: string; originKey?: string }
  ): Promise<string | null> {
    // Call parent implementation to write stream to EFS
    const wordlistID = await super.createWordlistFromStream(stream, options);

    // If we have origin S3 info, attempt to delete the original object now that it
    // has been written to EFS successfully. Deletion is best-effort and errors are
    // logged but do not fail the overall operation.
    if (wordlistID && options?.originBucket && options?.originKey && this.s3) {
      try {
        await this.s3
          .deleteObject({
            Bucket: options.originBucket,
            Key: options.originKey,
          })
          .promise();
        console.log(
          `[AWS Cluster] Deleted origin S3 object s3://${options.originBucket}/${options.originKey} after writing wordlist ${wordlistID}`
        );
      } catch (e) {
        console.error(
          `[AWS Cluster] Failed to delete origin S3 object s3://${options?.originBucket}/${options?.originKey}:`,
          e
        );
      }
    }

    return wordlistID;
  }

  /**
   * Downloads a wordlist from S3 and writes it to EFS using the stream logic.
   * Returns the wordlistID if successful, null otherwise.
   */
  public async copyWordlistFromS3ToEFS(
    s3Bucket: string,
    s3Key: string,
    targetID?: string
  ): Promise<string | null> {
    if (!this.s3) {
      this.s3 = new AWS.S3();
    }
    try {
      const s3Stream = this.s3
        .getObject({ Bucket: s3Bucket, Key: s3Key })
        .createReadStream();
      // Use the origin info so the S3 object is deleted after copy.
      // Pass through an optional targetID so the server can request a specific
      // final filename on EFS (avoids mismatched IDs between DB and EFS).
      const opts: {
        originBucket: string;
        originKey: string;
        targetID?: string;
      } = {
        originBucket: s3Bucket,
        originKey: s3Key,
      };
      if (targetID) opts.targetID = targetID;

      const wordlistID = await this.createWordlistFromStream(s3Stream, opts);
      if (wordlistID) {
        console.log(
          `[AWSCluster] Successfully copied wordlist from S3 (${s3Bucket}/${s3Key}) to EFS as ${wordlistID}`
        );
      } else {
        console.error(
          `[AWSCluster] Failed to copy wordlist from S3 (${s3Bucket}/${s3Key}) to EFS`
        );
      }
      return wordlistID;
    } catch (err) {
      console.error(`[AWSCluster] Error copying wordlist from S3 to EFS:`, err);
      return null;
    }
  }

  public async copyRuleFromS3ToEFS(
    s3Bucket: string,
    s3Key: string
  ): Promise<string | null> {
    if (!this.s3) {
      this.s3 = new AWS.S3();
    }
    try {
      const s3Stream = this.s3
        .getObject({ Bucket: s3Bucket, Key: s3Key })
        .createReadStream();

      const ruleID = await this.createRuleFromStream(s3Stream);
      if (ruleID) {
        console.log(
          `[AWSCluster] Successfully copied rule from S3 (${s3Bucket}/${s3Key}) to EFS as ${ruleID}`
        );
      } else {
        console.error(
          `[AWSCluster] Failed to copy rule from S3 (${s3Bucket}/${s3Key}) to EFS`
        );
      }
      return ruleID;
    } catch (err) {
      console.error(`[AWSCluster] Error copying rule from S3 to EFS:`, err);
      return null;
    }
  }

  protected async run(instanceID: string): Promise<void> {
    console.log(`[AWS Cluster] run() called with instanceID: ${instanceID}`);
    const metadata = await getInstanceMetadata(
      this.config.instanceRoot,
      instanceID
    );
    console.log(`[AWS Cluster] Instance metadata:`, JSON.stringify(metadata));

    // A reconcile-driven relaunch can race a concurrent delete: the folder may
    // have been removed (getInstanceMetadata → UNKNOWN) or marked Stopped
    // between the caller's read and now. Never (re)launch — nor recreate the
    // folder for — an instance that no longer exists or is stopping, or we
    // leak a billable EC2 with no metadata to track/terminate it.
    if (
      metadata.status === STATUS.Unknown ||
      metadata.status === STATUS.Stopped
    ) {
      console.warn(
        `[AWS Cluster] run() aborted for ${instanceID}: instance is ${metadata.status} (deleted or stopping)`
      );
      return;
    }

    // Count this launch attempt. run() is the SINGLE place attempts increment,
    // so the per-attempt execution name below stays unique across retries.
    const attempt = (metadata.launchAttempts ?? 0) + 1;

    if (!this.config.stepFunctionArn) {
      // Hard misconfiguration — terminal, never retryable.
      metadata.status = STATUS.Error;
      metadata.launchAttempts = attempt;
      metadata.launchError = "Step Function ARN not configured for AwsCluster";
      await writeInstanceMetadata(
        this.config.instanceRoot,
        instanceID,
        metadata
      );
      throw new Error("Step Function ARN not configured for AwsCluster");
    }

    const stepFunctionInput = {
      instanceID,
      instanceType: metadata.type ?? DEFAULT_TYPE,
    };
    console.log(
      `[AWS Cluster] Starting Step Functions execution (attempt ${attempt}) with input:`,
      JSON.stringify(stepFunctionInput)
    );

    // Start the execution FIRST, then persist the RUNNING flip TOGETHER with
    // the executionArn in a single write. The previous ordering (flip RUNNING,
    // then persist the ARN in a second write) left a window where a swallowed
    // ARN-write failure stranded the instance RUNNING-with-no-ARN — which the
    // reconciler then relaunched, double-billing. Persisting them together
    // means a successful start is always pollable by reconcileLaunches().
    let executionArn: string | undefined;
    try {
      const result = await this.stepFunctions
        .startExecution({
          stateMachineArn: this.config.stepFunctionArn,
          input: JSON.stringify(stepFunctionInput),
          // Unique per attempt so a parked launch can be relaunched without
          // colliding with the prior execution name (dedup window is 90 days).
          name: `${instanceID}-${attempt}`,
        })
        .promise();
      executionArn = result.executionArn;
      console.log(`[AWS Cluster] Step Functions started:`, executionArn);
    } catch (e) {
      console.error(`[AWS Cluster] Step Functions error:`, e);

      const errName =
        e && typeof e === "object" && "code" in e
          ? String((e as { code?: unknown }).code)
          : "";
      const errMsg =
        e && typeof e === "object" && "message" in e
          ? String((e as { message?: unknown }).message)
          : String(e);

      // startExecution itself failed (throttling, a transient API blip, or a
      // hard misconfig). Park transient failures for a bounded retry; only
      // hard-fail terminal ones. Parking must NOT throw — a transient throttle
      // is not a user-facing failure, and the reconciler will relaunch it.
      try {
        const failedMetadata = await getInstanceMetadata(
          this.config.instanceRoot,
          instanceID
        );
        // Deleted / stopped mid-launch — don't resurrect the folder.
        if (
          failedMetadata.status === STATUS.Unknown ||
          failedMetadata.status === STATUS.Stopped
        ) {
          return;
        }
        failedMetadata.launchAttempts = attempt;
        failedMetadata.executionArn = undefined;
        const verdict = this.classifyLaunchError(errName, errMsg);
        if (verdict === "park" && attempt < AwsCluster.MAX_LAUNCH_ATTEMPTS) {
          failedMetadata.status = STATUS.Pending;
          failedMetadata.launchStartedAt = undefined;
          failedMetadata.nextAttemptAt =
            Date.now() + this.launchBackoffMs(attempt);
          failedMetadata.launchError = errName || errMsg;
          await writeInstanceMetadata(
            this.config.instanceRoot,
            instanceID,
            failedMetadata
          );
          console.log(
            `[AWS Cluster] Parked launch for ${instanceID} after transient error (attempt ${attempt}): ${errName || errMsg}`
          );
          return; // parked — do not rethrow
        }

        failedMetadata.status = STATUS.Error;
        failedMetadata.launchStartedAt = undefined;
        failedMetadata.launchError = errMsg;
        await writeInstanceMetadata(
          this.config.instanceRoot,
          instanceID,
          failedMetadata
        );
      } catch (w) {
        console.error(`[AWS Cluster] Failed to write error metadata:`, w);
      }

      // Re-throw only for terminal failures so upstream callers see them.
      throw e;
    }

    // Execution accepted — an EC2 launch is now in flight. Persist RUNNING +
    // the ARN. Re-read first so we don't clobber a concurrent status change,
    // and bail (aborting the orphaned execution) if the instance was deleted
    // or stopped while startExecution was in flight — recreating its folder
    // here would leak an untracked billable box.
    try {
      const saved = await getInstanceMetadata(
        this.config.instanceRoot,
        instanceID
      );
      if (
        saved.status === STATUS.Unknown ||
        saved.status === STATUS.Stopped
      ) {
        console.warn(
          `[AWS Cluster] Instance ${instanceID} was ${saved.status} during launch; aborting execution ${executionArn}`
        );
        try {
          await this.stepFunctions
            .stopExecution({ executionArn })
            .promise();
        } catch (se) {
          console.error(
            `[AWS Cluster] Failed to abort orphaned execution for ${instanceID}:`,
            se
          );
        }
        return;
      }
      saved.status = STATUS.Running;
      saved.launchAttempts = attempt;
      saved.launchStartedAt = Date.now();
      saved.executionArn = executionArn;
      saved.nextAttemptAt = undefined;
      saved.launchError = undefined;
      await writeInstanceMetadata(this.config.instanceRoot, instanceID, saved);
    } catch (w) {
      // The execution is running but we couldn't record its ARN. Do NOT
      // relaunch on the next cycle — reconcile Case B terminally errors a
      // RUNNING-with-no-ARN instance rather than risk a second box.
      console.error(
        `[AWS Cluster] Failed to persist launch state for ${instanceID}:`,
        w
      );
    }
  }

  /**
   * Poll in-flight instance launches and reconcile stuck/failed ones.
   *
   * The EC2 box is provisioned by an async Step Functions execution whose ARN
   * run() stores in instance metadata. This pass, driven periodically by the
   * server, closes the feedback loop run() cannot:
   *   • SUCCEEDED  → clear launch bookkeeping, keep RUNNING (worker will boot).
   *   • FAILED/TIMED_OUT/ABORTED → classify: PARK (→ PENDING + backoff, retry
   *     in-region) for transient capacity/throttle, else terminal ERROR.
   *   • parked + backoff elapsed → relaunch via run() (bounded by MAX attempts).
   *
   * Poll errors (throttle / not-found / AccessDenied) leave metadata UNCHANGED
   * — we never fail-closed on a transient inability to read execution state.
   * Per-instance failures are isolated so one bad instance can't abort the pass.
   */
  public async reconcileLaunches(): Promise<{
    parked: string[];
    errored: string[];
  }> {
    const parked: string[] = [];
    const errored: string[] = [];

    let instanceIDs: string[];
    try {
      instanceIDs = await getClusterFolderInstances(this.config.instanceRoot);
    } catch {
      return { parked, errored };
    }

    const now = Date.now();

    for (const instanceID of instanceIDs) {
      try {
        const metadata = await getInstanceMetadata(
          this.config.instanceRoot,
          instanceID
        );

        // ── Case A: a launch execution is in flight — poll it ──
        if (metadata.status === STATUS.Running && metadata.executionArn) {
          let desc: AWS.StepFunctions.DescribeExecutionOutput;
          try {
            desc = await this.stepFunctions
              .describeExecution({ executionArn: metadata.executionArn })
              .promise();
          } catch (e) {
            // Poll error — leave metadata UNCHANGED and retry next cycle.
            console.warn(
              `[AWS Cluster] describeExecution failed for ${instanceID}:`,
              e
            );
            continue;
          }

          if (desc.status === "RUNNING" || desc.status === "PENDING_REDRIVE") {
            // Still provisioning. Only intervene if wedged well past any sane
            // boot time so a hung execution can't pin the instance forever.
            if (
              metadata.launchStartedAt &&
              now - metadata.launchStartedAt > AwsCluster.STUCK_EXECUTION_MS
            ) {
              metadata.status = STATUS.Error;
              metadata.executionArn = undefined;
              metadata.launchError = "Launch execution stuck > 15m";
              await writeInstanceMetadata(
                this.config.instanceRoot,
                instanceID,
                metadata
              );
              errored.push(instanceID);
            }
            continue;
          }

          if (desc.status === "SUCCEEDED") {
            // EC2 launched. Keep RUNNING; clear ALL launch bookkeeping so the
            // instance reads as a normal healthy box. Critically this clears
            // launchAttempts + nextAttemptAt too: otherwise a later
            // RUNNING→PENDING startup reset (executionArn is now gone, so the
            // reset guard no longer exempts it) leaves it PENDING-with-attempts
            // and nextAttemptAt=undefined — which the cleanup guard skips and
            // Case C never relaunches, a permanent un-reapable zombie.
            metadata.executionArn = undefined;
            metadata.launchStartedAt = undefined;
            metadata.launchError = undefined;
            metadata.launchAttempts = undefined;
            metadata.nextAttemptAt = undefined;
            await writeInstanceMetadata(
              this.config.instanceRoot,
              instanceID,
              metadata
            );
            continue;
          }

          // FAILED | TIMED_OUT | ABORTED
          const verdict = this.classifyLaunchError(desc.error, desc.cause);
          const attempts = metadata.launchAttempts ?? 0;
          if (verdict === "park" && attempts < AwsCluster.MAX_LAUNCH_ATTEMPTS) {
            metadata.status = STATUS.Pending;
            metadata.executionArn = undefined;
            metadata.launchStartedAt = undefined;
            metadata.nextAttemptAt = now + this.launchBackoffMs(attempts);
            metadata.launchError = desc.error ?? "capacity";
            await writeInstanceMetadata(
              this.config.instanceRoot,
              instanceID,
              metadata
            );
            parked.push(instanceID);
          } else {
            metadata.status = STATUS.Error;
            metadata.executionArn = undefined;
            metadata.launchError =
              desc.error ?? desc.cause ?? "launch failed";
            await writeInstanceMetadata(
              this.config.instanceRoot,
              instanceID,
              metadata
            );
            errored.push(instanceID);
          }
          continue;
        }

        // ── Case B: RUNNING with no execution ARN and wedged too long ──
        // AMBIGUOUS state: startExecution may have succeeded (a real EC2 could
        // be booting) but the RUNNING+ARN write was lost, so we cannot know
        // whether a box exists. Relaunching would risk a SECOND billable box
        // for one instanceID, so fail TERMINAL instead — an operator can delete
        // and recreate. Old pre-Task-B launches have no launchStartedAt, so
        // this never fires for them (their prior lifecycle is left untouched).
        if (metadata.status === STATUS.Running && !metadata.executionArn) {
          if (
            metadata.launchStartedAt &&
            now - metadata.launchStartedAt > AwsCluster.STUCK_EXECUTION_MS
          ) {
            metadata.status = STATUS.Error;
            metadata.launchStartedAt = undefined;
            metadata.launchError =
              "Launch execution ARN missing (possible lost write); failed terminal to avoid double-launch";
            await writeInstanceMetadata(
              this.config.instanceRoot,
              instanceID,
              metadata
            );
            errored.push(instanceID);
          }
          continue;
        }

        // ── Case C: parked (PENDING with prior attempts) — relaunch on backoff ──
        if (
          metadata.status === STATUS.Pending &&
          (metadata.launchAttempts ?? 0) > 0 &&
          !metadata.executionArn
        ) {
          const attempts = metadata.launchAttempts ?? 0;
          if (attempts >= AwsCluster.MAX_LAUNCH_ATTEMPTS) {
            metadata.status = STATUS.Error;
            metadata.launchError =
              metadata.launchError ?? "Exhausted launch retries";
            await writeInstanceMetadata(
              this.config.instanceRoot,
              instanceID,
              metadata
            );
            errored.push(instanceID);
            continue;
          }
          if (metadata.nextAttemptAt && now >= metadata.nextAttemptAt) {
            // run() flips to RUNNING, bumps attempts, and starts a fresh
            // execution. It parks itself again if this attempt also fails.
            console.log(
              `[AWS Cluster] Relaunching parked instance ${instanceID} (attempt ${attempts + 1})`
            );
            await this.run(instanceID);
          }
          continue;
        }
      } catch (e) {
        // Isolate per-instance failures — one bad instance must not abort the
        // whole reconcile pass.
        console.error(
          `[AWS Cluster] reconcileLaunches error for ${instanceID}:`,
          e
        );
      }
    }

    return { parked, errored };
  }

  /**
   * Return the set of instanceIDs (the folder/DB tag) that currently have a
   * LIVE EC2 box — one in the pending or running state, tagged
   * ManagedBy=Crackosaurus. This is the authoritative liveness signal the
   * server's stale-instance reaper uses to stop DB instances whose box is gone.
   *
   * Returns null if liveness cannot be determined (ANY EC2 API error), so the
   * caller treats it as "unknown" and never reaps on a transient failure — a
   * partial list from a mid-pagination error must not read as "these are the
   * only live boxes". The instanceID is read from the explicit `InstanceID` tag
   * when present, falling back to the trailing UUID of the `Name` tag
   * (`<prefix>-instance-stack-<uuid>`) for any box launched before that tag
   * existed.
   */
  public async getLiveInstanceIDs(): Promise<string[] | null> {
    const UUID_RE =
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const ids = new Set<string>();
    try {
      let nextToken: string | undefined;
      do {
        const resp = await this.ec2
          .describeInstances({
            Filters: [
              { Name: "tag:ManagedBy", Values: ["Crackosaurus"] },
              { Name: "instance-state-name", Values: ["pending", "running"] },
            ],
            NextToken: nextToken,
          })
          .promise();

        for (const reservation of resp.Reservations ?? []) {
          for (const inst of reservation.Instances ?? []) {
            const tags = inst.Tags ?? [];
            const idTag = tags.find((tg) => tg.Key === "InstanceID")?.Value;
            if (idTag) {
              ids.add(idTag);
              continue;
            }
            const nameTag = tags.find((tg) => tg.Key === "Name")?.Value;
            const match = nameTag?.match(UUID_RE);
            if (match) ids.add(match[0]);
          }
        }

        nextToken = resp.NextToken;
      } while (nextToken);
    } catch (e) {
      console.error("[AWS Cluster] getLiveInstanceIDs failed:", e);
      return null;
    }

    return Array.from(ids);
  }

  public async deleteInstance(instanceID: string): Promise<boolean> {
    console.log(
      `[AWS Cluster] deleteInstance() called for instanceID: ${instanceID}`
    );

    // Read the EC2 instance ID from metadata BEFORE deleting anything.
    // super.deleteInstance() removes the instance folder from EFS (including
    // metadata.json), so reading it afterwards returns UNKNOWN metadata with no
    // ec2InstanceId — which previously meant the EC2 box was never terminated
    // and leaked as an orphaned (billable) instance. Capture it up front.
    let ec2InstanceId: string | undefined;
    try {
      const metadata = await getInstanceMetadata(
        this.config.instanceRoot,
        instanceID
      );
      ec2InstanceId = metadata.ec2InstanceId;
    } catch (e) {
      console.error(
        `[AWS Cluster] Error reading instance metadata before delete:`,
        e
      );
      // Continue — we still want to delete the folder even if metadata is
      // unreadable, but without an ec2InstanceId we can't terminate EC2 here.
    }

    // Mark instance as stopped and delete the folder from EFS (calls parent).
    const result = await super.deleteInstance(instanceID);

    // Try to terminate the EC2 instance if we captured its ID above.
    if (ec2InstanceId) {
      console.log(
        `[AWS Cluster] Terminating EC2 instance: ${ec2InstanceId}`
      );

      const ec2 = new AWS.EC2();
      try {
        await ec2
          .terminateInstances({
            InstanceIds: [ec2InstanceId],
          })
          .promise();
        console.log(
          `[AWS Cluster] EC2 instance ${ec2InstanceId} termination initiated`
        );
      } catch (e: unknown) {
        // Ignore "InvalidInstanceID.NotFound" errors (instance already terminated)
        if (
          e &&
          typeof e === "object" &&
          "code" in e &&
          e.code === "InvalidInstanceID.NotFound"
        ) {
          console.log(
            `[AWS Cluster] EC2 instance ${ec2InstanceId} already terminated`
          );
        } else {
          console.error(`[AWS Cluster] Failed to terminate EC2 instance:`, e);
          // Don't fail the whole operation, just log the error
        }
      }
    } else {
      console.log(
        `[AWS Cluster] No EC2 instance ID found in metadata, instance may not have been started yet or already deleted`
      );
    }

    return result;
  }

  public async createJob(
    instanceID: string,
    wordlist: string,
    hashType: number,
    hashes: string[],
    rule?: string,
    attackMode?: number,
    mask?: string
  ): Promise<string | null> {
    // Call parent to create job folder and metadata
    const jobID = await super.createJob(
      instanceID,
      wordlist,
      hashType,
      hashes,
      rule,
      attackMode,
      mask
    );

    if (!jobID) {
      console.log(
        `[AWS Cluster] Failed to create job for instance ${instanceID}`
      );
      return null;
    }

    // Job metadata written to EFS by parent FileSystemCluster.createJob;
    // instances will discover pending jobs by scanning EFS.

    return jobID;
  }

  public async createJobWithID(
    instanceID: string,
    jobID: string,
    wordlist: string,
    hashType: number,
    hashes: string[],
    rule?: string,
    attackMode?: number,
    mask?: string,
    ntWordlist?: string[]
  ): Promise<boolean> {
    // Call parent to create job folder and metadata with specified ID
    const result = await super.createJobWithID(
      instanceID,
      jobID,
      wordlist,
      hashType,
      hashes,
      rule,
      attackMode,
      mask,
      ntWordlist
    );

    if (!result) {
      console.log(
        `[AWS Cluster] Failed to create job ${jobID} for instance ${instanceID}`
      );
      return false;
    }

    // Send SQS notification
    // SQS removed: the job metadata has already been written to EFS by the
    // filesystem layer; instances will scan EFS for pending jobs.

    return true;
  }
}
