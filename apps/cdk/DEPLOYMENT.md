# Crackosaurus AWS Deployment Guide

This guide walks you through deploying Crackosaurus to AWS using CDK.

## Prerequisites

1. **AWS Account**: Active AWS account with appropriate permissions
2. **AWS CLI**: Installed and configured
   ```powershell
   # Option 1: Use AWS SSO (Recommended)
   aws configure sso
   
   # Option 2: Use IAM role (if deploying from EC2)
   # No configuration needed - uses instance role
   
   # Option 3: Use access keys (less secure)
   aws configure
   ```
   📖 **See [IAM-ROLES.md](./IAM-ROLES.md) for detailed guidance on using IAM roles instead of access keys**

3. **Docker**: Running locally for building container images
4. **Node.js**: v18+ installed
5. **CDK Bootstrap**: Run once per account/region
   ```powershell
   cd apps/cdk
   npx cdk bootstrap aws://ACCOUNT-ID/REGION
   ```

## Architecture Overview

The CDK deployment creates:

- **VPC**: Multi-AZ with public, private, and isolated subnets
- **RDS PostgreSQL 16**: Database with automated backups and secrets management
- **ECS on EC2**: Reliable container platform using t3.small instances
  - Server service (port 8080) with auto-scaling in production
  - Cluster service (port 13337) with service discovery
- **Application Load Balancer**: HTTP/HTTPS traffic distribution with health checks
- **IAM Roles**: 🔐 **No access keys needed!**
  - EC2 Instance Role: ECS cluster registration, ECR access, CloudWatch logs
  - Task Execution Role: Pull images, read secrets
  - Task Role: S3 bucket creation and object management
- **CloudWatch Logs**: Centralized logging with 7-day retention
- **Service Discovery**: Internal DNS for service-to-service communication
- **SSM Session Manager**: Secure EC2 access without SSH keys

📖 **Read [IAM-ROLES.md](./IAM-ROLES.md) to understand the security architecture**

## Step-by-Step Deployment

### 1. Build and Push Container Images

First, create ECR repositories:

```powershell
aws ecr create-repository --repository-name crackosaurus/server --region YOUR_REGION
aws ecr create-repository --repository-name crackosaurus/cluster --region YOUR_REGION
```

Build and push images:

```powershell
# Get ECR login
$ACCOUNT_ID = aws sts get-caller-identity --query Account --output text
$REGION = "ca-central-1"  # Change to your region
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com"

# Build and push server
docker build -t crackosaurus/server -f apps/server/Dockerfile .
docker tag crackosaurus/server:latest "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/crackosaurus/server:latest"
docker push "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/crackosaurus/server:latest"

# Build and push cluster
docker build -t crackosaurus/cluster -f apps/cluster/Dockerfile .
docker tag crackosaurus/cluster:latest "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/crackosaurus/cluster:latest"
docker push "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/crackosaurus/cluster:latest"
```

### 2. Configure Environment

Set environment variables for your deployment:

```powershell
$env:CDK_DEFAULT_ACCOUNT = "YOUR_AWS_ACCOUNT_ID"
$env:CDK_DEFAULT_REGION = "ca-central-1"  # Or your preferred region
$env:ENVIRONMENT = "dev"  # or "prod"
```

Optional DNS configuration:

```powershell
$env:DOMAIN_NAME = "crackosaurus.example.com"
$env:HOSTED_ZONE_ID = "Z1234567890ABC"
$env:CERTIFICATE_ARN = "arn:aws:acm:region:account:certificate/abc-123"
```

### 3. Review CloudFormation Template

Preview what will be created:

```powershell
cd apps/cdk
npx cdk synth
```

This generates the CloudFormation template without deploying.

### 4. Deploy to AWS

Deploy the stack:

```powershell
npx cdk deploy --require-approval never
```

Or with confirmation prompts:

```powershell
npx cdk deploy
```

