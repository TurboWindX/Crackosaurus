import {
  getMaxInstanceLifeHours,
  MAX_INSTANCE_LIFE_HOURS_CEILING,
  setMaxInstanceLifeHours,
} from "../src/lib/settings";

const prismaWith = (row: { value: string } | null) =>
  ({ appSetting: { findUnique: async () => row } }) as never;

describe("getMaxInstanceLifeHours — fail-safe (0 = reaper disabled)", () => {
  it("returns 0 when the setting was never saved", async () => {
    expect(await getMaxInstanceLifeHours(prismaWith(null))).toBe(0);
  });

  it("returns a valid positive stored value", async () => {
    expect(await getMaxInstanceLifeHours(prismaWith({ value: "48" }))).toBe(48);
  });

  it("returns 0 for a non-numeric stored value", async () => {
    expect(await getMaxInstanceLifeHours(prismaWith({ value: "abc" }))).toBe(0);
  });

  it("returns 0 for a non-positive value", async () => {
    expect(await getMaxInstanceLifeHours(prismaWith({ value: "0" }))).toBe(0);
    expect(await getMaxInstanceLifeHours(prismaWith({ value: "-5" }))).toBe(0);
  });

  it("returns 0 for a value above the ceiling (silent-disable guard)", async () => {
    expect(
      await getMaxInstanceLifeHours(
        prismaWith({ value: String(MAX_INSTANCE_LIFE_HOURS_CEILING + 1) })
      )
    ).toBe(0);
  });

  it("accepts a value exactly at the ceiling", async () => {
    expect(
      await getMaxInstanceLifeHours(
        prismaWith({ value: String(MAX_INSTANCE_LIFE_HOURS_CEILING) })
      )
    ).toBe(MAX_INSTANCE_LIFE_HOURS_CEILING);
  });
});

describe("setMaxInstanceLifeHours", () => {
  it("upserts the value as a string under the max-life key", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const prisma = {
      appSetting: {
        upsert: async (args: Record<string, unknown>) => {
          calls.push(args);
          return {};
        },
      },
    } as never;

    await setMaxInstanceLifeHours(prisma, 72);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      update: { value: "72" },
      create: { value: "72" },
    });
  });
});
