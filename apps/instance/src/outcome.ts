import { STATUS } from "@repo/api";

/** The terminal statuses a finished hashcat process can map to. */
type TerminalJobStatus =
  | typeof STATUS.Complete
  | typeof STATUS.Stopped
  | typeof STATUS.Error;

export interface HashcatCompletion {
  /** Terminal job status to record. */
  status: TerminalJobStatus;
  /** Human-readable reason for logs. */
  description: string;
}

/**
 * Classify a finished hashcat process into a terminal job status.
 *
 * Returns `null` while the process is still running — neither a numeric exit
 * code nor a termination signal yet. This is the guard that keeps a
 * signal-killed hashcat (OOM / SIGKILL / SIGSEGV, common on GPU boxes) from
 * wedging the instance: such a process reports `exitCode === null` but a
 * non-null `signalCode`, so it IS finished and must free the job slot — the
 * old `exitCode !== null` gate missed this and left the worker stuck forever.
 *
 * hashcat exit codes: 0 = all cracked, 1 = exhausted (both success), 2 =
 * aborted by user; anything else — or a signal — is an error.
 */
export function classifyHashcatCompletion(
  exitCode: number | null,
  signalCode: NodeJS.Signals | string | null
): HashcatCompletion | null {
  if (exitCode === null && signalCode === null) return null;

  if (exitCode === 0 || exitCode === 1) {
    return { status: STATUS.Complete, description: `exit code ${exitCode}` };
  }

  if (exitCode === 2) {
    return { status: STATUS.Stopped, description: "aborted by user (exit code 2)" };
  }

  const how =
    exitCode !== null ? `exit code ${exitCode}` : `signal ${signalCode}`;
  return { status: STATUS.Error, description: `hashcat failed with ${how}` };
}