The deployment takes 10-15 minutes and creates:
- VPC and networking (~5 min)
- RDS database (~8 min)
- ECS services and ALB (~3 min)

### 5. Post-Deployment Setup

After deployment completes, you'll see outputs like:

```
Crackosaurus-dev.LoadBalancerDNS = crackosaurus-alb-123456.ca-central-1.elb.amazonaws.com
Crackosaurus-dev.DatabaseEndpoint = crackosaurus-db.abc123.ca-central-1.rds.amazonaws.com
Crackosaurus-dev.ClusterName = crackosaurus-dev
```

#### Run Database Migrations

Connect to the server container and run migrations:

```powershell
# Get cluster name from outputs
$CLUSTER_NAME = "crackosaurus-dev"

# List running tasks
aws ecs list-tasks --cluster $CLUSTER_NAME --service-name ServerService --region $REGION

# Get task ARN (replace TASK_ID)
$TASK_ARN = "arn:aws:ecs:region:account:task/cluster/TASK_ID"

# Execute migration
aws ecs execute-command `
  --cluster $CLUSTER_NAME `
  --task $TASK_ARN `
  --container server `
  --interactive `
  --command "npm run db:migrate"
```

Or use SSM Session Manager to connect to the ECS task.

### 6. Access the Application

Open the load balancer DNS in your browser:

```
http://crackosaurus-alb-123456.ca-central-1.elb.amazonaws.com
```

Or your custom domain if configured.

## Environment Configurations

### Development Environment

```powershell
$env:ENVIRONMENT = "dev"
npx cdk deploy
```

- **RDS**: db.t3.micro, 20GB storage, 1-day backups
- **ECS**: 1 server task, 1 cluster task
- **Deletion**: No protection, destroy on stack delete

### Production Environment

```powershell
$env:ENVIRONMENT = "prod"
npx cdk deploy
```

- **RDS**: db.t3.medium, 100GB storage, 7-day backups, deletion protection
- **ECS**: 2-10 server tasks (auto-scaling), 1 cluster task
- **Deletion**: Snapshot on delete, protected resources

## Configuration Options

### Via Environment Variables

```powershell
$env:CDK_DEFAULT_ACCOUNT = "123456789012"
$env:CDK_DEFAULT_REGION = "ca-central-1"
$env:ENVIRONMENT = "prod"
$env:DOMAIN_NAME = "crackosaurus.example.com"
$env:HOSTED_ZONE_ID = "Z1234567890ABC"
$env:CERTIFICATE_ARN = "arn:aws:acm:..."
```

### Via CDK Context

```powershell
npx cdk deploy `
  -c environment=prod `
  -c domainName=crackosaurus.example.com `
  -c hostedZoneId=Z1234567890ABC `
  -c certificateArn=arn:aws:acm:...
```

## S3 Bucket Creation

The application automatically creates S3 buckets with the pattern `crackosaurus-{random}`:

- **IAM Permissions**: Task role has `s3:CreateBucket` on `arn:aws:s3:::crackosaurus-*`
- **Auto-Creation**: Server creates bucket on first startup
- **Naming**: 8-character random hex suffix (e.g., `crackosaurus-2e174017`)

No manual S3 configuration required!

## Monitoring and Logs

### CloudWatch Logs

View logs for each service:

```powershell
# Server logs
aws logs tail /aws/ecs/server --follow

