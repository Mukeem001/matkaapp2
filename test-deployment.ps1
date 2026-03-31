$url = "https://matka-api-server.onrender.com/api/bids/version"

for ($i = 0; $i -lt 12; $i++) {
  $time = Get-Date -Format 'HH:mm:ss'
  Write-Host "[$time] Check #$($i+1)..." -ForegroundColor Cyan
  
  try {
    $resp = Invoke-WebRequest -Uri $url -TimeoutSec 10 -ErrorAction Stop
    Write-Host "" -ForegroundColor Green
    Write-Host "✅ DEPLOYMENT SUCCESSFUL!" -ForegroundColor Green
    Write-Host $resp.Content -ForegroundColor Green
    exit 0
  } catch {
    $statusCode = if ($_.Exception.Response) { $_.Exception.Response.StatusCode } else { "Unknown" }
    Write-Host "  ❌ Not ready yet (HTTP $statusCode)" -ForegroundColor Red
    
    if ($i -lt 11) { 
      Write-Host "    Waiting 10s..." -ForegroundColor Gray
      Start-Sleep -Seconds 10 
    }
  }
}

Write-Host "" -ForegroundColor Yellow
Write-Host "⏱️  Timeout - Render still deploying (>2min)" -ForegroundColor Yellow
