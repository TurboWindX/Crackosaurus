import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { type APIType } from "@repo/api/server";
import { type RES } from "@repo/api/server/client/web";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/shadcn/components/ui/select";

import { useAPI } from "./api";

export interface InstanceSelectProps {
  value?: string | null;
  onValueChange?: (value: string) => void;
  filter?: (user: RES<APIType["getInstanceList"]>[number]) => boolean;
}

export const InstanceSelect = ({
  value,
  onValueChange,
  filter,
}: InstanceSelectProps) => {
  const API = useAPI();

  const { data: instanceList } = useQuery({
    queryKey: ["instances", "list", "component"],
    queryFn: API.getInstanceList,
  });

  const filteredInstances = useMemo(
    () => (instanceList ?? []).filter((instance) => filter?.(instance) ?? true),
    [instanceList, filter]
  );

  return (
    <Select
      value={value?.toString()}
      onValueChange={(value) => onValueChange?.(value)}
      disabled={filteredInstances.length === 0}
    >
      <SelectTrigger>
        <SelectValue placeholder="Instance" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {filteredInstances.map(({ IID, name }) => (
            <SelectItem key={IID} value={IID}>
              {name || IID}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
};
