# Complete deployment script for Crackosaurus
# Builds and pushes Docker images, then deploys CDK stack

param(
    [string]$Environment = "dev"
)

$ErrorActionPreference = "Stop"

Write-Host "=== Crackosaurus Deployment ===" -ForegroundColor Cyan
Write-Host "Environment: $Environment" -ForegroundColor Yellow

# Step 1: Build and push Docker images
Write-Host "[1/2] Building and pushing Docker images..." -ForegroundColor Yellow
& "$PSScriptRoot\push-images.ps1" -Environment $Environment -ImageTag $Environment

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
$env:IMAGE_TAG = $Environment

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