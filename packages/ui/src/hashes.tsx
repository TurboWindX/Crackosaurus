import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { HASH_TYPES } from "@repo/hashcat/data";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/shadcn/components/ui/select";

interface HashTypeSelectProps {
  value: number;
  onValueChange?: (type: number) => void;
}

export const HashTypeSelect = ({
  value,
  onValueChange,
}: HashTypeSelectProps) => {
  const { t } = useTranslation();

  const hashValues = useMemo(
    () => Object.entries(HASH_TYPES).sort((a, b) => a[0].localeCompare(b[0])),
    []
  );

  return (
    <Select
      value={value.toString()}
      onValueChange={(value) => onValueChange && onValueChange(parseInt(value))}
    >
      <SelectTrigger>
        <SelectValue placeholder={t("item.type.singular")} />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {hashValues.map(([type, value]) => (
            <SelectItem key={type} value={value.toString()}>
              {type}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
};
