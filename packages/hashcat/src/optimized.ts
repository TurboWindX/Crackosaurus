/**
 * Policy for hashcat's optimized kernels (`-O`).
 *
 * `-O` swaps in a faster kernel that CAPS candidate length (~31 bytes for fast
 * hashes, lower for slow/complex modes) and SILENTLY skips any longer
 * candidate — the job reports "Exhausted" as if the keyspace were covered.
 * That is a correctness hazard: a real password longer than the cap is missed
 * with no warning.
 *
 * Rule: default to pure kernels (never miss), and only enable `-O` when it is
 * mathematically impossible to miss — i.e. when every candidate is provably
 * within the cap:
 *   - dictionary / combinator / rules: candidate length is unknowable up front
 *     (rules can double or triple a word), so `-O` is NEVER safe → pure kernels.
 *   - mask (-a 3): the mask fully determines candidate length, so `-O` is safe
 *     exactly when that length is within a conservative cap.
 */

/**
 * Conservative upper bound on mask candidate length for which `-O` is treated
 * as safe. The optimized cap is ~31 for fast hashes but lower for some modes;
 * 15 sits comfortably under every mode's optimized cap, so a mask at or below
 * it cannot be truncated by `-O` on any hash type, while still covering the
 * overwhelming majority of real brute-force masks (typically 6–12 positions).
 */
export const OPTIMIZED_MASK_MAX_LEN = 15;

/**
 * Number of character positions a hashcat mask expands each candidate to.
 * Every literal char is one position; every `?x` token (`?l ?u ?d ?s ?a ?b
 * ?h ?H ?1-?4`, and `??` for a literal `?`) is also one position.
 */
export function maskCandidateLength(mask: string): number {
  let len = 0;
  for (let i = 0; i < mask.length; i++) {
    // `?x` consumes two source chars but is a single candidate position. A
    // trailing lone `?` (malformed) falls through and counts as one literal.
    if (mask[i] === "?" && i + 1 < mask.length) i++;
    len++;
  }
  return len;
}

/**
 * Whether `-O` is safe (cannot truncate any candidate) for this attack.
 * True only for a mask attack (-a 3) whose candidate length is within the
 * conservative cap; false for every dictionary/combinator/rule attack.
 */
export function shouldUseOptimized(
  attackMode: number,
  mask?: string
): boolean {
  if (attackMode !== 3 || mask === undefined || mask === "") return false;
  return maskCandidateLength(mask) <= OPTIMIZED_MASK_MAX_LEN;
}
