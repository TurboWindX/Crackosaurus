import * as React from "react"
import * as MenubarPrimitive from "@radix-ui/react-menubar"
import { Check, ChevronRight, Circle } from "lucide-react"

import { cn } from "../../lib/utils"

const MenubarMenu = MenubarPrimitive.Menu

const MenubarGroup = MenubarPrimitive.Group

const MenubarPortal = MenubarPrimitive.Portal

const MenubarSub = MenubarPrimitive.Sub

const MenubarRadioGroup = MenubarPrimitive.RadioGroup

const Menubar = React.forwardRef<
  React.ElementRef<typeof MenubarPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof MenubarPrimitive.Root>
>(({ className, ...props }, ref) => (
  <MenubarPrimitive.Root
    ref={ref}
    className={cn(
      "scn-flex scn-h-10 scn-items-center scn-space-x-1 scn-rounded-md scn-border scn-bg-background scn-p-1",
      className
    )}
    {...props}
  />
))
Menubar.displayName = MenubarPrimitive.Root.displayName

const MenubarTrigger = React.forwardRef<
  React.ElementRef<typeof MenubarPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof MenubarPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <MenubarPrimitive.Trigger
    ref={ref}
    className={cn(
      "scn-flex scn-cursor-default scn-select-none scn-items-center scn-rounded-sm scn-px-3 scn-py-1.5 scn-text-sm scn-font-medium scn-outline-none focus:scn-bg-accent focus:scn-text-accent-foreground data-[state=open]:scn-bg-accent data-[state=open]:scn-text-accent-foreground",
      className
    )}
    {...props}
  />
))
MenubarTrigger.displayName = MenubarPrimitive.Trigger.displayName

const MenubarSubTrigger = React.forwardRef<
  React.ElementRef<typeof MenubarPrimitive.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof MenubarPrimitive.SubTrigger> & {
    inset?: boolean
  }
>(({ className, inset, children, ...props }, ref) => (
  <MenubarPrimitive.SubTrigger
    ref={ref}
    className={cn(
      "scn-flex scn-cursor-default scn-select-none scn-items-center scn-rounded-sm scn-px-2 scn-py-1.5 scn-text-sm scn-outline-none focus:scn-bg-accent focus:scn-text-accent-foreground data-[state=open]:scn-bg-accent data-[state=open]:scn-text-accent-foreground",
      inset && "scn-pl-8",
      className
    )}
    {...props}
  >
    {children}
    <ChevronRight className="scn-ml-auto scn-h-4 scn-w-4" />
  </MenubarPrimitive.SubTrigger>
))
MenubarSubTrigger.displayName = MenubarPrimitive.SubTrigger.displayName

const MenubarSubContent = React.forwardRef<
  React.ElementRef<typeof MenubarPrimitive.SubContent>,
  React.ComponentPropsWithoutRef<typeof MenubarPrimitive.SubContent>
>(({ className, ...props }, ref) => (
  <MenubarPrimitive.SubContent
    ref={ref}
    className={cn(
      "scn-z-50 scn-min-w-[8rem] scn-overflow-hidden scn-rounded-md scn-border scn-bg-popover scn-p-1 scn-text-popover-foreground data-[state=open]:scn-animate-in data-[state=closed]:scn-animate-out data-[state=closed]:scn-fade-out-0 data-[state=open]:scn-fade-in-0 data-[state=closed]:scn-zoom-out-95 data-[state=open]:scn-zoom-in-95 data-[side=bottom]:scn-slide-in-from-top-2 data-[side=left]:scn-slide-in-from-right-2 data-[side=right]:scn-slide-in-from-left-2 data-[side=top]:scn-slide-in-from-bottom-2",
      className
    )}
    {...props}
  />
))
MenubarSubContent.displayName = MenubarPrimitive.SubContent.displayName

const MenubarContent = React.forwardRef<
  React.ElementRef<typeof MenubarPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof MenubarPrimitive.Content>
>(
  (
    { className, align = "start", alignOffset = -4, sideOffset = 8, ...props },
    ref
  ) => (
    <MenubarPrimitive.Portal>
      <MenubarPrimitive.Content
        ref={ref}
        align={align}
        alignOffset={alignOffset}
        sideOffset={sideOffset}
        className={cn(
          "scn-z-50 scn-min-w-[12rem] scn-overflow-hidden scn-rounded-md scn-border scn-bg-popover scn-p-1 scn-text-popover-foreground scn-shadow-md data-[state=open]:scn-animate-in data-[state=closed]:scn-fade-out-0 data-[state=open]:scn-fade-in-0 data-[state=closed]:scn-zoom-out-95 data-[state=open]:scn-zoom-in-95 data-[side=bottom]:scn-slide-in-from-top-2 data-[side=left]:scn-slide-in-from-right-2 data-[side=right]:scn-slide-in-from-left-2 data-[side=top]:scn-slide-in-from-bottom-2",
          className
        )}
        {...props}
      />
    </MenubarPrimitive.Portal>
  )
)
MenubarContent.displayName = MenubarPrimitive.Content.displayName

