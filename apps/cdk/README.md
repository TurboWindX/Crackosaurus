# CDK Deployment - Quick Reference

## What Was Created

### Infrastructure Stack (`apps/cdk/lib/production-stack.ts`)

Comprehensive AWS deployment including:

- **VPC & Networking**
  - 2 Availability Zones for high availability
  - Public subnets (ALB)
  - Private subnets (ECS tasks)
  - Isolated subnets (RDS)
  - NAT Gateway for outbound traffic
  - Service Discovery namespace (`crackosaurus.local`)

- **Database (RDS PostgreSQL 16)**
  - Auto-generated secrets in AWS Secrets Manager
  - Automated backups (1 day dev, 7 days prod)
  - Deletion protection in production
  - Auto-scaling storage

- **Container Platform (ECS Fargate)**
  - Server service (port 8080)
    - Dev: 1 task
    - Prod: 2-10 tasks with CPU-based auto-scaling
  - Cluster service (port 13337)
    - Service discovery at `cluster.crackosaurus.local`
    - 1 task with 2 vCPU, 4GB RAM

- **Load Balancing (ALB)**
  - HTTP listener on port 80
  - Health checks on `/ping` endpoint
  - Target group for server tasks

- **IAM Roles**
  - Task execution role (pull images, read secrets)
  - Task role with S3 permissions:
    - `s3:CreateBucket` on `arn:aws:s3:::crackosaurus-*`
    - Full object access on `arn:aws:s3:::crackosaurus-*/*`

- **Logging**
  - CloudWatch Logs with 7-day retention
  - Separate log groups for server and cluster

- **Optional DNS**
  - Route53 A record (if domain configured)
  - ACM certificate support

### Configuration Files

- `apps/cdk/bin/cdk.ts` - Entry point with environment detection
- `apps/cdk/DEPLOYMENT.md` - Comprehensive deployment guide

## Environment Variables

### Required
```powershell
$env:CDK_DEFAULT_ACCOUNT = "123456789012"
$env:CDK_DEFAULT_REGION = "ca-central-1"
```

### Optional
```powershell
$env:ENVIRONMENT = "dev"  # or "prod" (default: dev)
$env:DOMAIN_NAME = "crackosaurus.example.com"
$env:HOSTED_ZONE_ID = "Z1234567890ABC"
$env:CERTIFICATE_ARN = "arn:aws:acm:region:account:certificate/abc-123"
```

## Quick Commands

### Validate Configuration
```powershell
cd apps/cdk
npx cdk synth
```

### Deploy
```powershell
npx cdk deploy
```

### Deploy to Production
```powershell
$env:ENVIRONMENT = "prod"
npx cdk deploy
```

### Check Differences
```powershell
npx cdk diff
```

### Destroy Everything
```powershell
npx cdk destroy
```

## Pre-Deployment Checklist

- [ ] AWS CLI configured with credentials
- [ ] CDK bootstrapped in target account/region
- [ ] ECR repositories created:
  - `crackosaurus/server`
  - `crackosaurus/cluster`
- [ ] Container images built and pushed to ECR
- [ ] Environment variables set

## Post-Deployment Tasks

1. **Get Load Balancer URL** from CloudFormation outputs
2. **Run Database Migrations** via ECS execute-command
3. **Verify Health Checks** are passing
4. **Test S3 Bucket Creation** by uploading a wordlist
5. **Configure DNS** (if using custom domain)

## Key Features

### S3 Bucket Auto-Creation
- No manual S3 setup required
- Server creates `crackosaurus-{random}` bucket on startup
- IAM permissions grant bucket creation rights
- Bucket name stored in application state

### Environment Awareness
- **Development**: Cost-optimized, single tasks, minimal storage
- **Production**: High availability, auto-scaling, deletion protection

### Security
- No hardcoded credentials (Secrets Manager)
- IAM roles for task authentication
- Security groups with least-privilege rules
- Database in isolated subnets
- Encrypted secrets

### Monitoring
- CloudWatch Logs for all services
- ALB health checks with automatic recovery
- Container insights enabled
- CPU-based auto-scaling in production

## Cost Optimization

### Development
- `db.t3.micro` instance
- 1 NAT Gateway
- Minimal task count (1 each)
- ~$100/month

### Production
- `db.t3.medium` instance
- 1 NAT Gateway (shared)
- Auto-scaling tasks (2-10)
- 7-day backups
- ~$350+/month

### Cost Reduction Tips
- Use single NAT Gateway (already configured)
- Stop dev environment when not in use
- Monitor CloudWatch costs
- Clean up unused ECR images
- Delete old RDS snapshots

## Troubleshooting Quick Reference

### ECS Task Won't Start
```powershell
aws ecs describe-tasks --cluster crackosaurus-dev --tasks TASK_ARN
```

### Check Container Logs
```powershell
aws logs tail /aws/ecs/server --follow
```

### Database Connection
```powershell
# Get secret value
aws secretsmanager get-secret-value --secret-id crackosaurus/dev/db-password

# Test from ECS task
aws ecs execute-command --cluster crackosaurus-dev --task TASK_ARN --container server --interactive --command "/bin/sh"
```

### ALB Health Check Failures
```powershell
# Check target health
aws elbv2 describe-target-health --target-group-arn TARGET_GROUP_ARN

# Test health endpoint
curl http://ALB_DNS/ping
```

### S3 Permissions Issues
```powershell
# View task role
aws iam get-role --role-name TASK_ROLE_NAME

# Check CloudWatch logs for S3 errors
aws logs tail /aws/ecs/server --follow --filter-pattern "S3"
```

## Architecture Diagram

```
Internet
    │
    ↓
Application Load Balancer (HTTP:80)
    │
    ↓
ECS Fargate (Private Subnets)
    ├── Server Service (port 8080)
    │   └── Auto-scaling: 1-10 tasks
    │
    └── Cluster Service (port 13337)
        └── Service Discovery: cluster.crackosaurus.local
    │
    ↓
RDS PostgreSQL 16 (Isolated Subnet)
    └── Secrets Manager (credentials)
    
IAM Task Role
    └── S3 Permissions (crackosaurus-*)
```

## Next Steps

1. **Read DEPLOYMENT.md** for step-by-step instructions
2. **Build and push container images** to ECR
3. **Run `cdk synth`** to validate configuration
4. **Deploy to development** environment first
5. **Test functionality** end-to-end
6. **Deploy to production** with proper configuration
7. **Set up CI/CD** for automated deployments

## Additional Resources

- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/)
- [ECS Best Practices](https://docs.aws.amazon.com/AmazonECS/latest/bestpracticesguide/)
- [RDS PostgreSQL Guide](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_PostgreSQL.html)
- [Application Load Balancer](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/)
