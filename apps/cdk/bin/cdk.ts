#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import * as fs from "fs";
import * as path from "path";
import "source-map-support/register";

import { CrackosaurusStack } from "../lib/ec2-stack";

const account = process.env.CDK_DEFAULT_ACCOUNT || process.env.AWS_ACCOUNT_ID;
const region =
  process.env.CDK_DEFAULT_REGION || process.env.AWS_REGION || "ca-central-1";

if (!account) {
  throw new Error(
    "AWS account not configured. Set CDK_DEFAULT_ACCOUNT or AWS_ACCOUNT_ID"
  );
}

const app = new cdk.App();

// Get configuration from context or environment
const config = {
  environmentName:
    app.node.tryGetContext("environment") || process.env.ENVIRONMENT || "dev",
  imageTag:
    app.node.tryGetContext("imageTag") ||
    process.env.IMAGE_TAG ||
    app.node.tryGetContext("environment") ||
    process.env.ENVIRONMENT ||
    "dev",
  domainName: app.node.tryGetContext("domainName") || process.env.DOMAIN_NAME,
  certificateArn:
    app.node.tryGetContext("certificateArn") || process.env.CERTIFICATE_ARN,
  hostedZoneId:
    app.node.tryGetContext("hostedZoneId") || process.env.HOSTED_ZONE_ID,
};

// Load optional per-service config files from apps/cdk/config/{server,cluster}.json
const configDir = path.join(__dirname, "..", "config");
let serverConfig: Record<string, unknown> = {};
const clusterConfig: Record<string, unknown> = {};
try {
  const serverPath = path.join(configDir, "server.json");
  if (fs.existsSync(serverPath)) {
    serverConfig = JSON.parse(fs.readFileSync(serverPath, "utf8"));
  }
  const clusterPath = path.join(configDir, "cluster.json");
  if (fs.existsSync(clusterPath)) {
    Object.assign(
      clusterConfig,
      JSON.parse(fs.readFileSync(clusterPath, "utf8"))
    );
  }
} catch {
  // ignore parse errors and continue with defaults
}

// Fallbacks for server config
if (!serverConfig["imageTag"]) {
  serverConfig["imageTag"] = config.imageTag;
}

// Fallbacks for cluster config
if (!clusterConfig["imageTag"]) {
  clusterConfig["imageTag"] = config.imageTag;
}
if (!clusterConfig["clusterDiscoveryNamespace"]) {
  clusterConfig["clusterDiscoveryNamespace"] =
    `${config.environmentName}.crackosaurus.local`;
}

// Create the main stack
new CrackosaurusStack(
  app,
  `Crackosaurus-${config.environmentName}`,
  {
    env: { account, region },
    description: `Crackosaurus password cracking platform - ${config.environmentName} environment`,
    ...config,
    serverConfig,
    clusterConfig,
  }
);

app.synth();
