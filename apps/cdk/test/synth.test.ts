// DockerImage.fromBuild runs `docker build` eagerly at call time (to tag the
// image), so merely constructing the InstanceStack would build the hashcat
// image. Stub it to a registry reference — combined with bundling-stacks:[]
// (which skips the bundle run), synth needs no Docker at all.
jest.mock("aws-cdk-lib", () => {
  const actual = jest.requireActual("aws-cdk-lib");
  actual.DockerImage.fromBuild = () =>
    actual.DockerImage.fromRegistry("stub-bundling-image");
  return actual;
});

import * as cdk from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";

import { CrackosaurusStack } from "../lib/ec2-stack";

let template: Template;
let templateJson: string;

beforeAll(() => {
  const app = new cdk.App({ context: { "aws:cdk:bundling-stacks": [] } });
  const stack = new CrackosaurusStack(app, "Crackosaurus-test", {
    env: { account: "123456789012", region: "ca-central-1" },
    environmentName: "test",
    serverConfig: {},
    clusterConfig: {},
  });
  template = Template.fromStack(stack);
  templateJson = JSON.stringify(template.toJSON());
});

describe("CrackosaurusStack — core resources synthesize", () => {
  it("has a VPC", () => {
    template.resourceCountIs("AWS::EC2::VPC", 1);
  });
  it("has an EFS filesystem for shared job coordination", () => {
    template.resourceCountIs("AWS::EFS::FileSystem", 1);
  });
  it("has a Step Functions state machine for instance lifecycle", () => {
    const machines = template.findResources("AWS::StepFunctions::StateMachine");
    expect(Object.keys(machines).length).toBeGreaterThanOrEqual(1);
  });
});

describe("IAM least-privilege (locks the GPU-box scoping)", () => {
  it("TerminateInstances is conditioned on the ManagedBy=Crackosaurus tag", () => {
    template.hasResourceProperties(
      "AWS::IAM::Policy",
      Match.objectLike({
        PolicyDocument: Match.objectLike({
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: "ec2:TerminateInstances",
              Condition: Match.objectLike({
                StringEquals: Match.objectLike({
                  "ec2:ResourceTag/ManagedBy": "Crackosaurus",
                }),
              }),
            }),
          ]),
        }),
      })
    );
  });

  it("does not attach AmazonEC2FullAccess to any role", () => {
    expect(templateJson).not.toContain("AmazonEC2FullAccess");
  });
});

describe("EC2 user-data cost-safety (locks the robust self-terminate)", () => {
  it("defines a retrying, fallback-guarded terminate_self", () => {
    expect(templateJson).toContain("terminate_self");
    expect(templateJson).toContain("shutdown -h now");
  });
  it("runs terminate on any exit via an EXIT trap", () => {
    expect(templateJson).toContain("trap terminate_self EXIT");
  });
  it("has a dead-man backstop for a wedged worker", () => {
    expect(templateJson).toContain("DEADMAN_SECONDS");
  });
});
