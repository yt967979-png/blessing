# Exports Railway blessing env keys (masked) to help paste into Render.
# Usage: powershell -File scripts/export-railway-env-for-render.ps1
# Requires: railway CLI logged in (`railway whoami`).

$ErrorActionPreference = 'Stop'
Write-Host "Fetching Railway variables for service blessing..."
$raw = railway variables --service blessing --kv 2>&1 | Out-String
if ($LASTEXITCODE -ne 0 -and -not ($raw -match '=')) {
  Write-Host "ERROR: Could not read Railway variables. Run: railway login && railway link"
  Write-Host $raw
  exit 1
}

$required = @(
  'DATABASE_URL', 'SESSION_SECRET', 'ADMIN_EMAIL', 'ADMIN_PASSWORD', 'ADMIN_PHONE',
  'NEXT_PUBLIC_GOOGLE_CLIENT_ID', 'NEXT_PUBLIC_SITE_URL'
)
$optional = @(
  'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_UPLOAD_PRESET',
  'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RESEND_API_KEY',
  'GMAIL_USER', 'GMAIL_APP_PASSWORD', 'CRON_SECRET'
)
# Blueprint already sets these on Render - shown for comparison only:
$blueprintOwned = @(
  'RUNTIME_TIER', 'APP_REPLICA_COUNT', 'DB_POOL_MAX', 'DB_IDLE_TIMEOUT_MS',
  'DB_CONNECT_TIMEOUT_MS', 'DISABLE_ORDER_LISTEN', 'DB_TRY_PRIVATE'
)

function Get-EnvLine([string]$key) {
  return ($raw -split "`n" | Where-Object { $_ -match "^$key=" } | Select-Object -First 1)
}

function Write-MaskedKey([string]$key, [string]$line) {
  if (-not $line) {
    Write-Host "$key=<not set on Railway>"
    return
  }
  $val = ($line -replace "^$key=", '').Trim()
  if ($key -eq 'DATABASE_URL' -or $key -match 'SECRET|PASSWORD|KEY|TOKEN') {
    $masked = if ($val.Length -gt 12) { $val.Substring(0, 6) + '***' + $val.Substring($val.Length - 4) } else { '***' }
    Write-Host "$key=$masked  (copy full value from Railway UI)"
  } else {
    Write-Host "$key=$val"
  }
}

Write-Host ""
Write-Host "=== REQUIRED - paste into Render Environment ==="
Write-Host "Get full secret values from Railway Dashboard Variables."
Write-Host ""
foreach ($k in $required) { Write-MaskedKey $k (Get-EnvLine $k) }

Write-Host ""
Write-Host "=== OPTIONAL - paste only if you use the feature ==="
Write-Host ""
foreach ($k in $optional) { Write-MaskedKey $k (Get-EnvLine $k) }

Write-Host ""
Write-Host "=== BLUEPRINT-OWNED (already in render.yaml - do not copy Railway values) ==="
Write-Host ""
foreach ($k in $blueprintOwned) {
  $line = Get-EnvLine $k
  if ($line) {
    $val = ($line -replace "^$k=", '').Trim()
    Write-Host "Railway $k=$val  -> Render uses Blueprint value instead"
  } else {
    Write-Host "Railway $k=<not set>"
  }
}

Write-Host ""
Write-Host "After Render URL is known, set:"
Write-Host "NEXT_PUBLIC_SITE_URL=https://YOUR-SERVICE.onrender.com"
Write-Host ""
Write-Host "Google OAuth - Authorized JavaScript origins (GIS button; not redirect login):"
Write-Host "  https://YOUR-SERVICE.onrender.com"
Write-Host "  https://blessingpowerguide.in"
Write-Host "  https://www.blessingpowerguide.in"
Write-Host ""
Write-Host "Do NOT pause Railway until Render /api/health + /api/ready + Google + Admin + WhatsApp pass."
Write-Host "See RENDER.md sections 4-5."
