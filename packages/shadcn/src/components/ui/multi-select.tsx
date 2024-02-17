import { useMemo } from "react";

import { Button } from "./button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "./select";

export interface MultiSelectProps {
  label: string;
  values: [string, string][];
  selectedValues: string[];
  onValueChange?: (values: string[]) => void;
}

export const MultiSelect = (props: MultiSelectProps) => {
  function updateSelect(map: Record<string, boolean>) {
    if (props.onValueChange)
      props.onValueChange(
        Object.entries(map)
          .filter(([_, state]) => state)
          .map(([value]) => value)
      );
  }

  const selectMap = useMemo(
    () =>
      Object.fromEntries(props.selectedValues.map((value) => [value, true])),
    [props.selectedValues]
  );

  const selectedValues = useMemo(
    () =>
      Object.entries(selectMap)
        .filter(([_, state]) => state)
        .map(([value]) => value)
        .sort((a, b) => a.localeCompare(b)),
    [selectMap]
  );
  const remainingValues = useMemo(
    () => props.values.filter(([id]) => !selectMap[id]),
    [props.values, selectMap]
  );

  const valueMap = useMemo(
    () => Object.fromEntries(props.values),
    [props.values]
  );

  return (
    <>
      <Select
        value=""
        onValueChange={(value) => {
          updateSelect({
            ...selectMap,
            [value]: true,
          });
        }}
      >
        <SelectTrigger>
          <SelectValue placeholder={props.label} />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>{props.label}</SelectLabel>
            {remainingValues.map(([value, label]) => (
              <SelectItem value={value}>{label}</SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      {selectedValues.map((id) => (
        <Button
          variant="outline"
          onClick={() =>
            updateSelect({
              ...selectMap,
              [id]: false,
            })
          }
        >
          {valueMap[id]}
        </Button>
      ))}
    </>
  );
};
