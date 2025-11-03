# Script to build and push Docker images to ECR
# Auto-detects AWS account, region, and configuration from environment

param(
    [string]$Environment = "dev",
    [string]$ImageTag = "latest"
)

$ErrorActionPreference = "Stop"

# Change to repository root (parent of scripts directory)
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

Write-Host "=== Crackosaurus Docker Image Build and Push ===" -ForegroundColor Cyan
Write-Host "Environment: $Environment" -ForegroundColor Yellow
Write-Host "Image Tag: $ImageTag" -ForegroundColor Yellow

# Auto-detect AWS account and region from AWS CLI/CDK
Write-Host "`nDetecting AWS environment..." -ForegroundColor Yellow
$AccountId = (aws sts get-caller-identity --query Account --output text)
if (-not $AccountId) {
    Write-Host "  ✗ Failed to detect AWS account. Make sure AWS CLI is configured." -ForegroundColor Red
    exit 1
}

$Region = (aws configure get region)
if (-not $Region) {
    $Region = $env:AWS_REGION
    if (-not $Region) {
        $Region = "ca-central-1" # Fallback default
    }
}

Write-Host "  ✓ Account: $AccountId" -ForegroundColor Green
Write-Host "  ✓ Region: $Region" -ForegroundColor Green

# Build configuration - these are the defaults for production
$DatabaseProvider = "postgresql"
$BackendHost = "USE_WEB_HOST"  # Use window.location in frontend
$BackendPort = "8080"  # Must match ALB target group port

Write-Host "`nBuild Configuration:" -ForegroundColor Yellow
Write-Host "  Database Provider: $DatabaseProvider" -ForegroundColor Gray
Write-Host "  Backend Host: $BackendHost (dynamic)" -ForegroundColor Gray
Write-Host "  Backend Port: $BackendPort" -ForegroundColor Gray

$REGISTRY = "$AccountId.dkr.ecr.$Region.amazonaws.com"

# Login to ECR
Write-Host "`nLogging into ECR..." -ForegroundColor Yellow
aws ecr get-login-password --region $Region | docker login --username AWS --password-stdin $REGISTRY

# Create repositories if they don't exist
Write-Host "`nCreating ECR repositories..." -ForegroundColor Yellow
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

# Build and push server image
Write-Host "`nBuilding server image..." -ForegroundColor Yellow
docker build --build-arg DATABASE_PROVIDER=$DatabaseProvider --build-arg BACKEND_HOST=$BackendHost --build-arg BACKEND_PORT=$BackendPort -t $REGISTRY/crackosaurus/server:$ImageTag -f packages/container/server/Containerfile .
Write-Host "Pushing server image..." -ForegroundColor Yellow
docker push $REGISTRY/crackosaurus/server:$ImageTag

# Build and push cluster image
Write-Host "`nBuilding cluster image..." -ForegroundColor Yellow
docker build --build-arg DATABASE_PROVIDER=$DatabaseProvider -t $REGISTRY/crackosaurus/cluster:$ImageTag -f packages/container/cluster/Containerfile .
Write-Host "Pushing cluster image..." -ForegroundColor Yellow
docker push $REGISTRY/crackosaurus/cluster:$ImageTag

# Build and push prisma image
Write-Host "`nBuilding prisma image..." -ForegroundColor Yellow
docker build --build-arg DATABASE_PROVIDER=$DatabaseProvider -t $REGISTRY/crackosaurus/prisma:$ImageTag -f packages/container/prisma/Containerfile .
Write-Host "Pushing prisma image..." -ForegroundColor Yellow
docker push $REGISTRY/crackosaurus/prisma:$ImageTag

Write-Host "`n=== All images built and pushed successfully! ===" -ForegroundColor Green
