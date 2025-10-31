# IAM Role Support for Crackosaurus

## Overview

This deployment uses **IAM roles** throughout the infrastructure instead of long-lived access keys. This is a security best practice recommended by AWS.

## Why IAM Roles?

### ✅ Benefits of IAM Roles:
- **No credential management**: No access keys to rotate or store
- **Automatic credential rotation**: Temporary credentials expire automatically
- **Principle of least privilege**: Grant only the permissions needed
- **Audit trail**: CloudTrail logs all role assumptions
- **Reduced attack surface**: No credentials to leak or steal

### ❌ Problems with Access Keys:
- Must be stored somewhere (often insecurely)
- Need manual rotation every 90 days
- Can be accidentally committed to git
- Single point of failure if compromised
- Difficult to audit who used them

## IAM Roles in This Stack

### 1. EC2 Instance Role (`EC2InstanceRole`)

**Purpose**: Allows EC2 instances to interact with AWS services without storing credentials on the instance.

**Permissions**:
- `AmazonEC2ContainerServiceforEC2Role`: Register with ECS cluster, pull from ECR, write to CloudWatch
- `AmazonSSMManagedInstanceCore`: Enable AWS Systems Manager Session Manager (secure shell access without SSH keys)

**Usage**: Automatically attached to all EC2 instances in the Auto Scaling Group.

```typescript
const ec2InstanceRole = new iam.Role(this, "EC2InstanceRole", {
  assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
  managedPolicies: [
    iam.ManagedPolicy.fromAwsManagedPolicyName(
      "service-role/AmazonEC2ContainerServiceforEC2Role"
    ),
    iam.ManagedPolicy.fromAwsManagedPolicyName(
      "AmazonSSMManagedInstanceCore"
    ),
  ],
});
```

### 2. ECS Task Execution Role (`TaskExecutionRole`)

**Purpose**: Allows ECS to pull container images and write logs on behalf of your tasks.

**Permissions**:
- `AmazonECSTaskExecutionRolePolicy`: Pull images from ECR, write logs to CloudWatch
- Read access to database credentials in AWS Secrets Manager

**Usage**: Used by ECS service when starting containers.

```typescript
const taskExecutionRole = new iam.Role(this, "TaskExecutionRole", {
  assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
  managedPolicies: [
    iam.ManagedPolicy.fromAwsManagedPolicyName(
      "service-role/AmazonECSTaskExecutionRolePolicy"
    ),
  ],
});
dbSecret.grantRead(taskExecutionRole);
```

### 3. ECS Task Role (`TaskRole`)

**Purpose**: Allows your application containers to access AWS services (S3, etc).

**Permissions**:
- Create and manage S3 buckets with pattern `crackosaurus-*`
- Upload/download/delete objects in those buckets
- Configure bucket settings (CORS, versioning, public access block)

**Usage**: Your application code uses this role to access S3 automatically (no credentials needed in code).

```typescript
const taskRole = new iam.Role(this, "TaskRole", {
  assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
});

taskRole.addToPolicy(
  new iam.PolicyStatement({
    effect: iam.Effect.ALLOW,
    actions: [
      "s3:CreateBucket",
      "s3:ListBucket",
      "s3:GetBucketLocation",
      "s3:PutBucketPublicAccessBlock",
      "s3:PutBucketCORS",
      "s3:PutBucketVersioning",
    ],
    resources: ["arn:aws:s3:::crackosaurus-*"],
  })
);
```

## Developer Access: Using IAM Roles Instead of Access Keys

### Option 1: AWS SSO (Recommended for Organizations)

If your organization uses AWS SSO (IAM Identity Center):

```powershell
# Configure SSO
aws configure sso

# Follow the prompts:
# - SSO start URL: https://your-org.awsapps.com/start
# - SSO Region: ca-central-1
# - Account: Select your work account
# - Role: Select your role (e.g., AdministratorAccess, PowerUserAccess)

# Use the profile
aws sts get-caller-identity --profile my-work-profile

# Set as default
$env:AWS_PROFILE = "my-work-profile"
```

### Option 2: Assume a Role from Another Account

If you have access in one account and need to deploy to another:

```powershell
# Add to ~/.aws/config
[profile work-deployment]
role_arn = arn:aws:iam::WORK_ACCOUNT_ID:role/DeploymentRole
source_profile = personal
region = ca-central-1

# Use the role
aws sts get-caller-identity --profile work-deployment

# Deploy with the role
$env:AWS_PROFILE = "work-deployment"
.\cdk-helper.ps1 -Action deploy
```

### Option 3: EC2 Instance Role for Deployments

