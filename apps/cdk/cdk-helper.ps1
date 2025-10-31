# Crackosaurus CDK Helper Script
# Simplifies common CDK operations

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("synth", "deploy", "diff", "destroy", "outputs", "logs")]
    [string]$Action,
    
    [Parameter(Mandatory=$false)]
    [ValidateSet("dev", "prod")]
    [string]$Environment = "dev",
    
    [Parameter(Mandatory=$false)]
    [string]$Region = "ca-central-1",
    
    [Parameter(Mandatory=$false)]
    [switch]$AutoApprove = $false
)

# Colors for output
function Write-Success { Write-Host $args -ForegroundColor Green }
function Write-Info { Write-Host $args -ForegroundColor Cyan }
function Write-Warning { Write-Host $args -ForegroundColor Yellow }
function Write-Error { Write-Host $args -ForegroundColor Red }

# Set environment variables
$env:ENVIRONMENT = $Environment
$env:CDK_DEFAULT_REGION = $Region

# Get AWS account ID
try {
    $AccountId = aws sts get-caller-identity --query Account --output text
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to get AWS account ID. Is AWS CLI configured?"
        exit 1
    }
    $env:CDK_DEFAULT_ACCOUNT = $AccountId
    Write-Info "Using AWS Account: $AccountId"
} catch {
    Write-Error "Failed to get AWS account ID: $_"
    exit 1
}

$StackName = "Crackosaurus-$Environment"

switch ($Action) {
    "synth" {
        Write-Info "`nSynthesizing CloudFormation template..."
        npx cdk synth
    }
    
    "deploy" {
        Write-Info "`nDeploying $StackName..."
        if ($AutoApprove) {
            npx cdk deploy --require-approval never
        } else {
            npx cdk deploy
        }
        
        if ($LASTEXITCODE -eq 0) {
            Write-Success "`n✓ Deployment successful!"
            Write-Info "`nRetrieving outputs..."
            aws cloudformation describe-stacks --stack-name $StackName --query 'Stacks[0].Outputs' --output table
        }
    }
    
    "diff" {
        Write-Info "`nShowing differences for $StackName..."
        npx cdk diff
    }
    
    "destroy" {
        Write-Warning "`nWARNING: This will destroy the entire $StackName stack!"
        if ($Environment -eq "prod") {
            Write-Warning "You are about to destroy the PRODUCTION environment!"
            $confirm = Read-Host "Type 'DELETE' to confirm"
            if ($confirm -ne "DELETE") {
                Write-Info "Aborted"
                exit 0
            }
        }
        
        Write-Info "`nDestroying $StackName..."
        npx cdk destroy
    }
    
    "outputs" {
        Write-Info "`nRetrieving CloudFormation outputs for $StackName..."
        $outputs = aws cloudformation describe-stacks --stack-name $StackName --query 'Stacks[0].Outputs' --output json | ConvertFrom-Json
        
        Write-Info "`n==================================================="
        Write-Info "Stack Outputs"
        Write-Info "==================================================="
        
        foreach ($output in $outputs) {
            Write-Host ""
            Write-Host "$($output.OutputKey):" -ForegroundColor Yellow
            Write-Host "  $($output.OutputValue)" -ForegroundColor White
            if ($output.Description) {
                Write-Host "  $($output.Description)" -ForegroundColor Gray
            }
        }
    }
    
    "logs" {
        Write-Info "`nFetching recent logs for $StackName..."
        
        # Get cluster name
        $clusterName = aws cloudformation describe-stacks --stack-name $StackName --query 'Stacks[0].Outputs[?OutputKey==`ClusterName`].OutputValue' --output text
        
        if ([string]::IsNullOrWhiteSpace($clusterName)) {
            Write-Error "Could not find cluster name in stack outputs"
            exit 1
        }
        
        Write-Info "Cluster: $clusterName"
        Write-Info "`nSelect log stream:"
        Write-Host "1. Server logs"
        Write-Host "2. Cluster logs"
        $choice = Read-Host "Enter choice (1-2)"
        
        $logGroup = switch ($choice) {
            "1" { "/aws/ecs/server" }
            "2" { "/aws/ecs/cluster" }
            default { 
                Write-Error "Invalid choice"
                exit 1
            }
        }
        
        Write-Info "`nTailing logs from $logGroup (Ctrl+C to exit)..."
        aws logs tail $logGroup --follow --format short
    }
}

Write-Info "`n==================================================="
Write-Success "Operation Complete"
Write-Info "==================================================="
