jest.mock("aws-sdk", () => {
  const stub = function () {
    return {};
  };
  return { EC2: stub, StepFunctions: stub, S3: stub, Credentials: stub, config: { update: () => {} } };
});

import { AwsCluster } from "../src/aws-cluster";

function newCluster(): AwsCluster {
  return new AwsCluster({
    instanceRoot: "/tmp/i",
    wordlistRoot: "/tmp/w",
    ruleRoot: "/tmp/r",
  } as never);
}

// aws-sdk v2 call shape: client.method(params).promise()
function setEc2(c: AwsCluster, ec2: unknown) {
  (c as unknown as { ec2: unknown }).ec2 = ec2;
}
const promised = (fn: () => unknown) => () => ({ promise: async () => fn() });

describe("getLiveInstanceIDs (describeInstances)", () => {
  it("returns the InstanceID tag of each running/pending box", async () => {
    const c = newCluster();
    setEc2(c, {
      describeInstances: promised(() => ({
        Reservations: [
          {
            Instances: [
              {
                Tags: [
                  { Key: "ManagedBy", Value: "Crackosaurus" },
                  { Key: "InstanceID", Value: "inst-abc" },
                ],
              },
            ],
          },
        ],
      })),
    });
    expect(await c.getLiveInstanceIDs()).toEqual(["inst-abc"]);
  });

  it("falls back to a UUID embedded in the Name tag", async () => {
    const uuid = "12345678-1234-1234-1234-123456789abc";
    const c = newCluster();
    setEc2(c, {
      describeInstances: promised(() => ({
        Reservations: [
          { Instances: [{ Tags: [{ Key: "Name", Value: `crackosaurus-${uuid}` }] }] },
        ],
      })),
    });
    expect(await c.getLiveInstanceIDs()).toEqual([uuid]);
  });

  it("aggregates across NextToken pages", async () => {
    const c = newCluster();
    let call = 0;
    setEc2(c, {
      describeInstances: () => ({
        promise: async () => {
          call += 1;
          return call === 1
            ? {
                Reservations: [
                  { Instances: [{ Tags: [{ Key: "InstanceID", Value: "a" }] }] },
                ],
                NextToken: "page2",
              }
            : {
                Reservations: [
                  { Instances: [{ Tags: [{ Key: "InstanceID", Value: "b" }] }] },
                ],
              };
        },
      }),
    });
    const ids = (await c.getLiveInstanceIDs()) ?? [];
    expect(ids.sort()).toEqual(["a", "b"]);
  });

  it("returns null on an EC2 error (so reapers never guess-kill)", async () => {
    const c = newCluster();
    setEc2(c, {
      describeInstances: promised(() => {
        throw new Error("AccessDenied");
      }),
    });
    expect(await c.getLiveInstanceIDs()).toBeNull();
  });
});

describe("checkInstanceAvailability (describeInstanceTypeOfferings)", () => {
  it("marks offered types available with their AZs", async () => {
    const c = newCluster();
    setEc2(c, {
      describeInstanceTypeOfferings: promised(() => ({
        InstanceTypeOfferings: [
          { InstanceType: "g6.12xlarge", Location: "ca-central-1a" },
          { InstanceType: "g6.12xlarge", Location: "ca-central-1b" },
        ],
      })),
    });
    const result = await c.checkInstanceAvailability();
    expect(result["g6.12xlarge"].available).toBe(true);
    expect(result["g6.12xlarge"].azs).toEqual(["ca-central-1a", "ca-central-1b"]);
  });

  it("fails open (all available) on an EC2 error so users aren't blocked", async () => {
    const c = newCluster();
    setEc2(c, {
      describeInstanceTypeOfferings: promised(() => {
        throw new Error("Throttling");
      }),
    });
    const result = await c.checkInstanceAvailability();
    for (const t of c.getTypes()) expect(result[t].available).toBe(true);
  });

  it("caches within the TTL (second call does not hit EC2)", async () => {
    const c = newCluster();
    let calls = 0;
    setEc2(c, {
      describeInstanceTypeOfferings: () => {
        calls += 1;
        return { promise: async () => ({ InstanceTypeOfferings: [] }) };
      },
    });
    await c.checkInstanceAvailability();
    await c.checkInstanceAvailability();
    expect(calls).toBe(1);
  });
});
