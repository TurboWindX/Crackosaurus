import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { Check, ChevronRight, Circle } from "lucide-react";
import * as React from "react";

import { cn } from "../../lib/utils";

const DropdownMenu = DropdownMenuPrimitive.Root;

const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

const DropdownMenuGroup = DropdownMenuPrimitive.Group;

const DropdownMenuPortal = DropdownMenuPrimitive.Portal;

const DropdownMenuSub = DropdownMenuPrimitive.Sub;

const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;

const DropdownMenuSubTrigger = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubTrigger> & {
    inset?: boolean;
  }
>(({ className, inset, children, ...props }, ref) => (
  <DropdownMenuPrimitive.SubTrigger
    ref={ref}
    className={cn(
      "scn-flex scn-cursor-default scn-select-none scn-items-center scn-rounded-sm scn-px-2 scn-py-1.5 scn-text-sm scn-outline-none focus:scn-bg-accent data-[state=open]:scn-bg-accent",
      inset && "scn-pl-8",
      className
    )}
    {...props}
  >
    {children}
    <ChevronRight className="scn-ml-auto scn-h-4 scn-w-4" />
  </DropdownMenuPrimitive.SubTrigger>
));
DropdownMenuSubTrigger.displayName =
  DropdownMenuPrimitive.SubTrigger.displayName;

const DropdownMenuSubContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubContent>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubContent>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.SubContent
    ref={ref}
    className={cn(
      "scn-z-50 scn-min-w-[8rem] scn-overflow-hidden scn-rounded-md scn-border scn-bg-popover scn-p-1 scn-text-popover-foreground scn-shadow-lg data-[state=open]:scn-animate-in data-[state=closed]:scn-animate-out data-[state=closed]:scn-fade-out-0 data-[state=open]:scn-fade-in-0 data-[state=closed]:scn-zoom-out-95 data-[state=open]:scn-zoom-in-95 data-[side=bottom]:scn-slide-in-from-top-2 data-[side=left]:scn-slide-in-from-right-2 data-[side=right]:scn-slide-in-from-left-2 data-[side=top]:scn-slide-in-from-bottom-2",
      className
    )}
    {...props}
  />
));
DropdownMenuSubContent.displayName =
  DropdownMenuPrimitive.SubContent.displayName;

const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "scn-z-50 scn-min-w-[8rem] scn-overflow-hidden scn-rounded-md scn-border scn-bg-popover scn-p-1 scn-text-popover-foreground scn-shadow-md data-[state=open]:scn-animate-in data-[state=closed]:scn-animate-out data-[state=closed]:scn-fade-out-0 data-[state=open]:scn-fade-in-0 data-[state=closed]:scn-zoom-out-95 data-[state=open]:scn-zoom-in-95 data-[side=bottom]:scn-slide-in-from-top-2 data-[side=left]:scn-slide-in-from-right-2 data-[side=right]:scn-slide-in-from-left-2 data-[side=top]:scn-slide-in-from-bottom-2",
        className
      )}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
));
DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName;

const DropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & {
    inset?: boolean;
  }
>(({ className, inset, ...props }, ref) => (
  <DropdownMenuPrimitive.Item
    ref={ref}
    className={cn(
      "scn-relative scn-flex scn-cursor-default scn-select-none scn-items-center scn-rounded-sm scn-px-2 scn-py-1.5 scn-text-sm scn-outline-none scn-transition-colors focus:scn-bg-accent focus:scn-text-accent-foreground data-[disabled]:scn-pointer-events-none data-[disabled]:scn-opacity-50",
      inset && "scn-pl-8",
      className
    )}
    {...props}
  />
));
DropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName;

const DropdownMenuCheckboxItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.CheckboxItem>
>(({ className, children, checked, ...props }, ref) => (
  <DropdownMenuPrimitive.CheckboxItem
    ref={ref}
    className={cn(
      "scn-relative scn-flex scn-cursor-default scn-select-none scn-items-center scn-rounded-sm scn-py-1.5 scn-pl-8 scn-pr-2 scn-text-sm scn-outline-none scn-transition-colors focus:scn-bg-accent focus:scn-text-accent-foreground data-[disabled]:scn-pointer-events-none data-[disabled]:scn-opacity-50",
      className
    )}
    checked={checked}
    {...props}
  >
    <span className="scn-absolute scn-left-2 scn-flex scn-h-3.5 scn-w-3.5 scn-items-center scn-justify-center">
      <DropdownMenuPrimitive.ItemIndicator>
        <Check className="scn-h-4 scn-w-4" />
      </DropdownMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </DropdownMenuPrimitive.CheckboxItem>
));
DropdownMenuCheckboxItem.displayName =
  DropdownMenuPrimitive.CheckboxItem.displayName;

const DropdownMenuRadioItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.RadioItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.RadioItem>
>(({ className, children, ...props }, ref) => (
  <DropdownMenuPrimitive.RadioItem
    ref={ref}
    className={cn(
      "scn-relative scn-flex scn-cursor-default scn-select-none scn-items-center scn-rounded-sm scn-py-1.5 scn-pl-8 scn-pr-2 scn-text-sm scn-outline-none scn-transition-colors focus:scn-bg-accent focus:scn-text-accent-foreground data-[disabled]:scn-pointer-events-none data-[disabled]:scn-opacity-50",
      className
    )}
    {...props}
  >
    <span className="scn-absolute scn-left-2 scn-flex scn-h-3.5 scn-w-3.5 scn-items-center scn-justify-center">
      <DropdownMenuPrimitive.ItemIndicator>
        <Circle className="scn-h-2 scn-w-2 scn-fill-current" />
      </DropdownMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </DropdownMenuPrimitive.RadioItem>
));
DropdownMenuRadioItem.displayName = DropdownMenuPrimitive.RadioItem.displayName;

const DropdownMenuLabel = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label> & {
    inset?: boolean;
  }
>(({ className, inset, ...props }, ref) => (
  <DropdownMenuPrimitive.Label
    ref={ref}
    className={cn(
      "scn-px-2 scn-py-1.5 scn-text-sm scn-font-semibold",
      inset && "scn-pl-8",
      className
    )}
    {...props}
  />
));
DropdownMenuLabel.displayName = DropdownMenuPrimitive.Label.displayName;

const DropdownMenuSeparator = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Separator
    ref={ref}
    className={cn("scn--mx-1 scn-my-1 scn-h-px scn-bg-muted", className)}
    {...props}
  />
));
DropdownMenuSeparator.displayName = DropdownMenuPrimitive.Separator.displayName;

const DropdownMenuShortcut = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) => {
  return (
    <span
      className={cn(
        "scn-ml-auto scn-text-xs scn-tracking-widest scn-opacity-60",
        className
      )}
      {...props}
    />
  );
};
DropdownMenuShortcut.displayName = "DropdownMenuShortcut";

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuRadioGroup,
};
