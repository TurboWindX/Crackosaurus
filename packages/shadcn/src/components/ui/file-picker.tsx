import { ImportIcon } from "lucide-react";
import { useMemo } from "react";

import { cn } from "../../lib/utils";

export interface FilePickerProps {
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  file?: File | null;
  accept?: string[];
  onChange?: (file: File | null) => void;
}

const FilePicker = ({
  className,
  accept,
  file,
  disabled,
  placeholder,
  onChange,
}: FilePickerProps) => {
  const isPlaceholder = useMemo(
    () => file === null || file === undefined,
    [file]
  );
  const isDisabled = useMemo(() => disabled === true, [disabled]);
  const label = useMemo(
    () => file?.name ?? placeholder ?? "No file selected.",
    [file, placeholder]
  );

  return (
    <label>
      <div
        className={cn(
          "scn-flex scn-h-10 scn-w-full scn-gap-2 scn-rounded-md scn-border scn-border-input scn-bg-background scn-px-3 scn-py-2 scn-text-sm scn-ring-offset-background focus-visible:scn-outline-none focus-visible:scn-ring-2 focus-visible:scn-ring-ring focus-visible:scn-ring-offset-2",
          isPlaceholder && "scn-text-muted-foreground",
          isDisabled
            ? "scn-cursor-not-allowed scn-opacity-50"
            : "scn-cursor-pointer",
          className
        )}
      >
        <ImportIcon />
        {label}
      </div>
      <input
        type="file"
        disabled={isDisabled}
        className="scn-hidden"
        accept={accept ? accept.join(", ") : undefined}
        onChange={(e) => onChange?.(e.target?.files?.[0] ?? null)}
      />
    </label>
  );
};

export { FilePicker };
