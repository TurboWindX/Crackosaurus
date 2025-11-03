# 🦖 Crackosaurus

Crackosaurus is the world's first open source password recovery platform. Powered by [hashcat](https://hashcat.net/hashcat/), Crackosaurus can recover almost any type of password hash with great speed and ease. Crackosaurus is a must have tool for any security team!

![Preview](.github/images/preview.png)

## 📦 Deployment

Crackosaurus is designed to be deployable anywhere. Find your favorite infrastructure below. If it's not there, PRs are open!

### ☁️ AWS CDK

AWS CDK deployment provides a complete, production-ready infrastructure with:

- **VPC** with multi-AZ high availability
- **RDS PostgreSQL 16** with automated backups and secrets management
- **ECS Fargate** for serverless container deployment
- **Application Load Balancer** with health checks
- **Auto-scaling** in production (2-10 tasks based on CPU)
- **S3 auto-creation** with dynamic bucket naming (`crackosaurus-*`)
- **IAM roles** with least-privilege permissions
- **CloudWatch Logs** for monitoring
- **Service Discovery** for inter-service communication

#### Quick Start

See [apps/cdk/DEPLOYMENT.md](apps/cdk/DEPLOYMENT.md) for comprehensive instructions.

**Prerequisites:**

- AWS CLI configured with credentials
- Docker running locally
- Node.js 18+

**Deploy in 3 steps:**

```powershell
# 1. Setup ECR and build images
.\apps\cdk\setup-ecr.ps1 -Region ca-central-1

# 2. Bootstrap CDK (once per account)
cd apps/cdk
npx cdk bootstrap

# 3. Deploy the stack
.\cdk-helper.ps1 -Action deploy -Environment dev
```

**Environment Options:**

- `dev`: Cost-optimized (db.t3.micro, 1 task) - ~$100/month
- `prod`: Production-ready (db.t3.medium, auto-scaling) - ~$350+/month

**Access your deployment:**
The Application Load Balancer DNS will be in the CloudFormation outputs.

#### Helper Scripts

```powershell
# Deploy to production
.\apps\cdk\cdk-helper.ps1 -Action deploy -Environment prod

# View differences before deploying
.\apps\cdk\cdk-helper.ps1 -Action diff -Environment dev

# Check deployment outputs
.\apps\cdk\cdk-helper.ps1 -Action outputs -Environment dev

# View logs
.\apps\cdk\cdk-helper.ps1 -Action logs -Environment dev

# Destroy stack
.\apps\cdk\cdk-helper.ps1 -Action destroy -Environment dev
```

#### Documentation

- **[DEPLOYMENT.md](apps/cdk/DEPLOYMENT.md)** - Complete deployment guide
- **[README.md](apps/cdk/README.md)** - Quick reference and architecture

#### Key Features

- **No manual S3 setup**: Buckets auto-created with `crackosaurus-{random}` naming
- **Secure by default**: Secrets Manager for passwords, IAM roles for authentication
- **Production-ready**: Auto-scaling, multi-AZ, deletion protection in prod
- **Cost-optimized**: Single NAT Gateway, right-sized instances per environment

### 🐋 Docker

Docker is recommended to deploy locally.

#### Dependencies

- [Docker](https://www.docker.com/)
- [Docker Compose](https://docs.docker.com/compose/)
- [CUDA](https://developer.nvidia.com/cuda-toolkit)

#### Deploy

```
sudo docker-compose build
sudo docker-compose up
```

Setup the platform using:

```
http://localhost:8080/setup
```

Note: if the instance fails, update the `nvidia/cuda` container version in the [instance Containerfile](packages/container/instance/docker/Containerfile) to match the system CUDA version.

## 🔨 Development

### 🔗 PR

Development of the app is done via [feature branches](https://www.atlassian.com/git/tutorials/comparing-workflows/feature-branch-workflow) off the current version branch. Make sure to have this configured before continuing.

### 🧩 Dependencies

Crackosaurus is a full TypeScript Monorepo. The following is required:

- [Node](https://nodejs.org/en)
- [NPM](https://www.npmjs.com/)

The following is only necessary for deployment:

- [Docker](https://www.docker.com/)
- [Docker Compose](https://docs.docker.com/compose/)

### 🔍 Checks

Checks are required before PR. This can easily be done on all the monorepo using:

```
npm install
npm run format
npm run lint
```

### 🖥️ Setup

[Prisma](https://www.prisma.io/) is the ORM used to handle the database. This can be setup and updated using following:

```
npm install
npm run migrate
```

### 👣 Run

The admin account can be setup using:

http://localhost:5174/setup

The microservices can be found at:

- Web: http://localhost:5174/
- Backend: http://localhost:8080/
- Cluster: http://localhost:13337/

#### ⚙️ Debug

This is a dummy cluster that prints API commands.

```
npm run dev
```

## 🐛 Bugs

Following are a list of known bugs with their fixes.

### Server/cluster hangs on requests

This is most likely due to a `.lock` file not being removed. You can manually remove them from the data folder.
