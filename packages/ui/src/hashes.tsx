import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { HASH_TYPES, getHashName, isSlowHashType } from "@repo/hashcat/data";
import { Input } from "@repo/shadcn/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/shadcn/components/ui/select";

interface HashTypeSelectProps {
  value: number;
  onValueChange?: (type: number) => void;
}

export const HashTypeSelect = ({
  value,
  onValueChange,
}: HashTypeSelectProps) => {
  const { t } = useTranslation();
  const [isAdvancedMode, setIsAdvancedMode] = useState(false);
  const [customHashType, setCustomHashType] = useState("");

  const hashValues = useMemo(
    () => Object.entries(HASH_TYPES).sort((a, b) => a[0].localeCompare(b[0])),
    []
  );

  // Check if current value is a predefined hash type
  const predefinedValues = useMemo(
    () => new Set<number>(Object.values(HASH_TYPES)),
    []
  );

  useEffect(() => {
    if (!predefinedValues.has(value as number) && value > 0) {
      setIsAdvancedMode(true);
      setCustomHashType(value.toString());
    }
  }, [value, predefinedValues]);

  const handleSelectChange = (newValue: string) => {
    if (newValue === "advanced") {
      setIsAdvancedMode(true);
      setCustomHashType("");
    } else {
      setIsAdvancedMode(false);
      if (onValueChange) onValueChange(parseInt(newValue));
    }
  };

  const handleCustomInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    setCustomHashType(inputValue);

    const numValue = parseInt(inputValue);
    if (!isNaN(numValue) && numValue >= 1 && numValue <= 99999) {
      if (onValueChange) onValueChange(numValue);
    }
  };

  if (isAdvancedMode) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">
            Custom Hash Type (1-99999)
          </label>
          <button
            type="button"
            onClick={() => {
              setIsAdvancedMode(false);
              setCustomHashType("");
              if (onValueChange) onValueChange(HASH_TYPES.plaintext);
            }}
            className="text-xs text-blue-600 hover:text-blue-800 underline"
          >
            Back to presets
          </button>
        </div>
        <Input
          type="number"
          min={1}
          max={99999}
          value={customHashType}
          onChange={handleCustomInputChange}
          placeholder="Enter hash type number (e.g., 1000)"
          className="w-full"
        />
      </div>
    );
  }

  return (
    <Select value={value.toString()} onValueChange={handleSelectChange}>
      <SelectTrigger>
        <SelectValue placeholder={t("item.type.singular")} />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {hashValues.map(([type, value]) => (
            <SelectItem key={type} value={value.toString()}>
              {type}
            </SelectItem>
          ))}
          <SelectItem value="advanced" className="text-blue-600 font-medium">
            Advanced (Custom Hash Type)
          </SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  );
};

interface SlowHashWarningProps {
  /** A single hash-type mode, or several (e.g. every hash queued for a job). */
  hashType?: number;
  hashTypes?: number[];
  className?: string;
}

/**
 * Warns when a selected hash type is a "slow"/robust hash (bcrypt, scrypt,
 * PBKDF2, WPA, disk/document/wallet encryption, …). These crack orders of
 * magnitude slower than fast hashes, so a large wordlist paired with a large
 * ruleset can run for days or effectively forever — even on multi-GPU
 * instances. Renders nothing for fast hash types.
 */
export const SlowHashWarning = ({
  hashType,
  hashTypes,
  className,
}: SlowHashWarningProps) => {
  const { t } = useTranslation();

  const slowModes = useMemo(() => {
    const modes = [
      ...(hashType !== undefined ? [hashType] : []),
      ...(hashTypes ?? []),
    ];
    return [...new Set(modes.filter(isSlowHashType))];
  }, [hashType, hashTypes]);

  if (slowModes.length === 0) return null;

  const names = slowModes.map(getHashName).join(", ");

  return (
    <div
      role="alert"
      className={`rounded-lg border border-yellow-500 bg-yellow-50 p-3 text-xs dark:bg-yellow-950/20 ${
        className ?? ""
      }`}
    >
      <p className="font-medium text-yellow-800 dark:text-yellow-300">
        ⚠{" "}
        {t("message.slowHash.title", {
          defaultValue: "Slow hash type ({{names}})",
          names,
        })}
      </p>
      <p className="mt-1 text-yellow-700 dark:text-yellow-400">
        {t("message.slowHash.body", {
          defaultValue:
            "This hash type is computationally expensive to crack — throughput is orders of magnitude lower than fast hashes (MD5, NTLM, SHA-1), even across multiple GPUs. Avoid pairing a very large wordlist with a large ruleset: the run may take days or may never finish. Prefer a targeted wordlist and few or no rules.",
        })}
      </p>
    </div>
  );
};
