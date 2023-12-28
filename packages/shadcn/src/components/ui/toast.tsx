import * as React from "react"
import * as ToastPrimitives from "@radix-ui/react-toast"
import { cva, type VariantProps } from "class-variance-authority"
import { X } from "lucide-react"

import { cn } from "../../lib/utils"

const ToastProvider = ToastPrimitives.Provider

const ToastViewport = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Viewport>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Viewport
    ref={ref}
    className={cn(
      "scn-fixed scn-top-0 scn-z-[100] scn-flex scn-max-h-screen scn-w-full scn-flex-col-reverse scn-p-4 sm:scn-bottom-0 sm:scn-right-0 sm:scn-top-auto sm:scn-flex-col md:scn-max-w-[420px]",
      className
    )}
    {...props}
  />
))
ToastViewport.displayName = ToastPrimitives.Viewport.displayName

const toastVariants = cva(
  "scn-group scn-pointer-events-auto scn-relative scn-flex scn-w-full scn-items-center scn-justify-between scn-space-x-4 scn-overflow-hidden scn-rounded-md scn-border scn-p-6 scn-pr-8 scn-shadow-lg scn-transition-all data-[swipe=cancel]:scn-translate-x-0 data-[swipe=end]:scn-translate-x-[var(--radix-toast-swipe-end-x)] data-[swipe=move]:scn-translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=move]:scn-transition-none data-[state=open]:scn-animate-in data-[state=closed]:scn-animate-out data-[swipe=end]:scn-animate-out data-[state=closed]:scn-fade-out-80 data-[state=closed]:scn-slide-out-to-right-full data-[state=open]:scn-slide-in-from-top-full data-[state=open]:sm:scn-slide-in-from-bottom-full",
  {
    variants: {
      variant: {
        default: "scn-border scn-bg-background scn-text-foreground",
        destructive:
          "scn-destructive scn-group scn-border-destructive scn-bg-destructive scn-text-destructive-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const Toast = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Root> &
    VariantProps<typeof toastVariants>
>(({ className, variant, ...props }, ref) => {
  return (
    <ToastPrimitives.Root
      ref={ref}
      className={cn(toastVariants({ variant }), className)}
      {...props}
    />
  )
})
Toast.displayName = ToastPrimitives.Root.displayName

const ToastAction = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Action>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Action>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Action
    ref={ref}
    className={cn(
      "scn-inline-flex scn-h-8 scn-shrink-0 scn-items-center scn-justify-center scn-rounded-md scn-border scn-bg-transparent scn-px-3 scn-text-sm scn-font-medium scn-ring-offset-background scn-transition-colors hover:scn-bg-secondary focus:scn-outline-none focus:scn-ring-2 focus:scn-ring-ring focus:scn-ring-offset-2 disabled:scn-pointer-events-none disabled:scn-opacity-50 group-[.destructive]:scn-border-muted/40 group-[.destructive]:hover:scn-border-destructive/30 group-[.destructive]:hover:scn-bg-destructive group-[.destructive]:hover:scn-text-destructive-foreground group-[.destructive]:focus:scn-ring-destructive",
      className
    )}
    {...props}
  />
))
ToastAction.displayName = ToastPrimitives.Action.displayName

const ToastClose = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Close>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Close>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Close
    ref={ref}
    className={cn(
      "scn-absolute scn-right-2 scn-top-2 scn-rounded-md scn-p-1 scn-text-foreground/50 scn-opacity-0 scn-transition-opacity hover:scn-text-foreground focus:scn-opacity-100 focus:scn-outline-none focus:scn-ring-2 group-hover:scn-opacity-100 group-[.destructive]:scn-text-red-300 group-[.destructive]:hover:scn-text-red-50 group-[.destructive]:focus:scn-ring-red-400 group-[.destructive]:focus:scn-ring-offset-red-600",
      className
    )}
    toast-close=""
    {...props}
  >
    <X className="scn-h-4 scn-w-4" />
  </ToastPrimitives.Close>
))
ToastClose.displayName = ToastPrimitives.Close.displayName

const ToastTitle = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Title>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Title
    ref={ref}
    className={cn("scn-text-sm scn-font-semibold", className)}
    {...props}
  />
))
ToastTitle.displayName = ToastPrimitives.Title.displayName

const ToastDescription = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Description>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Description>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Description
    ref={ref}
    className={cn("scn-text-sm scn-opacity-90", className)}
    {...props}
  />
))
ToastDescription.displayName = ToastPrimitives.Description.displayName

type ToastProps = React.ComponentPropsWithoutRef<typeof Toast>

type ToastActionElement = React.ReactElement<typeof ToastAction>

export {
  type ToastProps,
  type ToastActionElement,
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastAction,
}
