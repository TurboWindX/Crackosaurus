import { useMemo, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";

import { HASH_TYPES } from "@repo/hashcat/data";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/shadcn/components/ui/select";
import { Input } from "@repo/shadcn/components/ui/input";

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
    if (!predefinedValues.has(value as any) && value > 0) {
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
      onValueChange && onValueChange(parseInt(newValue));
    }
  };

  const handleCustomInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    setCustomHashType(inputValue);
    
    const numValue = parseInt(inputValue);
    if (!isNaN(numValue) && numValue >= 1 && numValue <= 99999) {
      onValueChange && onValueChange(numValue);
    }
  };

  if (isAdvancedMode) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">Custom Hash Type (1-99999)</label>
          <button
            type="button"
            onClick={() => {
              setIsAdvancedMode(false);
              setCustomHashType("");
              onValueChange && onValueChange(HASH_TYPES.plaintext);
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
    <Select
      value={value.toString()}
      onValueChange={handleSelectChange}
    >
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
