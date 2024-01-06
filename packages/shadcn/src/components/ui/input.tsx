import * as React from "react";

import { cn } from "../../lib/utils";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "scn-flex scn-h-10 scn-w-full scn-rounded-md scn-border scn-border-input scn-bg-background scn-px-3 scn-py-2 scn-text-sm scn-ring-offset-background file:scn-border-0 file:scn-bg-transparent file:scn-text-sm file:scn-font-medium placeholder:scn-text-muted-foreground focus-visible:scn-outline-none focus-visible:scn-ring-2 focus-visible:scn-ring-ring focus-visible:scn-ring-offset-2 disabled:scn-cursor-not-allowed disabled:scn-opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
