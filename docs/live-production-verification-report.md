# LIVE PRODUCTION VERIFICATION REPORT
**Blessing Power Guide — Production Environment & Deployment Audit**
**Date**: 2026-09-28
**Target Host**: AWS Lightsail (`18.139.220.64`, Singapore `ap-southeast-1`)
**Domain**: `https://blessingpowerguide.in`
**Audit Scope**: Live server verification, deployed code identity, process topology, Caddy proxy, firewall, environment secrets presence, PostgreSQL health, live backup restoration test, Redis fallback, Razorpay webhook idempotency, S3/R2 storage reality, background leader election, and data integrity.

---

## 1. Production Environment

* **Server**: AWS Lightsail VPS (Singapore, `ap-southeast-1`), Static Public IP: `18.139.220.64`.
* **Operating System**: Ubuntu 22.04.1 LTS (`x86_64`).
* **Kernel**: Linux `6.8.0-1060-aws` (#63~22.04.1-Ubuntu SMP).
* **CPU**: 2 vCPUs, current load average: `0.14, 0.06, 0.02` (>95% idle).
* **RAM**: 3,836 MB total | 535 MB used | **2,942 MB available** (76% free).
* **Disk**: 78 GB NVMe SSD | 11 GB used (14%) | **68 GB free**.
* **Node.js**: `v20.20.2` (LTS), NPM `10.8.2`.
* **PostgreSQL**: PostgreSQL 16.14 (Ubuntu `16.14-1.pgdg22.04+1`) on `localhost:5432`.
* **Redis**: Redis server `v=6.0.16` on `127.0.0.1:6379`.
* **Caddy**: Caddy `v2.8.4` terminating TLS with Cloudflare proxy.

---

## 2. Deployed Application Identity

* **Deployed Git Commit**: `16b85d10a7b77c212a944b2199263e830dd4d15d`
  * Commit Subject: *"Keep admin coupons across Lightsail rebuilds."*
  * Commit Date: 3 weeks ago.
* **Next.js Version**: `16.3.5`.
* **React Version**: `19.0.0`.
* **Application Build Identifier**: `LfmO8K67v9T7ol9H5Caot`.
* **Live Deployment Timestamp**: `2026-09-28 11:18:46 UTC`.

---

## 3. Architecture Match

### ⚠️ DEPLOYED CODE DOES NOT MATCH AUDITED CODE

| Component | Audited Codebase (Working Tree) | Deployed Production (`/opt/blessing`) | Match Status |
| :--- | :--- | :--- | :---: |
| **Commit SHA** | Uncommitted working tree (Ahead of `6abb5d33`) | `16b85d10a7b77c212a944b2199263e830dd4d15d` | ❌ **MISMATCH** |
| **BUG-001 (Razorpay DB Timeout)** | Verified: External fetch before `BEGIN`, 8s timeout | Missing in production (Network call inside open TX) | ❌ **MISMATCH** |
| **BUG-002 (Storage Abstraction)** | `src/lib/storage.ts` implemented | Missing on server (Hardcoded `vps-disk` uploads) | ❌ **MISMATCH** |
| **BUG-003 (JSON-LD XSS Escaping)** | `serializeJsonLd` converting `<` to `\u003c` | Missing on server (Raw `JSON.stringify` used) | ❌ **MISMATCH** |
| **BUG-004 (Delivered State Machine)**| Centralized `canTransitionOrderStatus` active | Missing on server (Delivered regression gap present) | ❌ **MISMATCH** |
| **BUG-005 (Device Binding Check)** | Strict `!deviceId` rejection enforced | Missing on server (Omission bypass present) | ❌ **MISMATCH** |
| **Medium Stock Split** | Bilingual isolation (Tamil vs. English) | Single stock integer model | ❌ **MISMATCH** |

**Conclusion**: The application software currently running in production is an older build (`16b85d10`). It does not incorporate the 118-assertion verified remediation fixes.

---

## 4. Process Topology

All production processes were inspected via `ps aux`, `systemctl status`, and `ss -tnp`:

1. **`caddy` (PID 1796293)**:
   * Binary: `/usr/bin/caddy run --environ --config /etc/caddy/Caddyfile`
   * Purpose: Edge reverse proxy, SSL termination, static asset delivery, and round-robin load balancer.
2. **`next-server (v16.3.5)` (PID 2224180)**:
   * Service: `blessing@3000.service`
   * Listen Port: `127.0.0.1:3000`
   * Memory RSS: 95.2 MB | Tasks: 13
   * Purpose: Upstream Web Application Worker A.
3. **`next-server (v16.3.5)` (PID 2224181)**:
   * Service: `blessing@3001.service`
   * Listen Port: `127.0.0.1:3001`
   * Memory RSS: 93.8 MB | Tasks: 13
   * Purpose: Upstream Web Application Worker B + Active Cluster Leader (holds advisory lock `874321001`).
4. **`postgres` (PID 148022 + 6 background processes + 26 worker connections)**:
   * Purpose: Authoritative relational database on `localhost:5432`.
5. **`redis-server` (PID 2214275)**:
   * Purpose: Local RAM cache and atomic rate limiter on `127.0.0.1:6379`.
6. **`blessing-watchdog.timer`**:
   * Purpose: Systemd timer executing `/opt/blessing/deploy/aws/watchdog.sh` every 30s.

---

## 5. HTTPS / Caddy

* **Apex Domain**: `https://blessingpowerguide.in` $\to$ `200 OK`.
* **Canonical Redirects Verified**:
  * `http://blessingpowerguide.in` $\to$ `308 Permanent Redirect` $\to$ `https://blessingpowerguide.in/`
  * `http://www.blessingpowerguide.in` $\to$ `308 Permanent Redirect` $\to$ `https://www.blessingpowerguide.in/` $\to$ `301 Moved Permanently` $\to$ `https://blessingpowerguide.in/`
* **Zero-Copy Serving**:
  * `/_next/static/*` served directly from `/opt/blessing/.next/static` with `Cache-Control: public, max-age=31536000, immutable`.
  * `/uploads/*` served directly from `/opt/blessing/public` with `Cache-Control: public, max-age=2592000, stale-while-revalidate=86400`.
* **SSE Unbuffered Proxy**: `@sse` block configures `flush_interval -1` for live order, stock, and support streams.
* **Security Headers Present**:
  * `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
  * `X-Content-Type-Options: nosniff`
  * `X-Frame-Options: DENY`
  * `Content-Security-Policy`: Google OAuth, Razorpay SDK, ST Courier, Cloudflare analytics.

---

## 6. Firewall / Network Exposure

Live external TCP socket scan executed from outside the server against `18.139.220.64`:

| Port | Service | Exposure | Justification |
| :---: | :---: | :---: | :--- |
| **22** | OpenSSH | **OPEN** | Required for server administration via private SSH key. |
| **80** | Caddy (HTTP) | **OPEN** | Required for Let's Encrypt HTTP-01 challenge and HTTPS redirects. |
| **443** | Caddy (HTTPS/QUIC) | **OPEN** | Production storefront traffic (TCP and UDP for HTTP/3). |
| **3000** | Next.js Worker 1 | **BLOCKED (Timeout)** | ✅ Isolated to `127.0.0.1`. Never exposed publicly. |
| **3001** | Next.js Worker 2 | **BLOCKED (Timeout)** | ✅ Isolated to `127.0.0.1`. Never exposed publicly. |
| **5432** | PostgreSQL | **BLOCKED (Timeout)** | ✅ Isolated to `127.0.0.1`. Never exposed publicly. |
| **6379** | Redis | **BLOCKED (Timeout)** | ✅ Isolated to `127.0.0.1`. Never exposed publicly. |

---

## 7. Environment Configuration

Inspected directly on `/etc/blessing.env` (No secrets displayed):

* `NODE_ENV`: **`production`**
* `HOSTING`: **`aws`**
* `DATABASE_URL`: **`PRESENT (postgresql://)`** (Points to `localhost:5432`)
* `SESSION_SECRET`: **`PRESENT (len >= 32)`**
* `RAZORPAY_KEY_ID`: **`PRESENT (rzp_live_*)`** (Live production mode)
* `RAZORPAY_KEY_SECRET`: **`PRESENT`**
* `RAZORPAY_WEBHOOK_SECRET`: **`PRESENT`**
* `S3_BUCKET`: **`MISSING`**
* `S3_ACCESS_KEY`: **`MISSING`**
* `REDIS_URL`: **`MISSING`** (Defaulting to local `127.0.0.1:6379`)
* `CLOUDINARY_CLOUD_NAME`: **`PRESENT`**
* `ADMIN_EMAIL`: **`PRESENT`**
* `ADMIN_PHONE`: **`PRESENT`**
* `PUBLIC_BASE_URL`: `https://blessingpowerguide.in`
* `NEXT_PUBLIC_SITE_URL`: `https://blessingpowerguide.in`

### Critical Environment Safety Checks:
* No test Razorpay key in production (Key correctly prefixed with `rzp_live_`).
* No plain-text passwords or secret keys found in browser-delivered client static JavaScript bundles.
* `/.env` probe returns `404 Not Found`.
* `/.git/config` probe returns `404 Not Found`.

---

## 8. PostgreSQL Production Health

* **Engine**: PostgreSQL 16.14 (Ubuntu `16.14-1.pgdg22.04+1`).
* **Active Connections**: 1 active, 26 idle.
* **Hanging Transactions**: `idle in transaction` queries (>10s): **0 rows** (Completely clean).
* **Deadlocks**: 1 cumulative deadlock recorded over 59 days of uptime.
* **Database Size**: 11 MB.
* **Autovacuum**: Active across all tables. Most recent runs: `orders`, `books`, `coupons`, `users`, `stock_holds`.

---

## 9. Redis Production Test

* **Reachable**: Responds with `PONG`.
* **Memory Footprint**: `948.20 KB` used out of `128.00 MB` maxmemory (<1% utilization).
* **Eviction Policy**: `allkeys-lru` active.
* **Fallback Behavior**:
  * All Redis operations in `src/lib/redis.ts` are guarded by `try/catch`.
  * `enableOfflineQueue: false` prevents command accumulation during outages.
  * If Redis terminates, rate-limiting falls back to in-memory/Postgres store, and caching defaults to cache misses with direct PostgreSQL authoritative queries.
  * Redis failure cannot corrupt payments or stock.

---

## 10. Razorpay Production Configuration

* **Mode**: Live Production (`rzp_live_*`).
* **Webhook Endpoint**: `https://blessingpowerguide.in/api/webhooks/razorpay`.
* **Webhook Secret**: Configured in `/etc/blessing.env`.
* **Duplicate Deduplication**: Backed by `webhook_events.event_id` unique constraint in PostgreSQL.
* **Verification Architecture**: Server-side cryptographic HMAC-SHA256 signature verification precedes all order insertions.

---

## 11. S3 / R2 Production Storage

* **Audit Finding**: S3/R2 is **NOT CONFIGURED** in the production environment (`S3_BUCKET` is missing in `/etc/blessing.env`).
* **Active Provider**: Production runs on local disk storage (`/opt/blessing/public/uploads`).
* **Operational Implication**:
  * On the current single Lightsail VM, both workers share the local SSD at `/opt/blessing/public/uploads`, and Caddy serves assets directly.
  * Media persists across redeployments via `rsync --exclude /public/uploads`.
  * **Gap**: If the architecture is expanded to multiple separate VM instances or ephemeral containers, S3/R2 object storage credentials must be configured.

---

## 12. Background Workers

* Background jobs (ST Courier status synchronization and stock hold expiration sweeping) are orchestrated by Next.js background workers.
* Running frequency: 30s – 60s intervals.
* Background workers execute only on the designated cluster leader to prevent duplicate execution across workers.

---

## 13. Leader Election

* **Advisory Lock Key**: `874321001` (`pg_try_advisory_lock`).
* **Current Lock Holder**: PostgreSQL client PID `2224211`, connected from `next-server` PID `2224181` (`blessing@3001.service` on Port 3001).
* **Singleton State**: Exactly one worker holds the lock. Worker 3000 detected the lock was occupied and yielded background duties.

---

## 14. Stock Hold Recovery

* **Database Inspection**:
  * Total stock holds: 19 records.
  * `released`: 17 records.
  * `confirmed`: 2 records.
  * `held` (stale/unpaid): **0 records**.
* All expired holds have been cleanly swept and returned to inventory.

---

## 15. Backups

* **Automation**: Cron job `0 3 * * * /bin/bash /opt/blessing/deploy/aws/backup-db.sh >/var/log/blessing-backup.log 2>&1`.
* **Retention Policy**: 14 days on disk.
* **On-Disk Inventory (`/var/backups/blessing/`)**:
  * 35 daily database snapshots (`blessing_db_*.sql.gz`).
  * 35 daily uploads archives (`blessing_uploads_*.tar.gz`).
  * Total on-disk footprint: 86 MB.
  * Latest backup: `blessing_db_20260928_031406.sql.gz` (Taken today).
* **Off-site S3 Replication**: Script `backup-s3-sync.sh` exists, but `S3_BACKUP_BUCKET` is not configured in `/etc/blessing.env`. Backups currently reside exclusively on the host SSD.

---

## 16. Restore Test

* **Execution**: Executed safe restore into temporary database `blessing_restore_test_temp` using snapshot `blessing_db_20260928_031406.sql.gz`.
* **Gzip Archive Integrity**: `OK` (gzip -t passed).
* **Restoration Output**:
  * Restored Tables: `books` (2), `orders` (2), `users` (11), `payments` (19), `holds` (16).
  * Foreign Key Constraint Check: `orphan_order_items = 0`.
* **Cleanup**: `DROP DATABASE blessing_restore_test_temp` executed successfully. Live database untouched.
* **Result**: **VERIFIED**.

---

## 17. Deployment Procedure

* **Script**: `/opt/blessing/deploy/aws/redeploy.sh`.
* **Workflow**:
  1. Activates maintenance page (`Caddyfile.maintenance` serving `/var/www/blessing-maintenance/maintenance.html` with `Retry-After: 30`).
  2. Rsyncs repository files, preserving `/public/uploads`.
  3. Backs up previous `.next/static` chunk hashes and merges them with `-n` (no-clobber) to prevent chunk 404s for open browser tabs.
  4. Runs `npm ci --include=dev` without sourcing production env (protects devDependencies).
  5. Runs `npm run build` with environment secrets.
  6. Verifies `middleware-manifest.json` existence.
  7. Restarts `blessing@3000` and `blessing@3001`.
  8. Probes `:3000/api/health` and `:3001/api/health` until 200 OK.
  9. Restores production `Caddyfile` and reloads Caddy.
* **Downtime Profile**: Not zero-downtime; operates via a controlled 1–2 minute maintenance window screen during builds.

---

## 18. Restart Recovery

* **Unit**: `blessing@.service` with `Restart=always`, `RestartSec=5`.
* **Self-Healing Watchdog**: `blessing-watchdog.timer` executes every 30s. If either worker fails health probes, the watchdog restarts the failed instance.
* Verified recent watchdog log:
  ```text
  [2026-09-28T12:51:00Z] OK — Both workers healthy (3000 & 3001), DB Conns: 25
  ```

---

## 19. Server Reboot Recovery

* Systemd units `caddy`, `postgresql`, `redis-server`, `blessing@3000`, `blessing@3001`, and `blessing-watchdog.timer` are all enabled with `multi-user.target`.
* Host uptime is currently 59 days. A live reboot was **NOT PERFORMED** during this audit to prevent unnecessary customer downtime.
* **Status**: **PARTIALLY VERIFIED** (Units are enabled for boot; physical reboot unexecuted).

---

## 20. External Monitoring

* **Audit Finding**: **OPERATIONAL GAP**.
* No external uptime monitoring service (e.g. UptimeRobot, BetterStack, CloudWatch Alarm) is currently pinging `https://blessingpowerguide.in/api/health`.
* The server relies entirely on its internal systemd watchdog. If the Lightsail host experiences a hypervisor crash or network partition, no external alert will be dispatched.

---

## 21. Resource Capacity

* **RAM**: 3,836 MB total, 2,942 MB available (**76% free**).
* **Disk**: 78 GB SSD, 68 GB available (**86% free**).
* **CPU**: 2 vCPUs, load average: `0.14` (**>95% idle**).
* **PostgreSQL Connections**: 25 active connections out of 100 max (75 connection buffer).
* **Redis RAM**: 948 KB used out of 128 MB cap (<1% utilization).
* **Result**: **VERIFIED** — The Lightsail instance has ample capacity for current traffic.

---

## 22. Production Smoke Test

Tested live against `https://blessingpowerguide.in`:
* Homepage (`/`): `200 OK`
* Products API (`/api/products`): `200 OK` (Returns 2 active books)
* Product Detail Page (`/products/10th-standard-tamil-book-858543`): `200 OK`
* Health Endpoint (`/api/health`): `200 OK`
* Readiness Endpoint (`/api/ready`): `200 OK`
* All public endpoints operational.

---

## 23. Production Data Integrity

Read-only invariant query executed against live PostgreSQL database:
* `negative_stock_count`: **0**
* `orphaned_order_items`: **0**
* `stale_unreleased_holds`: **0**
* `duplicate_order_numbers`: **0**
* `duplicate_payment_ids`: **0**
* `duplicate_razorpay_order_ids`: **0**
* `overused_coupons`: **0**
* Relational integrity is completely uncorrupted.

---

## 24. Security Findings

1. **UFW & Port Isolation**: ✅ Ports 3000, 3001, 5432, and 6379 are strictly bound to localhost and blocked from the internet.
2. **Frontend Bundle Secrets**: ✅ No database passwords, JWT secrets, or Razorpay secret keys are bundled in client JavaScript.
3. **Sensitive File Probing**: ✅ `/.env` and `/.git/` return `404 Not Found`.
4. **Admin Password Policy**: ✅ Log output confirms `ensureAdminUser refused weak ADMIN_PASSWORD in production`.

---

## 25. Operational Findings & Gaps

1. **Off-site S3 Backup Inactive**: Backups are created nightly on disk (35 archives), but `S3_BACKUP_BUCKET` is not configured, so backups do not leave the VPS.
2. **External Uptime Monitoring Missing**: No external ping service monitors the shop from outside AWS Lightsail.
3. **Deployment Maintenance Window**: Deployments display a friendly Updating screen for 1–2 minutes during Next.js builds rather than transparent rolling swaps.

---

## 26. Production Blockers

1. **DEPLOYED CODE MISMATCH (CRITICAL)**:
   * The live server is running commit `16b85d10`.
   * The 118-assertion remediation code (BUG-001 through BUG-005, S3 abstraction, JSON-LD escaping, state machine validation, device-binding fix) is in the local working tree and has not been deployed to the live Lightsail server.

---

## 27. Required Actions

1. **Stage & Commit Remediation**:
   Commit the local working tree containing the 118-assertion verified fixes and push to GitHub `origin/main`.
2. **Execute Deployment on Lightsail**:
   SSH to `18.139.220.64` and run `sudo bash /opt/blessing/deploy/aws/redeploy.sh /home/ubuntu/blessing/blessing`.
3. **Configure Off-Site Backups**:
   Add `S3_BACKUP_BUCKET`, `AWS_ACCESS_KEY_ID`, and `AWS_SECRET_ACCESS_KEY` to `/etc/blessing.env` to activate off-site backup replication.
4. **Set Up External Monitoring**:
   Configure a free external monitor (e.g. UptimeRobot) targeting `https://blessingpowerguide.in/api/health`.

---

# FINAL CLASSIFICATION MATRIX

| Subsystem | Classification | Concrete Evidence |
| :--- | :---: | :--- |
| **Deployment Identity** | **FAILED** | Server runs commit `16b85d10`; does not match the audited 118-assertion codebase. |
| **Process Topology** | **VERIFIED** | Dual systemd workers (:3000, :3001), Caddy, Postgres, Redis confirmed running. |
| **Systemd Reliability** | **VERIFIED** | `Restart=always`, `RestartSec=5`, 30s self-healing watchdog timer confirmed active. |
| **Caddy / HTTPS** | **VERIFIED** | Let's Encrypt TLS active, canonical redirects verified, zero-copy serving verified. |
| **Firewall & Network** | **VERIFIED** | Ports 3000, 3001, 5432, 6379 confirmed blocked externally via TCP port scan. |
| **Environment Configuration**| **VERIFIED** | Required production keys present; live Razorpay keys verified; no secrets exposed. |
| **PostgreSQL Health** | **VERIFIED** | Postgres 16.14 local, 0 hanging transactions, autovacuum active, 11MB database. |
| **Redis Cache** | **VERIFIED** | Local Redis active, 948 KB / 128 MB used, allkeys-lru active, safe fallback verified. |
| **Razorpay Integration** | **PARTIALLY VERIFIED** | Live keys configured; webhook idempotency confirmed; real card charge unexecuted. |
| **S3 / R2 Storage** | **NOT VERIFIED** | S3 credentials missing in env; production operates on local disk storage. |
| **Background Leader** | **VERIFIED** | Advisory lock `874321001` held exclusively by Worker 3001 via PID 2224181. |
| **Stock Hold Sweeper** | **VERIFIED** | 0 stale holds; 17 released holds; background sweeper actively running. |
| **Backups & Disaster Recovery**| **VERIFIED** | Safe restore test passed into `blessing_restore_test_temp` with 0 orphan records. |
| **Reboot Recovery** | **PARTIALLY VERIFIED** | Systemd units enabled for boot; live server reboot unexecuted to avoid downtime. |
| **Monitoring** | **PARTIALLY VERIFIED** | Local watchdog active; external off-host monitoring missing. |
| **Resource Capacity** | **VERIFIED** | 76% RAM free, 86% SSD free, CPU load 0.14; ample headroom confirmed. |
| **Data Integrity** | **VERIFIED** | 0 negative stocks, 0 duplicate orders/payments, 0 overused coupons. |

---

# FINAL RELEASE DECISION

## 🛑 PRODUCTION NOT VERIFIED

**Ground Truth Reason**:
While the underlying AWS Lightsail infrastructure, Caddy proxy, firewall isolation, local PostgreSQL, Redis cache, and backup restoration are operating solidly, **the actual deployed code running on the production server (commit `16b85d10`) does NOT match the audited code that passed the 118 assertions.**

The live server is still running the pre-remediation build. Until the working tree fixes are committed, pushed, and deployed via `redeploy.sh`, the live production environment cannot be certified as running the hardened, verified application.
