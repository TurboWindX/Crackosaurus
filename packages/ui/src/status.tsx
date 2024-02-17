import { Status } from "@repo/api";
import { Badge } from "@repo/shadcn/components/ui/badge";

export interface StatusBadgeProps {
  status: Status;
}

export const StatusBadge = ({ status }: StatusBadgeProps) => {
  return <Badge>{status}</Badge>;
};