# Cluster logs
aws logs tail /aws/ecs/cluster --follow
```

### Health Checks

The ALB performs health checks on `/ping`:

- **Interval**: 30 seconds
- **Timeout**: 5 seconds
- **Healthy threshold**: 2 consecutive successes
- **Unhealthy threshold**: 3 consecutive failures

### Service Scaling (Production Only)

Auto-scaling triggers:

- **Scale Out**: CPU > 70% for 60 seconds
- **Scale In**: CPU < 70% for 60 seconds
- **Min Tasks**: 2
- **Max Tasks**: 10

## Updating the Application

### Deploy New Code

1. Build and push new container images (see Step 1)
2. Force ECS to pull new images:

```powershell
aws ecs update-service --cluster $CLUSTER_NAME --service ServerService --force-new-deployment
aws ecs update-service --cluster $CLUSTER_NAME --service ClusterService --force-new-deployment
```

### Update Infrastructure

Modify CDK code and redeploy:

```powershell
npx cdk diff  # Preview changes
npx cdk deploy  # Apply changes
```

## Troubleshooting

### Container Fails to Start

Check ECS task logs:

```powershell
aws ecs describe-tasks --cluster $CLUSTER_NAME --tasks $TASK_ARN
```

Common issues:
- Database connection failures (check security groups)
- Missing secrets (verify Secrets Manager permissions)
- Image pull failures (check ECR permissions)

### Database Connection Issues

Verify security groups allow traffic:

```powershell
aws ec2 describe-security-groups --filters Name=group-name,Values=*DBSecurityGroup*
```

Ensure server/cluster security groups can access RDS on port 5432.

### ALB Health Checks Failing

Check target group health:

```powershell
aws elbv2 describe-target-health --target-group-arn $TARGET_GROUP_ARN
```

Verify:
- Server is listening on port 8080
- `/ping` endpoint returns 200 OK
- Security group allows ALB → Server traffic

### S3 Bucket Creation Failures

Check IAM task role permissions:

```powershell
aws iam get-role-policy --role-name $TASK_ROLE_NAME --policy-name S3BucketCreationPolicy
```

Verify the role has:
- `s3:CreateBucket` on `arn:aws:s3:::crackosaurus-*`
- `s3:PutObject`, `s3:GetObject` on `arn:aws:s3:::crackosaurus-*/*`

## Cost Estimation

### Development Environment (Monthly)

- **RDS db.t3.micro**: ~$15
- **NAT Gateway**: ~$32
- **ECS Fargate**: ~$30 (2 tasks, 1GB each)
- **ALB**: ~$16
- **Data Transfer**: Variable
- **Total**: ~$100/month

### Production Environment (Monthly)

- **RDS db.t3.medium**: ~$60
- **NAT Gateway**: ~$32
- **ECS Fargate**: ~$200 (avg 4 tasks, 2GB each)
- **ALB**: ~$16
- **S3 Storage**: ~$0.023/GB
- **Data Transfer**: Variable
- **Total**: ~$350+/month

## Cleanup

To delete the entire stack:

```powershell
npx cdk destroy
```

**Warning**: In production mode, RDS will create a final snapshot before deletion (deletion protection enabled).

Manual cleanup required:
- ECR repositories (contain images)
- CloudWatch log groups (if retention expired)
- S3 buckets (created by application, not managed by CDK)

### Clean Up S3 Buckets

```powershell
# List Crackosaurus buckets
aws s3 ls | Select-String "crackosaurus-"

# Delete each bucket
aws s3 rb s3://crackosaurus-XXXXXXXX --force
```

## Security Best Practices

1. **Secrets Management**: Never commit database passwords. Use AWS Secrets Manager (auto-configured).
2. **IAM Roles**: Tasks use instance profiles, no hardcoded credentials.
3. **Network Isolation**: Database in isolated subnets with restricted security groups.
4. **HTTPS**: Configure ACM certificate for production domains.
5. **Backups**: 7-day automated backups in production.
6. **Deletion Protection**: Enabled for production RDS instances.

## Next Steps

- [ ] Configure custom domain with Route53 and ACM certificate
- [ ] Set up CloudWatch alarms for critical metrics
- [ ] Implement CI/CD pipeline for automated deployments
- [ ] Enable VPC Flow Logs for network monitoring
- [ ] Configure AWS WAF for ALB protection
- [ ] Set up cross-region replication for disaster recovery

## Support

For issues or questions:
- Check CloudWatch Logs for application errors
- Review CDK synth output for infrastructure changes
- Verify security group rules and IAM permissions
- Consult AWS ECS/RDS documentation for service-specific issues
