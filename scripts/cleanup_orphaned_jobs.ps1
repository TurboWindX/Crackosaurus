#!/usr/bin/env pwsh
# Cleanup orphaned jobs via tRPC endpoint
# This script calls the job.cleanupOrphaned mutation to mark orphaned jobs as Error

param(
    [string]$ServerUrl = "http://localhost:8080",
    [switch]$Help
)

if ($Help) {
    Write-Host "Usage: .\scripts\cleanup_orphaned_jobs.ps1 [-ServerUrl <url>]"
    Write-Host ""
    Write-Host "Options:"
    Write-Host "  -ServerUrl   Server URL (default: http://localhost:8080)"
    Write-Host "  -Help        Show this help message"
    Write-Host ""
    Write-Host "Example:"
    Write-Host "  .\scripts\cleanup_orphaned_jobs.ps1"
    Write-Host "  .\scripts\cleanup_orphaned_jobs.ps1 -ServerUrl https://bleeding.crackosaurus.example.com"
    exit 0
}

Write-Host "Cleaning up orphaned jobs..." -ForegroundColor Cyan
Write-Host "Server: $ServerUrl" -ForegroundColor Gray

# Prepare tRPC request
$endpoint = "$ServerUrl/trpc/job.cleanupOrphaned"

try {
    # Make the request (assuming no auth required or session cookie is set)
    $response = Invoke-RestMethod -Uri $endpoint -Method POST -ContentType "application/json" -Body "{}"
    
    $count = $response.result.data
    
    if ($count -eq 0) {
        Write-Host "✓ No orphaned jobs found" -ForegroundColor Green
    } else {
        Write-Host "✓ Marked $count orphaned job(s) as Error" -ForegroundColor Green
    }
    
    exit 0
} catch {
    Write-Host "✗ Failed to cleanup orphaned jobs:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    
    if ($_.ErrorDetails) {
        Write-Host "Details: $($_.ErrorDetails.Message)" -ForegroundColor Yellow
    }
    
    Write-Host ""
    Write-Host "Note: If you see an UNAUTHORIZED error, you may need to:" -ForegroundColor Yellow
    Write-Host "  1. Run this script from a browser console with an active session" -ForegroundColor Yellow
    Write-Host "  2. Or manually run this SQL query:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "UPDATE ""Job""" -ForegroundColor Cyan
    Write-Host "SET ""status"" = 'Error'," -ForegroundColor Cyan
    Write-Host "    ""rejectionNote"" = 'Orphaned job: no hashes associated'," -ForegroundColor Cyan
    Write-Host "    ""updatedAt"" = NOW()" -ForegroundColor Cyan
    Write-Host "WHERE ""JID"" IN (" -ForegroundColor Cyan
    Write-Host "  SELECT j.""JID""" -ForegroundColor Cyan
    Write-Host "  FROM ""Job"" j" -ForegroundColor Cyan
    Write-Host "  LEFT JOIN ""_HashToJob"" hj ON j.""JID"" = hj.""B""" -ForegroundColor Cyan
    Write-Host "  WHERE hj.""A"" IS NULL" -ForegroundColor Cyan
    Write-Host ");" -ForegroundColor Cyan
    
    exit 1
}
