import * as SheetPrimitive from "@radix-ui/react-dialog";
import { type VariantProps, cva } from "class-variance-authority";
import { X } from "lucide-react";
import * as React from "react";

import { cn } from "../../lib/utils";

const Sheet = SheetPrimitive.Root;

const SheetTrigger = SheetPrimitive.Trigger;

const SheetClose = SheetPrimitive.Close;

const SheetPortal = SheetPrimitive.Portal;

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Overlay
    className={cn(
      "scn-fixed scn-inset-0 scn-z-50 scn-bg-black/80 data-[state=open]:scn-animate-in data-[state=closed]:scn-animate-out data-[state=closed]:scn-fade-out-0 data-[state=open]:scn-fade-in-0",
      className
    )}
    {...props}
    ref={ref}
  />
));
SheetOverlay.displayName = SheetPrimitive.Overlay.displayName;

const sheetVariants = cva(
  "scn-fixed scn-z-50 scn-gap-4 scn-bg-background scn-p-6 scn-shadow-lg scn-transition scn-ease-in-out data-[state=open]:scn-animate-in data-[state=closed]:scn-animate-out data-[state=closed]:scn-duration-300 data-[state=open]:scn-duration-500",
  {
    variants: {
      side: {
        top: "scn-inset-x-0 scn-top-0 scn-border-b data-[state=closed]:scn-slide-out-to-top data-[state=open]:scn-slide-in-from-top",
        bottom:
          "scn-inset-x-0 scn-bottom-0 scn-border-t data-[state=closed]:scn-slide-out-to-bottom data-[state=open]:scn-slide-in-from-bottom",
        left: "scn-inset-y-0 scn-left-0 scn-h-full scn-w-3/4 scn-border-r data-[state=closed]:scn-slide-out-to-left data-[state=open]:scn-slide-in-from-left sm:scn-max-w-sm",
        right:
          "scn-inset-y-0 scn-right-0 scn-h-full scn-w-3/4 scn- scn-border-l data-[state=closed]:scn-slide-out-to-right data-[state=open]:scn-slide-in-from-right sm:scn-max-w-sm",
      },
    },
    defaultVariants: {
      side: "right",
    },
  }
);

interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content>,
    VariantProps<typeof sheetVariants> {}

const SheetContent = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Content>,
  SheetContentProps
>(({ side = "right", className, children, ...props }, ref) => (
  <SheetPortal>
    <SheetOverlay />
    <SheetPrimitive.Content
      ref={ref}
      className={cn(
        sheetVariants({
          side,
        }),
        className
      )}
      {...props}
    >
      {children}
      <SheetPrimitive.Close className="scn-absolute scn-right-4 scn-top-4 scn-rounded-sm scn-opacity-70 scn-ring-offset-background scn-transition-opacity hover:scn-opacity-100 focus:scn-outline-none focus:scn-ring-2 focus:scn-ring-ring focus:scn-ring-offset-2 disabled:scn-pointer-events-none data-[state=open]:scn-bg-secondary">
        <X className="scn-h-4 scn-w-4" />
        <span className="scn-sr-only">Close</span>
      </SheetPrimitive.Close>
    </SheetPrimitive.Content>
  </SheetPortal>
));
SheetContent.displayName = SheetPrimitive.Content.displayName;

const SheetHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "scn-flex scn-flex-col scn-space-y-2 scn-text-center sm:scn-text-left",
      className
    )}
    {...props}
  />
);
SheetHeader.displayName = "SheetHeader";

const SheetFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "scn-flex scn-flex-col-reverse sm:scn-flex-row sm:scn-justify-end sm:scn-space-x-2",
      className
    )}
    {...props}
  />
);
SheetFooter.displayName = "SheetFooter";

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Title
    ref={ref}
    className={cn(
      "scn-text-lg scn-font-semibold scn-text-foreground",
      className
    )}
    {...props}
  />
));
SheetTitle.displayName = SheetPrimitive.Title.displayName;

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Description
    ref={ref}
    className={cn("scn-text-sm scn-text-muted-foreground", className)}
    {...props}
  />
));
SheetDescription.displayName = SheetPrimitive.Description.displayName;

export {
  Sheet,
  SheetPortal,
  SheetOverlay,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
