export const INSTANCE_TYPES = [
  { value: "g5.xlarge", label: "g5.xlarge (1x NVIDIA A10G, 4 vCPU, 16GB RAM)" },
  {
    value: "g5.2xlarge",
    label: "g5.2xlarge (1x NVIDIA A10G, 8 vCPU, 32GB RAM)",
  },
  {
    value: "g5.4xlarge",
    label: "g5.4xlarge (1x NVIDIA A10G, 16 vCPU, 64GB RAM)",
  },
  {
    value: "g5.8xlarge",
    label: "g5.8xlarge (1x NVIDIA A10G, 32 vCPU, 128GB RAM)",
  },
  {
    value: "g5.12xlarge",
    label: "g5.12xlarge (4x NVIDIA A10G, 48 vCPU, 192GB RAM)",
  },

  { value: "g6.xlarge", label: "g6.xlarge (1x NVIDIA L4, 4 vCPU, 16GB RAM)" },
  { value: "g6.2xlarge", label: "g6.2xlarge (1x NVIDIA L4, 8 vCPU, 32GB RAM)" },
  {
    value: "g6.4xlarge",
    label: "g6.4xlarge (1x NVIDIA L4, 16 vCPU, 64GB RAM)",
  },
  {
    value: "g6.8xlarge",
    label: "g6.8xlarge (1x NVIDIA L4, 32 vCPU, 128GB RAM)",
  },
  {
    value: "g6.12xlarge",
    label: "g6.12xlarge (4x NVIDIA L4, 48 vCPU, 192GB RAM)",
  },
];

export const INSTANCE_TYPE_VALUES = INSTANCE_TYPES.map((t) => t.value);

// Canonical default instance type. Keep this in sync with UI recommendation.
export const DEFAULT_INSTANCE_TYPE = "g6.12xlarge";

// ── NetNTLMv1 rainbow-table cracking (hashcat mode 5500) ──────────────────
// A 5500 capture is not GPU brute-forced; the NT hash is recovered by a CPU
// rainbow lookup over the ~4 TB GRTB table set (ntlmrain). Those runs want a
// storage-optimized box with a big local NVMe to stage the tables — NOT a GPU
// box — so these types are deliberately kept OUT of INSTANCE_TYPES (the
// operator-facing GPU dropdown): the server auto-pins a rainbow type onto a
// 5500 job, nobody selects it by hand. They are still returned by the cluster's
// getTypes() so the instance-folder type-validation accepts them.
// The CPU rainbow lookup (ntlmrain) is embarrassingly parallel and floors at
// ~1 h/capture even on fast silicon; wall time scales ~linearly with PHYSICAL
// cores. i3en pricing is flat ($0.125/vCPU/hr in ca-central-1), so a bigger box
// costs the same per hash and only buys wall-clock speed. 12xlarge (48 vCPU /
// 24 physical cores) is the $/hash sweet spot: ~30 min/capture and the fixed
// ~4 TB staging overhead is amortized over more compute than on smaller boxes.
export const RAINBOW_INSTANCE_TYPES = [
  "i3en.12xlarge", // 4x 7.5 TB NVMe (30 TB), 48 vCPU, 384 GB — primary (~30 min/capture)
  "i3en.6xlarge", //  2x 7.5 TB NVMe (15 TB), 24 vCPU, 192 GB — fallback (~60 min/capture)
  "i3en.3xlarge", //  1x 7.5 TB NVMe,         12 vCPU,  96 GB — fallback (~120 min/capture)
  "i3en.2xlarge", //  2x 2.5 TB NVMe (5 TB),   8 vCPU,  64 GB — last-resort (barely fits ~4 TB set)
] as const;

// Canonical rainbow type the server pins onto a NetNTLMv1 (5500) job.
export const DEFAULT_RAINBOW_INSTANCE_TYPE = "i3en.12xlarge";

// True when `instanceType` is a rainbow (NetNTLMv1) box rather than a GPU box.
// Drives the worker-class split in the cluster / Step Functions / CDK.
export function isRainbowInstanceType(
  instanceType: string | null | undefined
): boolean {
  return (
    typeof instanceType === "string" &&
    (RAINBOW_INSTANCE_TYPES as readonly string[]).includes(instanceType)
  );
}

export default INSTANCE_TYPES;
