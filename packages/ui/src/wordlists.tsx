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

import { trpc } from "./api";

const K = 1024;
const LOG_K = Math.log(K);
const MEMORY_SIZES = ["B", "KB", "MB", "GB", "TB", "PB", "EB"];

export const MemorySize = ({ value }: { value: number }) => {
  const size = useMemo(() => {
    if (value === null || value === undefined) return "?";

    if (value === 0) return "0 B";

    const i = Math.floor(Math.log(value) / LOG_K);
    const size = (value / Math.pow(K, i)).toFixed(2);

    return `${size} ${MEMORY_SIZES[i]}`;
  }, [value]);

  return size;
};

export interface WordlistSelectProps {
  value?: string | null;
  onValueChange?: (value: string) => void;
}

export const WordlistSelect = ({
  value,
  onValueChange,
}: WordlistSelectProps) => {
  const { t } = useTranslation();

  const { data: wordlistList } = trpc.wordlist.getList.useQuery();

  return (
    <Select
      value={value?.toString()}
      onValueChange={(value) => onValueChange?.(value)}
      disabled={(wordlistList?.length ?? 0) === 0}
    >
      <SelectTrigger>
        <SelectValue placeholder={t("item.wordlist.singular")} />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {(wordlistList ?? []).map(({ WID, name }) => (
            <SelectItem key={WID} value={WID}>
              {name ?? WID}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
};
