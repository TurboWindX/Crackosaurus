import { useTranslation } from "react-i18next";

import { Status } from "@repo/api";
import { Badge } from "@repo/shadcn/components/ui/badge";

export interface StatusBadgeProps {
  status: Status;
}

export const StatusBadge = ({ status }: StatusBadgeProps) => {
  const { t } = useTranslation();

  return <Badge>{t(`status.${status}`)}</Badge>;
};
