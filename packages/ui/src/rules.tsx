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

export interface RuleSelectProps {
  value?: string | null;
  onValueChange?: (value: string) => void;
}

export const RuleSelect = ({ value, onValueChange }: RuleSelectProps) => {
  const { t } = useTranslation();
  const trpc = useTRPC();

  const { data: ruleList } = trpc.rule.getList.useQuery();

  return (
    <Select
      value={value?.toString()}
      onValueChange={(value) => onValueChange?.(value)}
      disabled={(ruleList?.length ?? 0) === 0}
    >
      <SelectTrigger>
        <SelectValue placeholder={t("item.rule.singular") ?? "Rule"} />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {(ruleList ?? []).map(({ RID, name }) => (
            <SelectItem key={RID} value={RID}>
              {name ?? RID}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
};

export default RuleSelect;
