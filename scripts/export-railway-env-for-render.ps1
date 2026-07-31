# Exports Railway blessing env keys (masked) to help paste into Render.
# Usage: powershell -File scripts/export-railway-env-for-render.ps1

$ErrorActionPreference = 'Stop'
Write-Host "Fetching Railway variables for service blessing..."
$raw = railway variables --service blessing --kv 2>&1 | Out-String
$keys = @(
  'DATABASE_URL','SESSION_SECRET','ADMIN_EMAIL','ADMIN_PASSWORD','ADMIN_PHONE',
  'NEXT_PUBLIC_GOOGLE_CLIENT_ID','NEXT_PUBLIC_SITE_URL',
  'CLOUDINARY_CLOUD_NAME','CLOUDINARY_API_KEY','CLOUDINARY_UPLOAD_PRESET',
  'CLOUDINARY_API_SECRET','RAZORPAY_KEY_ID','RAZORPAY_KEY_SECRET','RESEND_API_KEY'
)

Write-Host ""
Write-Host "=== Paste into Render → Environment (values masked here) ==="
Write-Host "Get full values from Railway Dashboard → Variables (copy each)."
Write-Host ""

foreach ($k in $keys) {
  $line = ($raw -split "`n" | Where-Object { $_ -match "^$k=" } | Select-Object -First 1)
  if (-not $line) {
    Write-Host "$k=<not set on Railway>"
    continue
  }
  $val = ($line -replace "^$k=", '').Trim()
  if ($k -eq 'DATABASE_URL' -or $k -match 'SECRET|PASSWORD|KEY') {
    $masked = if ($val.Length -gt 12) { $val.Substring(0, 6) + '***' + $val.Substring($val.Length - 4) } else { '***' }
    Write-Host "$k=$masked  (copy full value from Railway UI)"
  } else {
    Write-Host "$k=$val"
  }
}

Write-Host ""
Write-Host "After Render URL is known, set:"
Write-Host "NEXT_PUBLIC_SITE_URL=https://YOUR-SERVICE.onrender.com"
Write-Host ""
Write-Host "Google OAuth origins to add:"
Write-Host "  https://YOUR-SERVICE.onrender.com"
Write-Host "  https://blessingpowerguide.in"
Write-Host "  https://www.blessingpowerguide.in"
