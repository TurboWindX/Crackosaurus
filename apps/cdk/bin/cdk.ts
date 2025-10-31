#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import "source-map-support/register";

import { CrackosaurusStack } from "../lib/production-stack";

const account = process.env.CDK_DEFAULT_ACCOUNT || process.env.AWS_ACCOUNT_ID;
const region = process.env.CDK_DEFAULT_REGION || process.env.AWS_REGION || "ca-central-1";

if (!account) {
  throw new Error("AWS account not configured. Set CDK_DEFAULT_ACCOUNT or AWS_ACCOUNT_ID");
}

const app = new cdk.App();

// Get configuration from context or environment
const config = {
  environmentName: app.node.tryGetContext("environment") || process.env.ENVIRONMENT || "dev",
  domainName: app.node.tryGetContext("domainName") || process.env.DOMAIN_NAME,
  certificateArn: app.node.tryGetContext("certificateArn") || process.env.CERTIFICATE_ARN,
  hostedZoneId: app.node.tryGetContext("hostedZoneId") || process.env.HOSTED_ZONE_ID,
  dbPassword: app.node.tryGetContext("dbPassword") || process.env.DB_PASSWORD || "CHANGE_ME_IN_PRODUCTION",
};

// Create the main stack - EC2-based deployment (~$65/month)
new CrackosaurusStack(app, `Crackosaurus-${config.environmentName}`, {
  env: { account, region },
  description: `Crackosaurus password cracking platform - ${config.environmentName} environment [EC2 ~$65/mo]`,
  ...config,
});

app.synth();
