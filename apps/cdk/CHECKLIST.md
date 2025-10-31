# Pre-Deployment Checklist

Complete this checklist before deploying Crackosaurus to AWS.

## ✅ Prerequisites

### AWS Account Setup
- [ ] Active AWS account with admin privileges
- [ ] AWS CLI installed and configured
  ```powershell
  aws --version
  aws sts get-caller-identity
  ```
- [ ] Sufficient service limits:
  - [ ] VPC: At least 1 available
  - [ ] Elastic IPs: At least 1 available (for NAT Gateway)
  - [ ] RDS instances: Check quota for db.t3.micro or db.t3.medium
  - [ ] ECS tasks: Check Fargate task limits

### Local Development Environment
- [ ] Docker Desktop installed and running
  ```powershell
  docker --version
  docker ps
  ```
- [ ] Node.js 18+ installed
  ```powershell
  node --version
  npm --version
  ```
- [ ] Git installed (for cloning repository)

### CDK Bootstrap
- [ ] CDK bootstrapped in target account/region
  ```powershell
  cd apps/cdk
  npx cdk bootstrap aws://ACCOUNT-ID/REGION
  ```
- [ ] CDK bootstrap successful (creates S3 bucket and IAM roles)

## ✅ Configuration

### Environment Variables
- [ ] `CDK_DEFAULT_ACCOUNT` set to AWS account ID
- [ ] `CDK_DEFAULT_REGION` set to target region (e.g., ca-central-1)
- [ ] `ENVIRONMENT` set to "dev" or "prod"

```powershell
$env:CDK_DEFAULT_ACCOUNT = "123456789012"
$env:CDK_DEFAULT_REGION = "ca-central-1"
$env:ENVIRONMENT = "dev"
```

### Optional DNS Configuration
- [ ] Domain name registered (if using custom domain)
- [ ] Route53 hosted zone created
- [ ] ACM certificate issued for domain
- [ ] Certificate validated (DNS or email)
- [ ] Variables set:
  ```powershell
  $env:DOMAIN_NAME = "crackosaurus.example.com"
  $env:HOSTED_ZONE_ID = "Z1234567890ABC"
  $env:CERTIFICATE_ARN = "arn:aws:acm:region:account:certificate/abc-123"
  ```

## ✅ Container Images

### ECR Repositories
- [ ] ECR repository created: `crackosaurus/server`
- [ ] ECR repository created: `crackosaurus/cluster`
  ```powershell
  aws ecr describe-repositories --repository-names crackosaurus/server
  aws ecr describe-repositories --repository-names crackosaurus/cluster
  ```

### Build and Push
- [ ] Local Docker build working
  ```powershell
  docker build -t crackosaurus/server -f apps/server/Dockerfile .
  docker build -t crackosaurus/cluster -f apps/cluster/Dockerfile .
  ```
- [ ] Images tagged for ECR
  ```powershell
  docker tag crackosaurus/server:latest ACCOUNT.dkr.ecr.REGION.amazonaws.com/crackosaurus/server:latest
  docker tag crackosaurus/cluster:latest ACCOUNT.dkr.ecr.REGION.amazonaws.com/crackosaurus/cluster:latest
  ```
- [ ] Images pushed to ECR
  ```powershell
  aws ecr get-login-password --region REGION | docker login --username AWS --password-stdin ACCOUNT.dkr.ecr.REGION.amazonaws.com
  docker push ACCOUNT.dkr.ecr.REGION.amazonaws.com/crackosaurus/server:latest
  docker push ACCOUNT.dkr.ecr.REGION.amazonaws.com/crackosaurus/cluster:latest
  ```
- [ ] Images verified in ECR console

**Or use the helper script:**
```powershell
.\apps\cdk\setup-ecr.ps1 -Region ca-central-1
```

## ✅ CDK Validation

### Syntax Check
- [ ] CDK synth runs without errors
  ```powershell
  cd apps/cdk
  npx cdk synth
  ```
- [ ] No TypeScript compilation errors
- [ ] CloudFormation template generated successfully

### Diff Preview
- [ ] Reviewed changes with `cdk diff`
  ```powershell
  npx cdk diff
  ```
- [ ] Understand resource additions (VPC, RDS, ECS, ALB, etc.)
- [ ] No unexpected resource deletions

### Cost Estimation
- [ ] Reviewed estimated costs for environment:
  - Dev: ~$100/month
  - Prod: ~$350+/month
- [ ] Budget alerts configured (optional but recommended)
- [ ] Understand ongoing costs (data transfer, storage)

## ✅ Deployment Preparation

### Documentation Review
- [ ] Read [DEPLOYMENT.md](DEPLOYMENT.md) completely
- [ ] Understand architecture diagram
- [ ] Know how to access CloudWatch Logs
- [ ] Familiar with troubleshooting steps

### Backup and Rollback Plan
- [ ] Previous working version tagged (if updating)
- [ ] Know how to roll back (`cdk destroy`, redeploy old version)
- [ ] Understand RDS snapshot policy

