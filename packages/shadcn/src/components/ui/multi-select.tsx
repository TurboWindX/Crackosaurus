import { ChevronDown } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { cn } from "../../lib/utils";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "./dropdown-menu";

export interface MultiSelectProps {
  label: string;
  values: [string, string][];
  selectedValues: string[];
  onValueChange?: (values: string[]) => void;
  className?: string;
}

export const MultiSelect = (props: MultiSelectProps) => {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLButtonElement>(null);

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

  return (
    <>
      <DropdownMenu open={open} onOpenChange={(state) => setOpen(state)}>
        <DropdownMenuTrigger
          asChild
          ref={menuRef}
          disabled={props.values.length === 0}
        >
          <button
            className="scn-flex scn-h-10 scn-w-full scn-items-center scn-justify-between scn-rounded-md scn-border scn-border-input scn-bg-background scn-px-3 scn-py-2 scn-text-sm scn-ring-offset-background placeholder:scn-text-muted-foreground focus:scn-outline-none focus:scn-ring-2 focus:scn-ring-ring focus:scn-ring-offset-2 disabled:scn-cursor-not-allowed disabled:scn-opacity-50 [&>span]:scn-line-clamp-1"
            disabled={props.values.length === 0}
          >
            <span className="scn-shrink scn-truncate">
              {props.selectedValues.length === 0
                ? props.label
                : props.selectedValues
                    .map((v) => props.values.find(([ov, _]) => v === ov)?.[1])
                    .join(", ")}
            </span>
            <ChevronDown className="scn-h-4 scn-w-4 scn-opacity-50" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className={cn(
            "scn-relative scn-z-50 scn-max-h-[30vh] scn-min-w-[8rem] scn-overflow-hidden scn-rounded-md scn-border scn-bg-popover scn-text-popover-foreground scn-shadow-md data-[state=open]:scn-animate-in data-[state=closed]:scn-animate-out data-[state=closed]:scn-fade-out-0 data-[state=open]:scn-fade-in-0 data-[state=closed]:scn-zoom-out-95 data-[state=open]:scn-zoom-in-95 data-[side=bottom]:scn-slide-in-from-top-2 data-[side=left]:scn-slide-in-from-right-2 data-[side=right]:scn-slide-in-from-left-2 data-[side=top]:scn-slide-in-from-bottom-2",
            "data-[side=bottom]:scn-translate-y-1 data-[side=left]:scn--translate-x-1 data-[side=right]:scn-translate-x-1 data-[side=top]:scn--translate-y-1",
            "scn-overflow-y-scroll",
            props.className
          )}
          style={{
            width: menuRef.current
              ? `${menuRef.current.offsetWidth}px`
              : undefined,
          }}
          collisionPadding={10}
        >
          {props.values.map(([key, value]) => (
            <DropdownMenuCheckboxItem
              key={key}
              checked={selectMap[key]}
              onCheckedChange={(checked) => {
                updateSelect({
                  ...selectMap,
                  [key]: checked,
                });
              }}
              onSelect={(e) => e.preventDefault()}
            >
              {value}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
};
