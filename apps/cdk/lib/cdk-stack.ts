import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";

import { AppStack } from "./app-stack";

export class CdkStack extends Stack {
  public readonly app: AppStack;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    this.app = new AppStack(this, {
      vpcType: "aws",
      databaseType: "postgresql",
      databaseCreditals: "secret",
      database: {},
      cluster: {},
      prisma: {},
      server: {},
    });
  }
}
