import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
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
        <SelectValue placeholder={t("item.instance.singular")} />
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

export interface InstanceTypeSelectProps {
  value?: string | null;
  onValueChange?: (value: string) => void;
}

export const InstanceTypeSelect = ({
  value,
  onValueChange,
}: InstanceTypeSelectProps) => {
  const { t } = useTranslation();
  const API = useAPI();

  const { data: instanceTypes } = useQuery({
    queryKey: ["instances", "types"],
    queryFn: API.getInstanceTypes,
  });

  return (
    <Select
      value={value?.toString()}
      onValueChange={(value) => onValueChange?.(value)}
    >
      <SelectTrigger>
        <SelectValue placeholder={t("item.type.singular")} />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {(instanceTypes ?? []).map((type) => (
            <SelectItem key={type} value={type}>
              {type}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
};
