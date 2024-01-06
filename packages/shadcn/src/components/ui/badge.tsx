import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils";

const badgeVariants = cva(
  "scn-inline-flex scn-items-center scn-rounded-full scn-border scn-px-2.5 scn-py-0.5 scn-text-xs scn-font-semibold scn-transition-colors focus:scn-outline-none focus:scn-ring-2 focus:scn-ring-ring focus:scn-ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "scn-border-transparent scn-bg-primary scn-text-primary-foreground hover:scn-bg-primary/80",
        secondary:
          "scn-border-transparent scn-bg-secondary scn-text-secondary-foreground hover:scn-bg-secondary/80",
        destructive:
          "scn-border-transparent scn-bg-destructive scn-text-destructive-foreground hover:scn-bg-destructive/80",
        outline: "scn-text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        badgeVariants({
          variant,
        }),
        className
      )}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
