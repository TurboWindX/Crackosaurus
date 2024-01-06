import { cn } from "../../lib/utils";

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("scn-animate-pulse scn-rounded-md scn-bg-muted", className)}
      {...props}
    />
  );
}

export { Skeleton };
