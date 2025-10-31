# Crackosaurus ECR Setup and Image Push Script
# Run this script to create ECR repositories and push container images

param(
    [Parameter(Mandatory=$false)]
    [string]$Region = "ca-central-1",
    
    [Parameter(Mandatory=$false)]
    [switch]$SkipBuild = $false
)

# Colors for output
function Write-Success { Write-Host $args -ForegroundColor Green }
function Write-Info { Write-Host $args -ForegroundColor Cyan }
function Write-Warning { Write-Host $args -ForegroundColor Yellow }
function Write-Error { Write-Host $args -ForegroundColor Red }

Write-Info "==================================================="
Write-Info "Crackosaurus ECR Setup Script"
Write-Info "==================================================="

# Get AWS account ID
Write-Info "`nGetting AWS account information..."
try {
    $AccountId = aws sts get-caller-identity --query Account --output text
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to get AWS account ID. Is AWS CLI configured?"
        exit 1
    }
    Write-Success "✓ AWS Account ID: $AccountId"
} catch {
    Write-Error "Failed to get AWS account ID: $_"
    exit 1
}

$EcrUri = "$AccountId.dkr.ecr.$Region.amazonaws.com"
Write-Info "ECR URI: $EcrUri"

# Create ECR repositories
Write-Info "`n==================================================="
Write-Info "Creating ECR Repositories"
Write-Info "==================================================="

$repositories = @("crackosaurus/server", "crackosaurus/cluster")

foreach ($repo in $repositories) {
    Write-Info "`nChecking repository: $repo"
    
    # Check if repository exists
    $repoExists = aws ecr describe-repositories --repository-names $repo --region $Region 2>$null
    
    if ($LASTEXITCODE -eq 0) {
        Write-Warning "Repository $repo already exists"
    } else {
        Write-Info "Creating repository: $repo"
        aws ecr create-repository --repository-name $repo --region $Region --image-scanning-configuration scanOnPush=true | Out-Null
        
        if ($LASTEXITCODE -eq 0) {
            Write-Success "✓ Created repository: $repo"
        } else {
            Write-Error "Failed to create repository: $repo"
            exit 1
        }
    }
}

# Login to ECR
Write-Info "`n==================================================="
Write-Info "Logging into ECR"
Write-Info "==================================================="

try {
    aws ecr get-login-password --region $Region | docker login --username AWS --password-stdin $EcrUri
    if ($LASTEXITCODE -eq 0) {
        Write-Success "✓ Successfully logged into ECR"
    } else {
        Write-Error "Failed to login to ECR"
        exit 1
    }
} catch {
    Write-Error "Failed to login to ECR: $_"
    exit 1
}

if (-not $SkipBuild) {
    # Build and push server image
    Write-Info "`n==================================================="
    Write-Info "Building Server Image"
    Write-Info "==================================================="

    Write-Info "Building server image (this may take several minutes)..."
    docker build -t crackosaurus/server -f apps/server/Dockerfile .
    
    if ($LASTEXITCODE -eq 0) {
        Write-Success "✓ Server image built successfully"
        
        Write-Info "Tagging server image..."
        docker tag crackosaurus/server:latest "$EcrUri/crackosaurus/server:latest"
        
        Write-Info "Pushing server image to ECR..."
        docker push "$EcrUri/crackosaurus/server:latest"
        
        if ($LASTEXITCODE -eq 0) {
            Write-Success "✓ Server image pushed successfully"
        } else {
            Write-Error "Failed to push server image"
            exit 1
        }
    } else {
        Write-Error "Failed to build server image"
        exit 1
    }

    # Build and push cluster image
    Write-Info "`n==================================================="
    Write-Info "Building Cluster Image"
    Write-Info "==================================================="

    Write-Info "Building cluster image (this may take several minutes)..."
    docker build -t crackosaurus/cluster -f apps/cluster/Dockerfile .
    
    if ($LASTEXITCODE -eq 0) {
        Write-Success "✓ Cluster image built successfully"
        
        Write-Info "Tagging cluster image..."
        docker tag crackosaurus/cluster:latest "$EcrUri/crackosaurus/cluster:latest"
        
        Write-Info "Pushing cluster image to ECR..."
        docker push "$EcrUri/crackosaurus/cluster:latest"
        
        if ($LASTEXITCODE -eq 0) {
            Write-Success "✓ Cluster image pushed successfully"
        } else {
            Write-Error "Failed to push cluster image"
            exit 1
        }
    } else {
        Write-Error "Failed to build cluster image"
        exit 1
    }
}

# Verify images
Write-Info "`n==================================================="
Write-Info "Verifying ECR Images"
Write-Info "==================================================="

foreach ($repo in $repositories) {
    Write-Info "`nImages in $repo:"
    aws ecr list-images --repository-name $repo --region $Region --query 'imageIds[*].imageTag' --output table
}

Write-Success "`n==================================================="
Write-Success "ECR Setup Complete!"
Write-Success "==================================================="
Write-Info "`nYou can now deploy using CDK:"
Write-Info "  cd apps/cdk"
Write-Info "  npx cdk deploy"
Write-Info "`nFor production deployment:"
Write-Info "  `$env:ENVIRONMENT = 'prod'"
Write-Info "  npx cdk deploy"