Run deployments from an EC2 instance with an appropriate IAM role:

```powershell
# SSH into EC2 instance (or use Session Manager)
ssh ec2-user@instance-ip

# No credentials needed - uses instance role
aws sts get-caller-identity
# Returns the instance role identity

# Install Node.js and deploy
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install -y nodejs git
git clone https://github.com/your-org/crackosaurus.git
cd crackosaurus/apps/cdk
npm install
npx cdk deploy
```

## Accessing EC2 Instances Securely (SSM Session Manager)

With the `AmazonSSMManagedInstanceCore` policy, you can access EC2 instances without SSH keys:

```powershell
# Install Session Manager plugin
# Download from: https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html

# List instances
aws ec2 describe-instances --region ca-central-1 `
  --filters "Name=tag:Name,Values=*Crackosaurus*" `
  --query "Reservations[].Instances[].[InstanceId,State.Name,Tags[?Key=='Name'].Value|[0]]" `
  --output table

# Start a session (no SSH keys needed!)
aws ssm start-session --target i-1234567890abcdef0 --region ca-central-1

# Execute commands
aws ssm send-command `
  --instance-ids "i-1234567890abcdef0" `
  --document-name "AWS-RunShellScript" `
  --parameters 'commands=["docker ps"]' `
  --region ca-central-1
```

## Accessing ECS Tasks Securely (ECS Exec)

You can also access running ECS containers without SSH:

```powershell
# Enable ECS Exec (already enabled in the CDK stack)
# Task definition includes: enableExecuteCommand: true

# List tasks
aws ecs list-tasks --cluster crackosaurus-dev --region ca-central-1

# Execute commands in a container
aws ecs execute-command `
  --cluster crackosaurus-dev `
  --task arn:aws:ecs:ca-central-1:123456789012:task/abc123 `
  --container server `
  --interactive `
  --command "/bin/bash" `
  --region ca-central-1
```

## Best Practices

### ✅ DO:
- Use IAM roles for all AWS service access
- Use SSO for developer access when available
- Enable MFA on IAM users (if you must use them)
- Use temporary credentials with STS AssumeRole
- Rotate credentials regularly (if using access keys)
- Use least privilege principle
- Enable CloudTrail for audit logging

### ❌ DON'T:
- Hard-code credentials in application code
- Store credentials in git repositories
- Share credentials between developers
- Use root account credentials
- Create long-lived access keys unnecessarily
- Grant `*:*` permissions

## Migrating from Access Keys to IAM Roles

If you're currently using access keys locally:

### Before (Insecure):
```env
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
AWS_REGION=ca-central-1
```

### After (Secure):
```powershell
# Use SSO or assumed role
$env:AWS_PROFILE = "work-sso"
# No credentials in environment variables!
```

## Troubleshooting

### "Unable to locate credentials"

You need to configure AWS credentials:

```powershell
# Option 1: SSO
aws configure sso

# Option 2: Assume a role
aws sts assume-role `
  --role-arn "arn:aws:iam::123456789012:role/MyRole" `
  --role-session-name "my-session"

# Option 3: Use access keys (temporary)
aws configure
```

### "Access Denied" when deploying

Your IAM user or role needs these permissions:
- `cloudformation:*` - Create and manage stacks
- `iam:*` - Create roles and policies
- `ec2:*` - Create VPC, security groups, instances
- `ecs:*` - Create clusters and services
- `rds:*` - Create databases
- `s3:*` - Create CDK bootstrap bucket
- `ecr:*` - Create repositories

Or use a managed policy:
- `AdministratorAccess` (full access)
- `PowerUserAccess` (almost full, but can't manage IAM)

### "Session Manager plugin not installed"

Download from: https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html

```powershell
# Verify installation
session-manager-plugin --version
```

## Security Recommendations

1. **Use AWS Organizations**: Centrally manage multiple AWS accounts
2. **Enable AWS SSO**: Single sign-on for all developers
3. **Use Service Control Policies (SCPs)**: Enforce security boundaries
4. **Enable GuardDuty**: Threat detection for your AWS accounts
5. **Enable Config**: Track resource configuration changes
6. **Enable Security Hub**: Centralized security findings
7. **Use IAM Access Analyzer**: Find unintended resource access
8. **Enable CloudTrail**: Audit all API calls

## Additional Resources

- [AWS IAM Best Practices](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html)
- [Using IAM Roles](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_use.html)
- [AWS SSO Documentation](https://docs.aws.amazon.com/singlesignon/latest/userguide/what-is.html)
- [Session Manager](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager.html)
- [ECS Exec](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs-exec.html)
