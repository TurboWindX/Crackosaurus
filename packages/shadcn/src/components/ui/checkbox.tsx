import * as React from "react"
import * as CheckboxPrimitive from "@radix-ui/react-checkbox"
import { Check } from "lucide-react"

import { cn } from "../../lib/utils"

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      "scn-peer scn-h-4 scn-w-4 scn-shrink-0 scn-rounded-sm scn-border scn-border-primary scn-ring-offset-background focus-visible:scn-outline-none focus-visible:scn-ring-2 focus-visible:scn-ring-ring focus-visible:scn-ring-offset-2 disabled:scn-cursor-not-allowed disabled:scn-opacity-50 data-[state=checked]:scn-bg-primary data-[state=checked]:scn-text-primary-foreground",
      className
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator
      className={cn("scn-flex scn-items-center scn-justify-center scn-text-current")}
    >
      <Check className="scn-h-4 scn-w-4" />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
))
Checkbox.displayName = CheckboxPrimitive.Root.displayName

export { Checkbox }
