# Deploy script for Crackosaurus -> Fargate
param(
    [string]$Environment = "dev"
)

$ErrorActionPreference = "Stop"

Write-Host "=== Crackosaurus Fargate Deployment ===" -ForegroundColor Cyan
Write-Host "Environment: $Environment" -ForegroundColor Yellow

# Step 1: Build and push Docker images (reuses existing script)
Write-Host "[1/3] Building and pushing Docker images..." -ForegroundColor Yellow
Invoke-Expression "`"$PSScriptRoot\push-images.ps1`" -Environment $Environment -ImageTag $Environment"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to build/push Docker images" -ForegroundColor Red
    exit 1
}
Write-Host "Docker images built and pushed successfully" -ForegroundColor Green

# Step 2: Build CDK (TypeScript) and deploy the Fargate stack
Write-Host "[2/3] Building CDK and deploying Fargate stack..." -ForegroundColor Yellow
Set-Location "$PSScriptRoot\..\apps\cdk"

Write-Host "Running npm install/build for CDK project..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "CDK build failed" -ForegroundColor Red
    exit 1
}

# Set environment variables expected by CDK bin script
$env:ENVIRONMENT = $Environment
$env:IMAGE_TAG = $Environment
$env:USE_FARGATE = "true"

Write-Host "Deploying CDK Fargate stack (this may take several minutes)..." -ForegroundColor Yellow
npx cdk deploy "Crackosaurus-Fargate-$Environment" --require-approval never --context useFargate=true --context environment=$Environment --context imageTag=$Environment
if ($LASTEXITCODE -ne 0) {
    Write-Host "CDK deploy failed" -ForegroundColor Red
    exit 1
}

Write-Host "CDK stack deployed successfully" -ForegroundColor Green

# Step 3: Print ALB DNS output
Write-Host "[3/3] Retrieving ALB DNS name..." -ForegroundColor Yellow
$albDns = aws cloudformation describe-stacks `
    --stack-name "Crackosaurus-Fargate-$Environment" `
    --query "Stacks[0].Outputs[?OutputKey=='ALBDns'].OutputValue" `
    --output text 2>$null

if (-not $albDns) {
    Write-Host "Warning: Could not retrieve ALB DNS name from CloudFormation outputs." -ForegroundColor Yellow
} else {
    Write-Host "`nYour application is available at:" -ForegroundColor Cyan
    Write-Host "  http://$albDns" -ForegroundColor White
}

Write-Host "=== Fargate deployment complete ===" -ForegroundColor Green
