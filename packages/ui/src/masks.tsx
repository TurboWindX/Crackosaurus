import { useState } from "react";

import { Input } from "@repo/shadcn/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@repo/shadcn/components/ui/select";

interface MaskPreset {
  label: string;
  mask: string;
  example: string;
}

interface MaskPresetGroup {
  label: string;
  presets: MaskPreset[];
}

const MASK_PRESET_GROUPS: MaskPresetGroup[] = [
  {
    label: "Upper + Lower + Digits + Year",
    presets: [
      {
        label: "Uaaaaaadddd",
        mask: "?u?l?l?l?l?l?l?d?d?d?d",
        example: "Password2024",
      },
    ],
  },
  {
    label: "Word + Digits",
    presets: [
      {
        label: "Uaaaadd",
        mask: "?u?l?l?l?l?l?d?d",
        example: "Summer23",
      },
      {
        label: "Uaaaaaadd",
        mask: "?u?l?l?l?l?l?l?d?d",
        example: "Welcome12",
      },
      {
        label: "Uaaaaaaadd",
        mask: "?u?l?l?l?l?l?l?l?d?d",
        example: "Cracking42",
      },
    ],
  },
  {
    label: "Word + Special + Digits",
    presets: [
      {
        label: "Uaaaaa!dd",
        mask: "?u?l?l?l?l?l?s?d?d",
        example: "Summer!23",
      },
      {
        label: "Uaaaaaa!dd",
        mask: "?u?l?l?l?l?l?l?s?d?d",
        example: "Welcome!23",
      },
    ],
  },
  {
    label: "Season / Month + Year",
    presets: [
      {
        label: "Uaaaaadddd",
        mask: "?u?l?l?l?l?l?d?d?d?d",
        example: "Spring2024",
      },
    ],
  },
  {
    label: "Simple Patterns",
    presets: [
      {
        label: "Uaaaaaad",
        mask: "?u?l?l?l?l?l?l?l?d",
        example: "Password1",
      },
      {
        label: "Uaaaaaaddd",
        mask: "?u?l?l?l?l?l?l?d?d?d",
        example: "Welcome123",
      },
    ],
  },
];

/** Flat list of all preset mask strings for lookup */
const ALL_PRESETS = MASK_PRESET_GROUPS.flatMap((g) => g.presets);

const CUSTOM_VALUE = "__custom__";

export interface MaskInputProps {
  value: string;
  onChange: (value: string) => void;
}

/**
 * Mask input with a preset dropdown and optional custom text field.
 * When the current value matches a preset, the dropdown shows that preset.
 * Otherwise it shows "Custom" with the text input visible.
 */
export const MaskInput = ({ value, onChange }: MaskInputProps) => {
  // Track whether the user explicitly chose "Custom"
  const [forceCustom, setForceCustom] = useState(false);

  const matchedPreset = !forceCustom
    ? ALL_PRESETS.find((p) => p.mask === value)
    : undefined;

  const isCustom = !matchedPreset;

  const handlePresetChange = (selected: string) => {
    if (selected === CUSTOM_VALUE) {
      setForceCustom(true);
      // Don't clear the value — keep whatever they had
      return;
    }
    setForceCustom(false);
    onChange(selected); // selected IS the mask string
  };

  return (
    <div className="grid gap-2">
      <label className="text-sm font-medium">Mask Pattern</label>

      <Select
        value={isCustom ? CUSTOM_VALUE : value}
        onValueChange={handlePresetChange}
      >
        <SelectTrigger>
          <SelectValue placeholder="Select a mask preset…" />
        </SelectTrigger>
        <SelectContent>
          {MASK_PRESET_GROUPS.map((group) => (
            <SelectGroup key={group.label}>
              <SelectLabel>{group.label}</SelectLabel>
              {group.presets.map((preset) => (
                <SelectItem key={preset.mask} value={preset.mask}>
                  <span className="font-mono text-xs">{preset.mask}</span>
                  <span className="text-muted-foreground ml-2 text-xs">
                    {preset.example}
                  </span>
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
          <SelectGroup>
            <SelectItem value={CUSTOM_VALUE}>Custom mask…</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>

      {isCustom && (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="?a?a?a?a?a?a?a?a"
        />
      )}

      {matchedPreset && (
        <p className="text-muted-foreground text-xs">
          Example: <span className="font-mono">{matchedPreset.example}</span>
        </p>
      )}
    </div>
  );
};

export default MaskInput;
