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

export default INSTANCE_TYPES;
