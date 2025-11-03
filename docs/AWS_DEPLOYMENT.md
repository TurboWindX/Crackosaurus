# AWS Deployment Guide

This guide covers deploying Crackosaurus to AWS with real S3 storage.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         AWS Cloud                            │
│                                                              │
│  ┌────────────────┐         ┌─────────────────┐            │
│  │   RDS/Aurora   │◄────────┤  ECS/EC2        │            │
│  │   PostgreSQL   │         │  - Server       │            │
│  └────────────────┘         │  - Cluster      │            │
│                             │  - Instance     │            │
│                             └────────┬────────┘            │
│                                      │                      │
│                                      ▼                      │
│                             ┌─────────────────┐            │
│                             │   S3 Buckets    │            │
│                             │  - Wordlists    │            │
│                             │  - Instances    │            │
│                             └─────────────────┘            │
└─────────────────────────────────────────────────────────────┘
```

## Prerequisites

1. AWS Account with appropriate permissions
2. AWS CLI configured locally
3. Docker for building images
4. (Optional) CDK for infrastructure deployment

## 1. S3 Bucket Setup

### Create S3 Buckets

```bash
# Wordlists bucket
aws s3 mb s3://crackosaurus-wordlists --region ca-central-1

# Instance data bucket
aws s3 mb s3://crackosaurus-instances --region ca-central-1
```

### Configure Bucket Policies (Optional)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowServerAccess",
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::ACCOUNT_ID:role/CrackosaurusServerRole"
      },
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::crackosaurus-wordlists",
        "arn:aws:s3:::crackosaurus-wordlists/*"
      ]
    }
  ]
}
```

## 2. IAM Role Setup

### Create IAM Role for Server

The server needs an IAM role with S3 permissions. This role will be assumed by the EC2 instances or ECS tasks.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::crackosaurus-wordlists",
        "arn:aws:s3:::crackosaurus-wordlists/*",
        "arn:aws:s3:::crackosaurus-instances",
        "arn:aws:s3:::crackosaurus-instances/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:*:*:*"
    }
  ]
}
```

### Create IAM Role (AWS CLI)

```bash
# Create trust policy for EC2/ECS
cat > trust-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": [
          "ec2.amazonaws.com",
          "ecs-tasks.amazonaws.com"
        ]
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

# Create role
aws iam create-role \
  --role-name CrackosaurusServerRole \
  --assume-role-policy-document file://trust-policy.json

# Attach policy
aws iam put-role-policy \
  --role-name CrackosaurusServerRole \
  --policy-name CrackosaurusS3Access \
  --policy-document file://iam-policy.json

# Create instance profile (for EC2)
aws iam create-instance-profile \
  --instance-profile-name CrackosaurusServerProfile

aws iam add-role-to-instance-profile \
  --instance-profile-name CrackosaurusServerProfile \
  --role-name CrackosaurusServerRole
```

## 3. RDS Database Setup

### Create PostgreSQL Database

```bash
aws rds create-db-instance \
  --db-instance-identifier crackosaurus-db \
  --db-instance-class db.t3.micro \
  --engine postgres \
  --engine-version 16.0 \
  --master-username postgres \
  --master-user-password YOUR_SECURE_PASSWORD \
  --allocated-storage 20 \
  --vpc-security-group-ids sg-XXXXXXXXX \
  --db-subnet-group-name your-subnet-group \
  --publicly-accessible false
```

## 4. Environment Variables for Production

Set these environment variables for your production deployment:

### Server Container

```bash
NODE_ENV=production
DATABASE_PROVIDER=postgresql
DATABASE_PATH=postgresql://postgres:password@your-rds-endpoint:5432/crackosaurus?schema=public
BACKEND_SECRET=YOUR_SECURE_32_CHAR_SECRET
AWS_REGION=ca-central-1
S3_BUCKET_ARN=arn:aws:s3:::crackosaurus-wordlists
S3_ROLE_ARN=arn:aws:iam::ACCOUNT_ID:role/CrackosaurusServerRole

# Note: AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are NOT needed
# The IAM role provides credentials automatically via instance metadata
```

### Cluster Container

```bash
NODE_ENV=production
CLUSTER_TYPE=external
CLUSTER_INSTANCE_ROOT=/data/instances
CLUSTER_WORDLIST_ROOT=/data/wordlists
```

## 5. ECS Deployment (Recommended)

### Build and Push Docker Images

```bash
# Login to ECR
aws ecr get-login-password --region ca-central-1 | \
  docker login --username AWS --password-stdin ACCOUNT_ID.dkr.ecr.ca-central-1.amazonaws.com

# Create ECR repositories
aws ecr create-repository --repository-name crackosaurus/server
aws ecr create-repository --repository-name crackosaurus/cluster
aws ecr create-repository --repository-name crackosaurus/instance

# Build and push images
docker compose build
docker tag crackosaurus-server:latest ACCOUNT_ID.dkr.ecr.ca-central-1.amazonaws.com/crackosaurus/server:latest
docker push ACCOUNT_ID.dkr.ecr.ca-central-1.amazonaws.com/crackosaurus/server:latest