const MenubarItem = React.forwardRef<
  React.ElementRef<typeof MenubarPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof MenubarPrimitive.Item> & {
    inset?: boolean
  }
>(({ className, inset, ...props }, ref) => (
  <MenubarPrimitive.Item
    ref={ref}
    className={cn(
      "scn-relative scn-flex scn-cursor-default scn-select-none scn-items-center scn-rounded-sm scn-px-2 scn-py-1.5 scn-text-sm scn-outline-none focus:scn-bg-accent focus:scn-text-accent-foreground data-[disabled]:scn-pointer-events-none data-[disabled]:scn-opacity-50",
      inset && "scn-pl-8",
      className
    )}
    {...props}
  />
))
MenubarItem.displayName = MenubarPrimitive.Item.displayName

const MenubarCheckboxItem = React.forwardRef<
  React.ElementRef<typeof MenubarPrimitive.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof MenubarPrimitive.CheckboxItem>
>(({ className, children, checked, ...props }, ref) => (
  <MenubarPrimitive.CheckboxItem
    ref={ref}
    className={cn(
      "scn-relative scn-flex scn-cursor-default scn-select-none scn-items-center scn-rounded-sm scn-py-1.5 scn-pl-8 scn-pr-2 scn-text-sm scn-outline-none focus:scn-bg-accent focus:scn-text-accent-foreground data-[disabled]:scn-pointer-events-none data-[disabled]:scn-opacity-50",
      className
    )}
    checked={checked}
    {...props}
  >
    <span className="scn-absolute scn-left-2 scn-flex scn-h-3.5 scn-w-3.5 scn-items-center scn-justify-center">
      <MenubarPrimitive.ItemIndicator>
        <Check className="scn-h-4 scn-w-4" />
      </MenubarPrimitive.ItemIndicator>
    </span>
    {children}
  </MenubarPrimitive.CheckboxItem>
))
MenubarCheckboxItem.displayName = MenubarPrimitive.CheckboxItem.displayName

const MenubarRadioItem = React.forwardRef<
  React.ElementRef<typeof MenubarPrimitive.RadioItem>,
  React.ComponentPropsWithoutRef<typeof MenubarPrimitive.RadioItem>
>(({ className, children, ...props }, ref) => (
  <MenubarPrimitive.RadioItem
    ref={ref}
    className={cn(
      "scn-relative scn-flex scn-cursor-default scn-select-none scn-items-center scn-rounded-sm scn-py-1.5 scn-pl-8 scn-pr-2 scn-text-sm scn-outline-none focus:scn-bg-accent focus:scn-text-accent-foreground data-[disabled]:scn-pointer-events-none data-[disabled]:scn-opacity-50",
      className
    )}
    {...props}
  >
    <span className="scn-absolute scn-left-2 scn-flex scn-h-3.5 scn-w-3.5 scn-items-center scn-justify-center">
      <MenubarPrimitive.ItemIndicator>
        <Circle className="scn-h-2 scn-w-2 scn-fill-current" />
      </MenubarPrimitive.ItemIndicator>
    </span>
    {children}
  </MenubarPrimitive.RadioItem>
))
MenubarRadioItem.displayName = MenubarPrimitive.RadioItem.displayName

const MenubarLabel = React.forwardRef<
  React.ElementRef<typeof MenubarPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof MenubarPrimitive.Label> & {
    inset?: boolean
  }
>(({ className, inset, ...props }, ref) => (
  <MenubarPrimitive.Label
    ref={ref}
    className={cn(
      "scn-px-2 scn-py-1.5 scn-text-sm scn-font-semibold",
      inset && "scn-pl-8",
      className
    )}
    {...props}
  />
))
MenubarLabel.displayName = MenubarPrimitive.Label.displayName

const MenubarSeparator = React.forwardRef<
  React.ElementRef<typeof MenubarPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof MenubarPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <MenubarPrimitive.Separator
    ref={ref}
    className={cn("scn--mx-1 scn-my-1 scn-h-px scn-bg-muted", className)}
    {...props}
  />
))
MenubarSeparator.displayName = MenubarPrimitive.Separator.displayName

const MenubarShortcut = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) => {
  return (
    <span
      className={cn(
        "scn-ml-auto scn-text-xs scn-tracking-widest scn-text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}
MenubarShortcut.displayname = "MenubarShortcut"

export {
  Menubar,
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
  MenubarLabel,
  MenubarCheckboxItem,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarPortal,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarGroup,
  MenubarSub,
  MenubarShortcut,
}
