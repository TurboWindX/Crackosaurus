import {
  DEFAULT_INSTANCE_TYPE,
  DEFAULT_RAINBOW_INSTANCE_TYPE,
  INSTANCE_TYPE_VALUES,
  isRainbowInstanceType,
  nextCapacityFallbackType,
  RAINBOW_INSTANCE_TYPES,
} from "../instance-types";

describe("nextCapacityFallbackType (capacity-fallback ladder)", () => {
  it("steps g6.12xlarge down to g5.12xlarge", () => {
    expect(nextCapacityFallbackType("g6.12xlarge")).toBe("g5.12xlarge");
  });
  it("returns null at the end of a ladder", () => {
    expect(nextCapacityFallbackType("g5.12xlarge")).toBeNull();
  });
  it("returns null for a type in no ladder", () => {
    expect(nextCapacityFallbackType("t3.micro")).toBeNull();
  });
});

describe("isRainbowInstanceType", () => {
  it("is true for a rainbow (i3en) type", () => {
    expect(isRainbowInstanceType("i3en.12xlarge")).toBe(true);
  });
  it("is false for a GPU type", () => {
    expect(isRainbowInstanceType("g6.12xlarge")).toBe(false);
  });
  it("is false for null/undefined", () => {
    expect(isRainbowInstanceType(null)).toBe(false);
    expect(isRainbowInstanceType(undefined)).toBe(false);
  });
});

describe("instance-type invariants", () => {
  it("the default GPU type is a real selectable GPU type", () => {
    expect(INSTANCE_TYPE_VALUES).toContain(DEFAULT_INSTANCE_TYPE);
  });
  it("the default rainbow type is a real rainbow type", () => {
    expect(RAINBOW_INSTANCE_TYPES as readonly string[]).toContain(
      DEFAULT_RAINBOW_INSTANCE_TYPE
    );
  });
  it("rainbow types are kept OUT of the operator GPU dropdown", () => {
    for (const rt of RAINBOW_INSTANCE_TYPES) {
      expect(INSTANCE_TYPE_VALUES).not.toContain(rt);
    }
  });
});
