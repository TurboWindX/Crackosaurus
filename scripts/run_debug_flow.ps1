param(
  [string]$Env = "bleeding",
  [string]$AwsProfile = "",
  [int]$WaitSeconds = 15
)

Write-Host "Deploying to environment: $Env"
# Run the existing deploy helper
& .\scripts\deploy.ps1 $Env
if ($LASTEXITCODE -ne 0) {
  Write-Error "Deploy script failed with exit code $LASTEXITCODE"
  exit $LASTEXITCODE
}

Write-Host "Waiting $WaitSeconds seconds for services to start/stabilize..."
Start-Sleep -Seconds $WaitSeconds

Write-Host "Fetching ECS/CloudWatch logs (skip approve)..."
python3 .\scripts\approve_job.py --skip-approve --aws-profile $AwsProfile
$pyExit = $LASTEXITCODE

if ($pyExit -ne 0) {
  Write-Warning "Log fetch script exited with code $pyExit"
} else {
  Write-Host "Log fetch completed successfully."
}

exit $pyExit
