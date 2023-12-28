import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../../lib/utils"

const buttonVariants = cva(
  "scn-inline-flex scn-items-center scn-justify-center scn-whitespace-nowrap scn-rounded-md scn-text-sm scn-font-medium scn-ring-offset-background scn-transition-colors focus-visible:scn-outline-none focus-visible:scn-ring-2 focus-visible:scn-ring-ring focus-visible:scn-ring-offset-2 disabled:scn-pointer-events-none disabled:scn-opacity-50",
  {
    variants: {
      variant: {
        default: "scn-bg-primary scn-text-primary-foreground hover:scn-bg-primary/90",
        destructive:
          "scn-bg-destructive scn-text-destructive-foreground hover:scn-bg-destructive/90",
        outline:
          "scn-border scn-border-input scn-bg-background hover:scn-bg-accent hover:scn-text-accent-foreground",
        secondary:
          "scn-bg-secondary scn-text-secondary-foreground hover:scn-bg-secondary/80",
        ghost: "hover:scn-bg-accent hover:scn-text-accent-foreground",
        link: "scn-text-primary scn-underline-offset-4 hover:scn-underline",
      },
      size: {
        default: "scn-h-10 scn-px-4 scn-py-2",
        sm: "scn-h-9 scn-rounded-md scn-px-3",
        lg: "scn-h-11 scn-rounded-md scn-px-8",
        icon: "scn-h-10 scn-w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
