// Stub aws-sdk so importing/instantiating AwsCluster pulls no real SDK. The
// pure methods under test (backoff, capacity-error classification, getTypes)
// never touch AWS — clients are created in load(), which we never call.
jest.mock("aws-sdk", () => {
  const stub = function () {
    return {};
  };
  return {
    EC2: stub,
    StepFunctions: stub,
    S3: stub,
    Credentials: stub,
    config: { update: () => {} },
  };
});

import {
  DEFAULT_INSTANCE_TYPE,
  RAINBOW_INSTANCE_TYPES,
} from "@repo/app-config/instance-types";

import { AwsCluster } from "../src/aws-cluster";

// Config is only stored by the base constructor; the pure methods ignore it.
const cluster = new AwsCluster({
  instanceRoot: "/tmp/i",
  wordlistRoot: "/tmp/w",
  ruleRoot: "/tmp/r",
} as never);

// Reach the private helpers without widening their visibility in source.
const priv = cluster as unknown as {
  launchBackoffMs(attempts: number): number;
  classifyLaunchError(error?: string, cause?: string): "park" | "error";
};

describe("AwsCluster identity + types", () => {
  it("getName is 'aws'", () => {
    expect(cluster.getName()).toBe("aws");
  });

  it("getTypes accepts GPU default + all auto-pinned rainbow types", () => {
    const types = cluster.getTypes();
    expect(types).toContain(DEFAULT_INSTANCE_TYPE);
    for (const rt of RAINBOW_INSTANCE_TYPES) {
      expect(types).toContain(rt);
    }
  });
});

describe("launchBackoffMs (exponential, capped at 5m)", () => {
  it("doubles from 30s", () => {
    expect(priv.launchBackoffMs(1)).toBe(30_000);
    expect(priv.launchBackoffMs(2)).toBe(60_000);
    expect(priv.launchBackoffMs(3)).toBe(120_000);
    expect(priv.launchBackoffMs(4)).toBe(240_000);
  });
  it("caps at 5 minutes", () => {
    expect(priv.launchBackoffMs(5)).toBe(300_000);
    expect(priv.launchBackoffMs(50)).toBe(300_000);
  });
});

describe("classifyLaunchError (park transient capacity, fail closed on real errors)", () => {
  it("parks on an explicit capacity/throttle code", () => {
    expect(priv.classifyLaunchError("InsufficientInstanceCapacity")).toBe(
      "park"
    );
    expect(priv.classifyLaunchError("RequestLimitExceeded")).toBe("park");
    expect(priv.classifyLaunchError("ThrottlingException")).toBe("park");
  });

  it("parks on a generic wrapper whose cause embeds the capacity phrasing", () => {
    expect(
      priv.classifyLaunchError(
        "Ec2.Ec2Exception",
        "We currently do not have sufficient p5.48xlarge capacity in the Availability Zone"
      )
    ).toBe("park");
  });

  it("fails closed (error) on a real misconfiguration", () => {
    expect(
      priv.classifyLaunchError("ValidationError", "The image id 'ami-x' does not exist")
    ).toBe("error");
    expect(
      priv.classifyLaunchError(
        "AccessDenied",
        "is not authorized to perform: ec2:RunInstances"
      )
    ).toBe("error");
  });

  it("fails closed on an unrecognised/empty failure", () => {
    expect(priv.classifyLaunchError(undefined, undefined)).toBe("error");
    expect(priv.classifyLaunchError("", "")).toBe("error");
  });
});
