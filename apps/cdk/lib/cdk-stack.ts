import { Stack, StackProps } from "aws-cdk-lib";
import { SubnetType } from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";

import { AppStack } from "./app-stack";

export class CdkStack extends Stack {
  public readonly app: AppStack;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    this.app = new AppStack(this, {
      databaseType: "postgresql",
      database: {
        subnetType: SubnetType.PRIVATE_ISOLATED,
      },
      cluster: {
        hostname: "cluster",
        subnetType: SubnetType.PRIVATE_WITH_EGRESS,
        memoryLimitMiB: 512,
      },
      server: {
        hostname: "server",
        subnetType: SubnetType.PRIVATE_WITH_EGRESS,
        memoryLimitMiB: 512,
      },
    });
  }
}
