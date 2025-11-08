# Complete deployment script for Crackosaurus
# Builds and pushes Docker images, then deploys CDK stack


param(
    [string]$Environment = "dev"
)

$ErrorActionPreference = "Stop"

Write-Host "=== Crackosaurus Deployment ===" -ForegroundColor Cyan
Write-Host "Environment: $Environment" -ForegroundColor Yellow


# Step 1: Generate dynamic image tag (e.g., bleeding-20251107-1530)
$DateTag = Get-Date -Format 'yyyyMMdd-HHmmss'
$ImageTag = "$Environment-$DateTag"
Write-Host "[1/2] Building and pushing Docker images..." -ForegroundColor Yellow
Write-Host "Image Tag: $ImageTag" -ForegroundColor Yellow
## Inline build & push (replaces push-images.ps1) -- ensures correct tag is used

# Change to repository root (parent of scripts directory)
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

# Auto-detect AWS account and region
Write-Host "`nDetecting AWS environment..." -ForegroundColor Yellow
$AccountId = (aws sts get-caller-identity --query Account --output text) 2>$null
if (-not $AccountId) {
    Write-Host "  ✗ Failed to detect AWS account. Make sure AWS CLI is configured." -ForegroundColor Red
    exit 1
}

$Region = (aws configure get region)
if (-not $Region) {
    $Region = $env:AWS_REGION
    if (-not $Region) {
        $Region = "ca-central-1" # fallback
    }
}

Write-Host "  ✓ Account: $AccountId" -ForegroundColor Green
Write-Host "  ✓ Region: $Region" -ForegroundColor Green

# Build configuration
$DatabaseProvider = "postgresql"
$BackendHost = "USE_WEB_HOST"
$BackendPort = "8080"

Write-Host "`nBuild Configuration:" -ForegroundColor Yellow
Write-Host "  Database Provider: $DatabaseProvider" -ForegroundColor Gray
Write-Host "  Backend Host: $BackendHost (dynamic)" -ForegroundColor Gray
Write-Host "  Backend Port: $BackendPort" -ForegroundColor Gray

$REGISTRY = "$AccountId.dkr.ecr.$Region.amazonaws.com"

# Login to ECR
Write-Host "`nLogging into ECR..." -ForegroundColor Yellow
aws ecr get-login-password --region $Region | docker login --username AWS --password-stdin $REGISTRY

# Create repos if missing
Write-Host "`nCreating ECR repositories if missing..." -ForegroundColor Yellow
$repos = @("crackosaurus/server", "crackosaurus/cluster", "crackosaurus/prisma")
foreach ($repo in $repos) {
    aws ecr describe-repositories --repository-names $repo --region $Region 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✓ Repository $repo already exists" -ForegroundColor Green
    } else {
        Write-Host "  Creating repository $repo..." -ForegroundColor Gray
        aws ecr create-repository --repository-name $repo --region $Region 2>$null | Out-Null
        Write-Host "  ✓ Repository $repo created" -ForegroundColor Green
    }
}

# Build and push images with the dynamic tag
Write-Host "`nBuilding server image..." -ForegroundColor Yellow
docker build --build-arg DATABASE_PROVIDER=$DatabaseProvider --build-arg BACKEND_HOST=$BackendHost --build-arg BACKEND_PORT=$BackendPort -t $REGISTRY/crackosaurus/server:$ImageTag -f packages/container/server/Containerfile .
Write-Host "Pushing server image $REGISTRY/crackosaurus/server:$ImageTag..." -ForegroundColor Yellow
docker push $REGISTRY/crackosaurus/server:$ImageTag

Write-Host "`nBuilding cluster image..." -ForegroundColor Yellow
docker build --build-arg DATABASE_PROVIDER=$DatabaseProvider -t $REGISTRY/crackosaurus/cluster:$ImageTag -f packages/container/cluster/Containerfile .
Write-Host "Pushing cluster image $REGISTRY/crackosaurus/cluster:$ImageTag..." -ForegroundColor Yellow
docker push $REGISTRY/crackosaurus/cluster:$ImageTag

Write-Host "`nBuilding prisma image..." -ForegroundColor Yellow
docker build --build-arg DATABASE_PROVIDER=$DatabaseProvider -t $REGISTRY/crackosaurus/prisma:$ImageTag -f packages/container/prisma/Containerfile .
Write-Host "Pushing prisma image $REGISTRY/crackosaurus/prisma:$ImageTag..." -ForegroundColor Yellow
docker push $REGISTRY/crackosaurus/prisma:$ImageTag

Write-Host "`n=== All images built and pushed successfully! ===" -ForegroundColor Green

if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to build/push Docker images" -ForegroundColor Red
    exit 1
}
Write-Host "Docker images built and pushed successfully" -ForegroundColor Green

# Step 2: Deploy CDK stack
Write-Host "[2/2] Deploying CDK stack..." -ForegroundColor Yellow
Set-Location "$PSScriptRoot\..\apps\cdk"


# Set environment variable for CDK to pick up
$env:ENVIRONMENT = $Environment
$env:IMAGE_TAG = $ImageTag

# --- Pre-deploy CloudFormation safety check ---
# If the stack is mid-update/rollback, cancel the update and wait for it to settle
$stackName = "Crackosaurus-$Environment"
Write-Host "Checking CloudFormation stack status for $stackName" -ForegroundColor Cyan
try {
    $status = aws cloudformation describe-stacks --stack-name $stackName --query "Stacks[0].StackStatus" --output text 2>$null
} catch {
    $status = $null
}

if (-not $status) {
    Write-Host "Stack $stackName not found (will create on deploy)." -ForegroundColor Green
} else {
    Write-Host "Current stack status: $status" -ForegroundColor Yellow
    $blocking = @(
        'UPDATE_IN_PROGRESS',
        'UPDATE_ROLLBACK_IN_PROGRESS',
        'UPDATE_ROLLBACK_COMPLETE_CLEANUP_IN_PROGRESS'
    )
    if ($blocking -contains $status) {
        Write-Host "Stack is in $status. Attempting to cancel update and wait for it to finish..." -ForegroundColor Yellow
        aws cloudformation cancel-update-stack --stack-name $stackName

        $start = Get-Date
        do {
            Start-Sleep -Seconds 5
            $status = aws cloudformation describe-stacks --stack-name $stackName --query "Stacks[0].StackStatus" --output text
            Write-Host "Waiting: stack status is $status"
        } while (($blocking -contains $status) -and ((Get-Date) - $start).TotalMinutes -lt 20)

        if ($blocking -contains $status) {
            Write-Host "Timed out waiting for stack to leave in-progress state (status: $status). Please check CloudFormation console and retry." -ForegroundColor Red
            exit 1
        }

        Write-Host "Stack is now in state $status; continuing with deploy..." -ForegroundColor Green
    }
}

npx cdk deploy "Crackosaurus-$Environment" --require-approval never

if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to deploy CDK stack" -ForegroundColor Red
    exit 1
}
Write-Host "CDK stack deployed successfully" -ForegroundColor Green

# Get the ALB DNS name
Write-Host "=== Deployment Complete ===" -ForegroundColor Green

$albDns = aws cloudformation describe-stacks `
    --stack-name "Crackosaurus-$Environment" `
    --query "Stacks[0].Outputs[?OutputKey=='LoadBalancerDNS'].OutputValue" `
    --output text

if (-not $albDns) {
    Write-Host "Warning: Could not retrieve Load Balancer DNS name." -ForegroundColor Yellow
} else {
    Write-Host "`nYour application is available at:" -ForegroundColor Cyan
    Write-Host "  http://$albDns" -ForegroundColor White
}