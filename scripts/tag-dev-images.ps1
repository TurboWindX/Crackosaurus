# Script to tag existing :latest images as :dev
# Run this BEFORE deploying with the new changes
$ErrorActionPreference = "Stop"

Write-Host "=== Tagging existing images as :dev ===" -ForegroundColor Cyan

# Auto-detect AWS account and region
$AccountId = (aws sts get-caller-identity --query Account --output text)
$Region = (aws configure get region)
if (-not $Region) {
    $Region = "ca-central-1"
}

$REGISTRY = "$AccountId.dkr.ecr.$Region.amazonaws.com"

Write-Host "Account: $AccountId" -ForegroundColor Yellow
Write-Host "Region: $Region" -ForegroundColor Yellow
Write-Host "Registry: $REGISTRY" -ForegroundColor Yellow

# Login to ECR
Write-Host "`nLogging into ECR..." -ForegroundColor Yellow
aws ecr get-login-password --region $Region | docker login --username AWS --password-stdin $REGISTRY

$images = @("server", "cluster", "prisma")

foreach ($image in $images) {
    Write-Host "`nProcessing crackosaurus/$image..." -ForegroundColor Cyan
    
    # Pull :latest
    Write-Host "  Pulling :latest..." -ForegroundColor Gray
    docker pull "$REGISTRY/crackosaurus/${image}:latest"
    
    # Tag as :dev
    Write-Host "  Tagging as :dev..." -ForegroundColor Gray
    docker tag "$REGISTRY/crackosaurus/${image}:latest" "$REGISTRY/crackosaurus/${image}:dev"
    
    # Push :dev
    Write-Host "  Pushing :dev..." -ForegroundColor Gray
    docker push "$REGISTRY/crackosaurus/${image}:dev"
    
}

Write-Host "`n=== All images tagged successfully! ===" -ForegroundColor Green
Write-Host "`nYou can now safely run: .\deploy.ps1 -Environment dev" -ForegroundColor Yellow