# Repeat for other services
```

### ECS Task Definition

```json
{
  "family": "crackosaurus-server",
  "taskRoleArn": "arn:aws:iam::ACCOUNT_ID:role/CrackosaurusServerRole",
  "executionRoleArn": "arn:aws:iam::ACCOUNT_ID:role/ecsTaskExecutionRole",
  "networkMode": "awsvpc",
  "containerDefinitions": [
    {
      "name": "server",
      "image": "ACCOUNT_ID.dkr.ecr.ca-central-1.amazonaws.com/crackosaurus/server:latest",
      "portMappings": [
        {
          "containerPort": 8080,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "NODE_ENV",
          "value": "production"
        },
        {
          "name": "DATABASE_PROVIDER",
          "value": "postgresql"
        },
        {
          "name": "S3_BUCKET_ARN",
          "value": "arn:aws:s3:::crackosaurus-wordlists"
        },
        {
          "name": "AWS_REGION",
          "value": "ca-central-1"
        }
      ],
      "secrets": [
        {
          "name": "DATABASE_PATH",
          "valueFrom": "arn:aws:secretsmanager:ca-central-1:ACCOUNT_ID:secret:crackosaurus/db-connection"
        },
        {
          "name": "BACKEND_SECRET",
          "valueFrom": "arn:aws:secretsmanager:ca-central-1:ACCOUNT_ID:secret:crackosaurus/backend-secret"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/crackosaurus",
          "awslogs-region": "ca-central-1",
          "awslogs-stream-prefix": "server"
        }
      }
    }
  ],
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024"
}
```

## 6. EC2 Deployment (Alternative)

### Launch EC2 Instance

```bash
aws ec2 run-instances \
  --image-id ami-XXXXXXXXX \
  --instance-type t3.medium \
  --iam-instance-profile Name=CrackosaurusServerProfile \
  --security-group-ids sg-XXXXXXXXX \
  --subnet-id subnet-XXXXXXXXX \
  --user-data file://user-data.sh \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=Crackosaurus-Server}]'
```

### User Data Script (user-data.sh)

```bash
#!/bin/bash
yum update -y
yum install -y docker
systemctl start docker
systemctl enable docker

# Pull and run containers
docker pull ACCOUNT_ID.dkr.ecr.ca-central-1.amazonaws.com/crackosaurus/server:latest

docker run -d \
  --name server \
  -p 8080:8080 \
  -e NODE_ENV=production \
  -e DATABASE_PROVIDER=postgresql \
  -e DATABASE_PATH=$DATABASE_PATH \
  -e AWS_REGION=ca-central-1 \
  -e S3_BUCKET_ARN=arn:aws:s3:::crackosaurus-wordlists \
  ACCOUNT_ID.dkr.ecr.ca-central-1.amazonaws.com/crackosaurus/server:latest
```

## 7. Using CDK (Automated Deployment)

The repository includes AWS CDK infrastructure code in `apps/cdk/`.

```bash
cd apps/cdk

# Install dependencies
npm install

# Configure your AWS credentials
export AWS_PROFILE=your-profile
export AWS_REGION=ca-central-1

# Bootstrap CDK (first time only)
cdk bootstrap

# Deploy all stacks
cdk deploy --all

# Or deploy specific stacks
cdk deploy CrackosaurusStorageStack  # S3 buckets
cdk deploy CrackosaurusDatabaseStack # RDS
cdk deploy CrackosaurusServerStack   # ECS/Fargate
```

## 8. Verification

### Test S3 Access

```bash
# From within your container or EC2 instance
aws s3 ls s3://crackosaurus-wordlists/

# Upload a test file
echo "test" > test.txt
aws s3 cp test.txt s3://crackosaurus-wordlists/test.txt

# Verify
aws s3 ls s3://crackosaurus-wordlists/test.txt
```

### Test Application

```bash
# Health check
curl http://your-alb-or-instance-url:8080/health

# Upload a wordlist via the web interface
# The presigned URLs should now point to real S3 (s3.amazonaws.com)
```

## 9. Monitoring

### CloudWatch Logs

All container logs are sent to CloudWatch Logs:

- Log Group: `/ecs/crackosaurus` or `/ec2/crackosaurus`
- Streams: One per container/task

### CloudWatch Metrics

Monitor:

- S3 bucket metrics (requests, bytes)
- RDS metrics (connections, CPU, memory)
- ECS/EC2 metrics (CPU, memory, network)

## 10. Cost Optimization

- Use S3 lifecycle policies to move old wordlists to Glacier
- Use Aurora Serverless v2 for variable database load
- Use Fargate Spot for non-critical workloads
- Enable S3 Intelligent-Tiering for automatic cost optimization

## 11. Security Best Practices

1. **Never commit credentials** - Use IAM roles and Secrets Manager
2. **Enable S3 encryption** - Server-side encryption (SSE-S3 or SSE-KMS)
3. **Use VPC endpoints** - For S3 and other AWS services
4. **Enable CloudTrail** - Audit all API calls
5. **Use Security Groups** - Restrict access to only necessary ports
6. **Enable RDS encryption** - Encrypt database at rest
7. **Use HTTPS** - Terminate TLS at ALB

## Troubleshooting

### "Access Denied" errors

1. Verify IAM role is attached to instance/task
2. Check IAM policy includes required S3 actions
3. Verify S3 bucket ARN in environment variables is correct

### Presigned URLs fail

1. Ensure `NODE_ENV=production` is set
2. Verify no `AWS_ENDPOINT_URL` is set in production
3. Check bucket region matches `AWS_REGION`

### Database connection issues

1. Verify security group allows inbound from application
2. Check RDS is in same VPC or VPC peering is configured
3. Verify DATABASE_PATH connection string is correct
