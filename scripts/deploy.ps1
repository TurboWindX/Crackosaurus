# Complete deployment script for Crackosaurus
# Builds and pushes Docker images, then deploys CDK stack

param(
    [string]$Environment = "dev"
)

$ErrorActionPreference = "Stop"

Write-Host "=== Crackosaurus Deployment ===" -ForegroundColor Cyan
Write-Host "Environment: $Environment" -ForegroundColor Yellow

# Step 1: Build and push Docker images
Write-Host "`n[1/2] Building and pushing Docker images..." -ForegroundColor Yellow
& "$PSScriptRoot\push-images.ps1" -Environment $Environment -ImageTag $Environment

if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to build/push Docker images" -ForegroundColor Red
    exit 1
}
Write-Host "Docker images built and pushed successfully" -ForegroundColor Green

# Step 2: Deploy CDK stack
Write-Host "`n[2/2] Deploying CDK stack..." -ForegroundColor Yellow
Set-Location "$PSScriptRoot\..\apps\cdk"

# Set environment variable for CDK to pick up
$env:ENVIRONMENT = $Environment
$env:IMAGE_TAG = $Environment

npx cdk deploy "Crackosaurus-$Environment" --require-approval never

if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to deploy CDK stack" -ForegroundColor Red
    exit 1
}
Write-Host "CDK stack deployed successfully" -ForegroundColor Green

# Get the ALB DNS name
Write-Host "`n=== Deployment Complete ===" -ForegroundColor Green

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