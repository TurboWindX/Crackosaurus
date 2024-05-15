import * as NavigationMenuPrimitive from "@radix-ui/react-navigation-menu";
import { cva } from "class-variance-authority";
import { ChevronDown } from "lucide-react";
import * as React from "react";

import { cn } from "../../lib/utils";

const NavigationMenu = React.forwardRef<
  React.ElementRef<typeof NavigationMenuPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof NavigationMenuPrimitive.Root>
>(({ className, children, ...props }, ref) => (
  <NavigationMenuPrimitive.Root
    ref={ref}
    className={cn(
      "scn-relative scn-z-10 scn-flex scn-max-w-max scn-flex-1 scn-items-center scn-justify-center",
      className
    )}
    {...props}
  >
    {children}
    <NavigationMenuViewport />
  </NavigationMenuPrimitive.Root>
));
NavigationMenu.displayName = NavigationMenuPrimitive.Root.displayName;

const NavigationMenuList = React.forwardRef<
  React.ElementRef<typeof NavigationMenuPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof NavigationMenuPrimitive.List>
>(({ className, ...props }, ref) => (
  <NavigationMenuPrimitive.List
    ref={ref}
    className={cn(
      "scn-group scn-flex scn-flex-1 scn-list-none scn-items-center scn-justify-center scn-space-x-1",
      className
    )}
    {...props}
  />
));
NavigationMenuList.displayName = NavigationMenuPrimitive.List.displayName;

const NavigationMenuItem = NavigationMenuPrimitive.Item;

const navigationMenuTriggerStyle = cva(
  "scn-group scn-inline-flex scn-h-10 scn-w-max scn-items-center scn-justify-center scn-bg-background scn-px-4 scn-py-2 scn-text-sm scn-font-medium scn-transition-colors hover:scn-bg-accent hover:scn-text-accent-foreground focus:scn-bg-accent focus:scn-text-accent-foreground focus:scn-outline-none disabled:scn-pointer-events-none disabled:scn-opacity-50 data-[active]:scn-bg-accent/50 data-[state=open]:scn-bg-accent/50"
);

const NavigationMenuTrigger = React.forwardRef<
  React.ElementRef<typeof NavigationMenuPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof NavigationMenuPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <NavigationMenuPrimitive.Trigger
    ref={ref}
    className={cn(navigationMenuTriggerStyle(), "scn-group", className)}
    {...props}
  >
    {children}{" "}
    <ChevronDown
      className="scn-relative scn-top-[1px] scn-ml-1 scn-h-3 scn-w-3 scn-transition scn-duration-200 group-data-[state=open]:scn-rotate-180"
      aria-hidden="true"
    />
  </NavigationMenuPrimitive.Trigger>
));
NavigationMenuTrigger.displayName = NavigationMenuPrimitive.Trigger.displayName;

const NavigationMenuContent = React.forwardRef<
  React.ElementRef<typeof NavigationMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof NavigationMenuPrimitive.Content>
>(({ className, ...props }, ref) => (
  <NavigationMenuPrimitive.Content
    ref={ref}
    className={cn(
      "scn-left-0 scn-top-0 scn-w-full data-[motion^=from-]:scn-animate-in data-[motion^=to-]:scn-animate-out data-[motion^=from-]:scn-fade-in data-[motion^=to-]:scn-fade-out data-[motion=from-end]:scn-slide-in-from-right-52 data-[motion=from-start]:scn-slide-in-from-left-52 data-[motion=to-end]:scn-slide-out-to-right-52 data-[motion=to-start]:scn-slide-out-to-left-52 md:scn-absolute md:scn-w-auto",
      className
    )}
    {...props}
  />
));
NavigationMenuContent.displayName = NavigationMenuPrimitive.Content.displayName;

const NavigationMenuLink = NavigationMenuPrimitive.Link;

const NavigationMenuViewport = React.forwardRef<
  React.ElementRef<typeof NavigationMenuPrimitive.Viewport>,
  React.ComponentPropsWithoutRef<typeof NavigationMenuPrimitive.Viewport>
>(({ className, ...props }, ref) => (
  <div
    className={cn(
      "scn-absolute scn-left-0 scn-top-full scn-flex scn-justify-center"
    )}
  >
    <NavigationMenuPrimitive.Viewport
      className={cn(
        "scn-origin-top-center scn-relative scn-mt-1.5 scn-h-[var(--radix-navigation-menu-viewport-height)] scn-w-full scn-overflow-hidden scn-rounded-md scn-border scn-bg-popover scn-text-popover-foreground scn-shadow-lg data-[state=open]:scn-animate-in data-[state=closed]:scn-animate-out data-[state=closed]:scn-zoom-out-95 data-[state=open]:scn-zoom-in-90 md:scn-w-[var(--radix-navigation-menu-viewport-width)]",
        className
      )}
      ref={ref}
      {...props}
    />
  </div>
));
NavigationMenuViewport.displayName =
  NavigationMenuPrimitive.Viewport.displayName;

const NavigationMenuIndicator = React.forwardRef<
  React.ElementRef<typeof NavigationMenuPrimitive.Indicator>,
  React.ComponentPropsWithoutRef<typeof NavigationMenuPrimitive.Indicator>
>(({ className, ...props }, ref) => (
  <NavigationMenuPrimitive.Indicator
    ref={ref}
    className={cn(
      "scn-top-full scn-z-[1] scn-flex scn-h-1.5 scn-items-end scn-justify-center scn-overflow-hidden data-[state=visible]:scn-animate-in data-[state=hidden]:scn-animate-out data-[state=hidden]:scn-fade-out data-[state=visible]:scn-fade-in",
      className
    )}
    {...props}
  >
    <div className="scn-relative scn-top-[60%] scn-h-2 scn-w-2 scn-rotate-45 scn-rounded-tl-sm scn-bg-border scn-shadow-md" />
  </NavigationMenuPrimitive.Indicator>
));
NavigationMenuIndicator.displayName =
  NavigationMenuPrimitive.Indicator.displayName;

export {
  navigationMenuTriggerStyle,
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuContent,
  NavigationMenuTrigger,
  NavigationMenuLink,
  NavigationMenuIndicator,
  NavigationMenuViewport,
};
