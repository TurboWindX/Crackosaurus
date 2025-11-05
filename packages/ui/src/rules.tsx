import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/shadcn/components/ui/select";

import { useTRPC } from "./api";

export interface RulesSelectProps {
  value?: string | null;
  onValueChange?: (value: string) => void;
}

export const RulesSelect = ({ value, onValueChange }: RulesSelectProps) => {
  const { t } = useTranslation();
  const trpc = useTRPC();

  const { data: rulesList } = trpc.rules.getList.useQuery();

  return (
    <Select
      value={value?.toString()}
      onValueChange={(value) => onValueChange?.(value)}
      disabled={(rulesList?.length ?? 0) === 0}
    >
      <SelectTrigger>
        <SelectValue placeholder={t("item.rule.singular")}
        />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {(rulesList ?? []).map(({ RID, name }) => (
            <SelectItem key={RID} value={RID}>
              {name ?? RID}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
};
