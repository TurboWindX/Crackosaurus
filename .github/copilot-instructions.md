# Crackosaurus Copilot Instructions

## Project Overview

Crackosaurus is a distributed GPU-accelerated password recovery platform powered by hashcat. It orchestrates password cracking jobs across AWS GPU instances (g3/g4/g5/p3/p4/p5) with EFS-based coordination, tRPC APIs, and a React frontend.

**Key Architecture Concepts:**

- **4 Core Services**: `server` (tRPC API + orchestration), `cluster` (job coordination), `instance` (hashcat runner), `web` (React UI)
- **EFS-Based State**: Jobs and instance metadata are coordinated via shared filesystem at `/crackodata` (not a database queue)
- **Cluster Types**: `aws` (Step Functions + EFS), `external` (EFS-only), `node` (local filesystem), `debug` (stub)
- **Monorepo**: npm workspaces + Turborepo for build orchestration

## Development Workflows

### Local Development

```powershell
npm install                    # Install all workspace dependencies
npm run migrate                # Run Prisma migrations (apps/db)
npm run dev                     # Start all services in watch mode
```

Access locally at:

- Web: `http://localhost:5174/`
- Server: `http://localhost:8080/`
- Cluster: `http://localhost:13337/`
- Setup wizard: `http://localhost:5174/setup`

### Building & Type Checking

```powershell
npm run build                  # Build all workspaces (turbo build)
npm run format                 # Format code (turbo format)
npm run lint                   # Lint with ESLint
npm run -w @repo/server typecheck  # Type check server workspace
```

### Deployment

```powershell
.\scripts\deploy.ps1 dev       # Deploy to AWS with 'dev' environment
.\scripts\deploy.ps1 bleeding  # Deploy to bleeding edge environment
```

The deploy script:

1. Builds Docker images with dynamic tags (`{env}-{timestamp}`)
2. Pushes to ECR (`crackosaurus/server`, `crackosaurus/cluster`, `crackosaurus/prisma`)
3. Deploys CDK stack with image tags

### Database Management

```powershell
npm run migrate                # Run Prisma migrations
npm run -w apps/db generate    # Generate Prisma client
```

**Multi-Provider Schema Pattern**: Prisma schemas are split into `common.prisma` (shared models) and provider-specific files (`postgresql.prisma`, `sqlite.prisma`). The `apps/db` package merges these at build time into `providers/{provider}/schema.prisma`.

## Project-Specific Conventions

### Cluster Coordination via Filesystem

Unlike typical queue-based systems, Crackosaurus uses EFS for job coordination:

- **Job Creation**: Server writes to `/crackodata/instances/{instanceID}/jobs/{jobID}/metadata.json`
- **Instance Polling**: Instance process scans job folders, picks up `PENDING` jobs
- **Lock Files**: `.lock` files prevent concurrent reads/writes (`safeReadFileAsync` in [packages/filesystem/src/cluster.ts](packages/filesystem/src/cluster.ts))
- **Status Updates**: Instance writes `status` field in metadata; cluster polls to aggregate

**Why EFS?** Simple, reliable state sharing across multi-AZ deployments without SQS/RDS bottlenecks.

### Cluster Type Selection

The cluster type determines how jobs are dispatched:

- **`aws`**: Triggers Step Functions to spin up EC2 GPU instances via [apps/cluster/src/aws-cluster.ts](apps/cluster/src/aws-cluster.ts)
- **`external`**: Assumes external instances poll the EFS filesystem ([apps/cluster/src/external.ts](apps/cluster/src/external.ts))
- **`node`**: Local child processes for development ([apps/cluster/src/node.ts](apps/cluster/src/node.ts))

Configure via `CLUSTER_TYPE` env var. See [cluster-factory.ts](apps/cluster/src/cluster-factory.ts) for selection logic.

### tRPC Router Organization

- **Server**: Main API routers in [apps/server/src/routers/](apps/server/src/routers/) (`jobRouter`, `projectRouter`, `userRouter`, etc.)
- **Cluster**: Cluster-specific tRPC routers in [apps/cluster/src/routers/](apps/cluster/src/routers/)
- **Context**: Fastify request context provides `prisma` and `session` via [apps/server/src/plugins/trpc/context.ts](apps/server/src/plugins/trpc/context.ts)

When adding tRPC procedures, export the router type (`export type JobRouter = typeof jobRouter`) and merge into `appRouter` in [apps/server/src/routers/index.ts](apps/server/src/routers/index.ts).

### Orchestrator Pattern

The [orchestrator plugin](apps/server/src/plugins/orchestrator/plugin.ts) runs a background loop that:

1. Polls for `APPROVED` jobs every 10 seconds
2. Calls `cluster.addJob()` via tRPC to dispatch to cluster
3. Retries with exponential backoff on failure

**Critical**: Jobs are approved via `jobRouter.approve`, then orchestrated async. Don't block tRPC mutations on orchestration.

### CDK Deployment Quirks

- **Dynamic Image Tags**: CDK stacks accept `imageTag` parameter to deploy specific builds
- **Service Discovery**: ECS services use Cloud Map for inter-service communication (`CLUSTER_DISCOVERY_SERVICE`, `CLUSTER_DISCOVERY_NAMESPACE`)
- **EFS Access Points**: Server/cluster mount EFS via access points ([apps/cdk/lib/server-construct.ts](apps/cdk/lib/server-construct.ts))
- **Secrets Manager**: Database credentials injected as ECS secrets, not env vars

### Instance Type Matching

Jobs can specify required instance types (e.g., `g5.xlarge`). The instance metadata includes `type` field, and jobs have `instanceType` field. Matching happens in [apps/instance/src/index.ts](apps/instance/src/index.ts) when scanning for jobs.

### Hashcat Integration

- **Wrapper**: [packages/hashcat/src/exe.ts](packages/hashcat/src/exe.ts) spawns hashcat with args like `-a 0 -m {hashType} -o {output} {hashes} {wordlist}`
- **Potfile Parsing**: `parseHashcatPot()` extracts cracked hashes from `.pot` files
- **Status Parsing**: Hashcat status output parsed in [packages/hashcat/src/status.ts](packages/hashcat/src/status.ts)

## Common Pitfalls

1. **Stale Lock Files**: If requests hang, check for `.lock` files in `/crackodata`. Delete manually or restart services.
2. **Instance Status UI Bug**: Instance details page may show "Pending" while project page is correct (UI-only bug).
3. **CUDA Version Mismatch**: If instance fails, update `nvidia/cuda` base image in [packages/container/instance/docker/Containerfile](packages/container/instance/docker/Containerfile).
4. **Cluster Unreachable**: Server logs `cluster unreachable` if polling fails. Check `CLUSTER_HOST` env var or service discovery config.
5. **EFS Mount Issues**: Cluster logs EFS mount status on startup. Look for "WARNING: No /crackodata mount found!" in logs.

## Key File Paths

- Cluster coordination logic: [packages/filesystem/src/cluster.ts](packages/filesystem/src/cluster.ts)
- Server tRPC routers: [apps/server/src/routers/](apps/server/src/routers/)
- CDK infrastructure: [apps/cdk/lib/](apps/cdk/lib/)
- Deployment script: [scripts/deploy.ps1](scripts/deploy.ps1)
- Cluster factory (type selection): [apps/cluster/src/cluster-factory.ts](apps/cluster/src/cluster-factory.ts)