### Security Review
- [ ] No secrets in code or environment variables (except CDK context)
- [ ] IAM roles follow least-privilege principle
- [ ] Security groups properly configured
- [ ] Database in isolated subnets

## ✅ Deployment Execution

### Deploy Command
- [ ] Ready to deploy with:
  ```powershell
  npx cdk deploy
  # or
  .\cdk-helper.ps1 -Action deploy -Environment dev
  ```
- [ ] Monitored deployment progress in CloudFormation console
- [ ] All resources created successfully (green checkmarks)
- [ ] Deployment completed without errors

### CloudFormation Outputs
- [ ] Load Balancer DNS recorded
- [ ] Database endpoint noted
- [ ] Cluster name saved
- [ ] All outputs reviewed

## ✅ Post-Deployment

### Health Checks
- [ ] ALB health checks passing
  ```powershell
  curl http://LOAD-BALANCER-DNS/ping
  ```
- [ ] ECS tasks running (server and cluster)
  ```powershell
  aws ecs list-tasks --cluster crackosaurus-dev
  ```
- [ ] No errors in CloudWatch Logs
  ```powershell
  aws logs tail /aws/ecs/server --follow
  ```

### Database Setup
- [ ] Database migration completed
  ```powershell
  # Via ECS execute-command
  aws ecs execute-command --cluster crackosaurus-dev --task TASK-ARN --container server --interactive --command "npm run db:migrate"
  ```
- [ ] Database schema verified
- [ ] Test data inserted (optional)

### S3 Bucket Creation
- [ ] Server logs show bucket creation
  ```
  [S3] Bucket crackosaurus-XXXXXXXX created successfully
  ```
- [ ] Bucket exists in S3 console
- [ ] Bucket has correct permissions (public read disabled)

### Application Testing
- [ ] Application accessible via load balancer URL
- [ ] Login page loads
- [ ] Can create user account
- [ ] Can upload wordlist (tests S3)
- [ ] Can create attack job
- [ ] Cluster service responds

### Monitoring Setup
- [ ] CloudWatch dashboard created (optional)
- [ ] Alarms configured for critical metrics:
  - [ ] ECS service health
  - [ ] RDS CPU/storage
  - [ ] ALB target health
  - [ ] 5xx error rate
- [ ] Log insights queries saved (optional)

## ✅ Documentation and Handoff

### Internal Documentation
- [ ] Deployment notes recorded
- [ ] Access credentials documented (AWS Secrets Manager ARNs)
- [ ] Runbook created for common operations
- [ ] Troubleshooting guide shared with team

### Access Control
- [ ] IAM users/roles configured for team access
- [ ] AWS console access granted to operators
- [ ] CloudWatch Logs access granted to developers
- [ ] RDS access restricted to authorized users only

### Cost Tracking
- [ ] Cost allocation tags applied
- [ ] Billing alerts configured
- [ ] Cost explorer reviewed weekly

## ✅ Production-Specific (if deploying to prod)

### High Availability
- [ ] Multi-AZ deployment confirmed
- [ ] Auto-scaling configured (2-10 tasks)
- [ ] RDS backup retention set to 7 days
- [ ] Deletion protection enabled on RDS

### Security Hardening
- [ ] HTTPS configured with ACM certificate
- [ ] Security group rules reviewed and minimized
- [ ] IAM roles audited
- [ ] VPC Flow Logs enabled (optional)
- [ ] AWS WAF configured (optional)

### Disaster Recovery
- [ ] RDS automated backups verified
- [ ] Manual RDS snapshot taken
- [ ] ECS task definitions exported
- [ ] CloudFormation template backed up
- [ ] Recovery procedure documented and tested

### Compliance
- [ ] Security audit completed
- [ ] Compliance requirements met (GDPR, HIPAA, etc.)
- [ ] Logging sufficient for audit trails
- [ ] Data retention policies configured

## ✅ Cleanup Instructions (for testing)

If this is a test deployment, clean up with:

```powershell
# Destroy CDK stack
.\apps\cdk\cdk-helper.ps1 -Action destroy -Environment dev

# Delete ECR images
aws ecr batch-delete-image --repository-name crackosaurus/server --image-ids imageTag=latest
aws ecr batch-delete-image --repository-name crackosaurus/cluster --image-ids imageTag=latest

# Delete ECR repositories
aws ecr delete-repository --repository-name crackosaurus/server --force
aws ecr delete-repository --repository-name crackosaurus/cluster --force

# Delete S3 buckets (created by application)
aws s3 rb s3://crackosaurus-XXXXXXXX --force

# Verify all resources deleted
aws cloudformation describe-stacks --stack-name Crackosaurus-dev
```

---

## 🚀 Ready to Deploy?

Once all items are checked:

```powershell
cd apps/cdk
.\cdk-helper.ps1 -Action deploy -Environment dev
```

Monitor progress and refer to [DEPLOYMENT.md](DEPLOYMENT.md) for troubleshooting.

**Good luck! 🦖**
