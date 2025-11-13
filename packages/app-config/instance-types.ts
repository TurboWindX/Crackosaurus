export const INSTANCE_TYPES = [
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
  {
    value: "g6.16xlarge",
    label: "g6.16xlarge (1x NVIDIA L4, 64 vCPU, 256GB RAM)",
  },
  {
    value: "g6.24xlarge",
    label: "g6.24xlarge (4x NVIDIA L4, 96 vCPU, 384GB RAM)",
  },
  {
    value: "g6.48xlarge",
    label: "g6.48xlarge (8x NVIDIA L4, 192 vCPU, 768GB RAM) - RECOMMENDED",
  },

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
  {
    value: "g5.16xlarge",
    label: "g5.16xlarge (1x NVIDIA A10G, 64 vCPU, 256GB RAM)",
  },
  {
    value: "g5.24xlarge",
    label: "g5.24xlarge (4x NVIDIA A10G, 96 vCPU, 384GB RAM)",
  },
  {
    value: "g5.48xlarge",
    label: "g5.48xlarge (8x NVIDIA A10G, 192 vCPU, 768GB RAM)",
  },

  {
    value: "g4dn.xlarge",
    label: "g4dn.xlarge (1x NVIDIA T4, 4 vCPU, 16GB RAM)",
  },
  {
    value: "g4dn.2xlarge",
    label: "g4dn.2xlarge (1x NVIDIA T4, 8 vCPU, 32GB RAM)",
  },
  {
    value: "g4dn.4xlarge",
    label: "g4dn.4xlarge (1x NVIDIA T4, 16 vCPU, 64GB RAM)",
  },
  {
    value: "g4dn.8xlarge",
    label: "g4dn.8xlarge (1x NVIDIA T4, 32 vCPU, 128GB RAM)",
  },
  {
    value: "g4dn.12xlarge",
    label: "g4dn.12xlarge (4x NVIDIA T4, 48 vCPU, 192GB RAM)",
  },
  {
    value: "g4dn.16xlarge",
    label: "g4dn.16xlarge (1x NVIDIA T4, 64 vCPU, 256GB RAM)",
  },

  {
    value: "p3.2xlarge",
    label: "p3.2xlarge (1x NVIDIA V100, 8 vCPU, 61GB RAM)",
  },
  {
    value: "p3.8xlarge",
    label: "p3.8xlarge (4x NVIDIA V100, 32 vCPU, 244GB RAM)",
  },
  {
    value: "p3.16xlarge",
    label: "p3.16xlarge (8x NVIDIA V100, 64 vCPU, 488GB RAM)",
  },

  {
    value: "p5.48xlarge",
    label: "p5.48xlarge (8x NVIDIA H100, 192 vCPU, 2TB RAM) - ULTIMATE",
  },
];

export const INSTANCE_TYPE_VALUES = INSTANCE_TYPES.map((t) => t.value);

// Canonical default instance type. Keep this in sync with UI recommendation.
export const DEFAULT_INSTANCE_TYPE = "g6.48xlarge";

export default INSTANCE_TYPES;
