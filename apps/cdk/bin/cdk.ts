#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import "source-map-support/register";

import { CdkStack } from "../lib/cdk-stack";

const account = process.env.CDK_DEFAULT_ACCOUNT;
const region = process.env.CDK_DEFAULT_REGION;

const app = new cdk.App();
new CdkStack(app, `crackosaurus-${region}`, {
  env: {
    account,
    region,
  },
});
