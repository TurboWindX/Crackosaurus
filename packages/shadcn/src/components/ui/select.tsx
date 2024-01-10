import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import * as React from "react";

import { cn } from "../../lib/utils";

const Select = SelectPrimitive.Root;

const SelectGroup = SelectPrimitive.Group;

const SelectValue = SelectPrimitive.Value;

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      "scn-flex scn-h-10 scn-w-full scn-items-center scn-justify-between scn-rounded-md scn-border scn-border-input scn-bg-background scn-px-3 scn-py-2 scn-text-sm scn-ring-offset-background placeholder:scn-text-muted-foreground focus:scn-outline-none focus:scn-ring-2 focus:scn-ring-ring focus:scn-ring-offset-2 disabled:scn-cursor-not-allowed disabled:scn-opacity-50 [&>span]:scn-line-clamp-1",
      className
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="scn-h-4 scn-w-4 scn-opacity-50" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

const SelectScrollUpButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollUpButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollUpButton
    ref={ref}
    className={cn(
      "scn-flex scn-cursor-default scn-items-center scn-justify-center scn-py-1",
      className
    )}
    {...props}
  >
    <ChevronUp className="scn-h-4 scn-w-4" />
  </SelectPrimitive.ScrollUpButton>
));
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName;

const SelectScrollDownButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollDownButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollDownButton
    ref={ref}
    className={cn(
      "scn-flex scn-cursor-default scn-items-center scn-justify-center scn-py-1",
      className
    )}
    {...props}
  >
    <ChevronDown className="scn-h-4 scn-w-4" />
  </SelectPrimitive.ScrollDownButton>
));
SelectScrollDownButton.displayName =
  SelectPrimitive.ScrollDownButton.displayName;

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = "popper", ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      className={cn(
        "scn-relative scn-z-50 scn-max-h-96 scn-min-w-[8rem] scn-overflow-hidden scn-rounded-md scn-border scn-bg-popover scn-text-popover-foreground scn-shadow-md data-[state=open]:scn-animate-in data-[state=closed]:scn-animate-out data-[state=closed]:scn-fade-out-0 data-[state=open]:scn-fade-in-0 data-[state=closed]:scn-zoom-out-95 data-[state=open]:scn-zoom-in-95 data-[side=bottom]:scn-slide-in-from-top-2 data-[side=left]:scn-slide-in-from-right-2 data-[side=right]:scn-slide-in-from-left-2 data-[side=top]:scn-slide-in-from-bottom-2",
        position === "popper" &&
          "data-[side=bottom]:scn-translate-y-1 data-[side=left]:scn--translate-x-1 data-[side=right]:scn-translate-x-1 data-[side=top]:scn--translate-y-1",
        className
      )}
      position={position}
      {...props}
    >
      <SelectScrollUpButton />
      <SelectPrimitive.Viewport
        className={cn(
          "scn-p-1",
          position === "popper" &&
            "scn-h-[var(--radix-select-trigger-height)] scn-w-full scn-min-w-[var(--radix-select-trigger-width)]"
        )}
      >
        {children}
      </SelectPrimitive.Viewport>
      <SelectScrollDownButton />
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
));
SelectContent.displayName = SelectPrimitive.Content.displayName;

const SelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Label
    ref={ref}
    className={cn(
      "scn-py-1.5 scn-pl-8 scn-pr-2 scn-text-sm scn-font-semibold",
      className
    )}
    {...props}
  />
));
SelectLabel.displayName = SelectPrimitive.Label.displayName;

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      "scn-relative scn-flex scn-w-full scn-cursor-default scn-select-none scn-items-center scn-rounded-sm scn-py-1.5 scn-pl-8 scn-pr-2 scn-text-sm scn-outline-none focus:scn-bg-accent focus:scn-text-accent-foreground data-[disabled]:scn-pointer-events-none data-[disabled]:scn-opacity-50",
      className
    )}
    {...props}
  >
    <span className="scn-absolute scn-left-2 scn-flex scn-h-3.5 scn-w-3.5 scn-items-center scn-justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="scn-h-4 scn-w-4" />
      </SelectPrimitive.ItemIndicator>
    </span>

    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
));
SelectItem.displayName = SelectPrimitive.Item.displayName;

const SelectSeparator = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator
    ref={ref}
    className={cn("scn--mx-1 scn-my-1 scn-h-px scn-bg-muted", className)}
    {...props}
  />
));
SelectSeparator.displayName = SelectPrimitive.Separator.displayName;

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
};
