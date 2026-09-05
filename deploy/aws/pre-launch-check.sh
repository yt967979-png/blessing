#!/usr/bin/env bash
# Pre-client launch checks on the VPS (run after redeploy).
# Usage: bash deploy/aws/pre-launch-check.sh [https://your-domain]

set -euo pipefail

BASE="${1:-}"
ENV_FILE="${ENV_FILE:-/etc/blessing.env}"
PASS=0
FAIL=0

ok() { echo "  ✅ $1"; PASS=$((PASS + 1)); }
bad() { echo "  ❌ $1"; FAIL=$((FAIL + 1)); }
info() { echo "  • $1"; }

echo "======================================================"
echo " Blessing — Pre-launch reliability check"
echo " $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "======================================================"

echo ""
echo "1) Env secrets present (values hidden)"
if [[ ! -f "$ENV_FILE" ]]; then
  bad "$ENV_FILE missing — copy deploy/aws/env.example"
else
  ok "$ENV_FILE exists"
  for key in DATABASE_URL SESSION_SECRET ADMIN_EMAIL ADMIN_PASSWORD \
    NEXT_PUBLIC_GOOGLE_CLIENT_ID PUBLIC_BASE_URL NEXT_PUBLIC_SITE_URL \
    RAZORPAY_KEY_ID RAZORPAY_KEY_SECRET RAZORPAY_WEBHOOK_SECRET \
    ADMIN_PHONE; do
    if grep -qE "^${key}=.+" "$ENV_FILE" 2>/dev/null; then
      val="$(grep -E "^${key}=" "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '\r')"
      if [[ -z "$val" || "$val" == CHANGE_ME* || "$val" == *xxxx* || "$val" == *example* ]]; then
        bad "$key looks empty/placeholder"
      else
        ok "$key set"
      fi
    else
      bad "$key missing"
    fi
  done
  if grep -qE '^SUPER_ADMIN_EMAIL=.+' "$ENV_FILE" 2>/dev/null; then
    ok "SUPER_ADMIN_EMAIL set"
  else
    info "SUPER_ADMIN_EMAIL omitted (defaults to ADMIN_EMAIL)"
  fi
fi

echo ""
echo "2) Local health"
if curl -fsS --max-time 8 "http://127.0.0.1:3000/api/health" >/dev/null 2>&1; then
  ok "localhost /api/health"
else
  bad "localhost /api/health failed — is blessing service up?"
fi
if curl -fsS --max-time 15 "http://127.0.0.1:3000/api/ready" >/dev/null 2>&1; then
  ok "localhost /api/ready (DB)"
else
  bad "localhost /api/ready failed — check DATABASE_URL / Postgres"
fi

echo ""
echo "3) Public URL (optional arg)"
if [[ -n "$BASE" ]]; then
  BASE="${BASE%/}"
  if curl -fsS --max-time 20 "${BASE}/api/health" >/dev/null 2>&1; then
    ok "public ${BASE}/api/health"
  else
    bad "public ${BASE}/api/health"
  fi
  if curl -fsS --max-time 25 "${BASE}/api/ready" >/dev/null 2>&1; then
    ok "public ${BASE}/api/ready"
  else
    bad "public ${BASE}/api/ready"
  fi
else
  info "Pass your HTTPS URL as arg for public checks"
fi

echo ""
echo "4) Nightly backup cron"
if crontab -l 2>/dev/null | grep -q "backup-db.sh"; then
  ok "backup-db.sh cron installed"
else
  bad "backup cron missing — redeploy or add: 0 3 * * * /bin/bash /opt/blessing/deploy/aws/backup-db.sh"
fi
if [[ -d /var/backups/blessing ]] && ls /var/backups/blessing/blessing_db_*.sql.gz >/dev/null 2>&1; then
  ok "at least one backup file exists"
  info "latest: $(cat /var/backups/blessing/LATEST 2>/dev/null || ls -t /var/backups/blessing/blessing_db_*.sql.gz | head -1)"
else
  info "No backup file yet — run once: sudo bash /opt/blessing/deploy/aws/backup-db.sh"
fi

echo ""
echo "5) Angry-customer checklist (manual — tick yourself)"
cat <<'EOF'
  [ ] Google login works on HTTPS
  [ ] Add 4 books → checkout Confirm → Razorpay (test key first)
  [ ] Payment success → order in Admin + customer Orders
  [ ] Double-click Pay → still one order
  [ ] Close browser mid-pay → no orphan charge (or auto-refund)
  [ ] Admin cancel paid order → Razorpay refund
  [ ] Mark product OOS → card greys, ADD/BUY dead (no refresh ideal)
  [ ] Cart qty cannot exceed stock
  [ ] Only Super Admin sees Make Admin
  [ ] UptimeRobot watching /api/health (email/SMS to you)
EOF

echo ""
echo "======================================================"
echo " Result: ${PASS} passed checks, ${FAIL} failed"
echo "======================================================"
if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
exit 0
