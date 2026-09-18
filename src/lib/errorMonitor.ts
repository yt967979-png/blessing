import { getRedisClient } from '@/lib/redis';

export interface SystemErrorItem {
  id: string;
  timestamp: string;
  endpoint: string;
  status: number;
  message: string;
  requestId: string;
}

// In-memory ring buffer (up to 50 items)
const inMemoryErrors: SystemErrorItem[] = [];
let count5xxToday = 0;
let count4xxToday = 0;
let countPaymentFailures = 0;
let countWebhookFailures = 0;
let countApiErrors = 0;

function sanitizeErrorMessage(msg: string): string {
  if (!msg) return 'Unknown error';
  return String(msg)
    .replace(/(rzp_test_[a-zA-Z0-9]+|rzp_live_[a-zA-Z0-9]+)/gi, '[REDACTED_RAZORPAY_KEY]')
    .replace(/([a-zA-Z0-9_-]{20,})/g, (match) => {
      // Don't redact standard words or paths
      if (match.includes('/') || match.includes(' ') || match.length < 24) return match;
      return match.slice(0, 4) + '...' + match.slice(-4) + ' [REDACTED]';
    })
    .replace(/password\s*=\s*['"][^'"]+['"]/gi, 'password="[REDACTED]"')
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL_REDACTED]')
    .replace(/\b\d{10}\b/g, '[PHONE_REDACTED]')
    .slice(0, 300);
}

export async function recordSystemError(opts: {
  endpoint: string;
  status: number;
  message: string;
  requestId?: string;
  isPaymentFailure?: boolean;
  isWebhookFailure?: boolean;
}) {
  const item: SystemErrorItem = {
    id: `err-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    endpoint: opts.endpoint.slice(0, 80),
    status: opts.status,
    message: sanitizeErrorMessage(opts.message),
    requestId: opts.requestId || `req-${Math.random().toString(36).slice(2, 8)}`,
  };

  // Update in-memory counts
  inMemoryErrors.unshift(item);
  if (inMemoryErrors.length > 50) inMemoryErrors.pop();

  if (opts.status >= 500) count5xxToday++;
  else if (opts.status >= 400) count4xxToday++;

  if (opts.isPaymentFailure) countPaymentFailures++;
  if (opts.isWebhookFailure) countWebhookFailures++;
  if (opts.endpoint.startsWith('/api/')) countApiErrors++;

  // Persist into Redis if available
  const redis = getRedisClient();
  if (redis) {
    try {
      const pipeline = redis.pipeline();
      pipeline.lpush('bpg:monitor:errors:list', JSON.stringify(item));
      pipeline.ltrim('bpg:monitor:errors:list', 0, 49);
      pipeline.expire('bpg:monitor:errors:list', 86400);

      if (opts.status >= 500) pipeline.incr('bpg:monitor:errors:5xx');
      else if (opts.status >= 400) pipeline.incr('bpg:monitor:errors:4xx');

      if (opts.isPaymentFailure) pipeline.incr('bpg:monitor:errors:payment');
      if (opts.isWebhookFailure) pipeline.incr('bpg:monitor:errors:webhook');
      if (opts.endpoint.startsWith('/api/')) pipeline.incr('bpg:monitor:errors:api');

      await pipeline.exec();
    } catch {
      // Non-blocking fallback to in-memory
    }
  }
}

export async function getErrorDiagnostics() {
  const redis = getRedisClient();
  let errors = inMemoryErrors;
  let fiveXx = count5xxToday;
  let fourXx = count4xxToday;
  let payments = countPaymentFailures;
  let webhooks = countWebhookFailures;
  let api = countApiErrors;

  if (redis) {
    try {
      const [listRaw, r5, r4, rp, rw, ra] = await Promise.all([
        redis.lrange('bpg:monitor:errors:list', 0, 19),
        redis.get('bpg:monitor:errors:5xx'),
        redis.get('bpg:monitor:errors:4xx'),
        redis.get('bpg:monitor:errors:payment'),
        redis.get('bpg:monitor:errors:webhook'),
        redis.get('bpg:monitor:errors:api'),
      ]);

      if (Array.isArray(listRaw) && listRaw.length > 0) {
        errors = listRaw.map((s) => {
          try {
            return JSON.parse(s);
          } catch {
            return null;
          }
        }).filter(Boolean);
      }
      if (r5) fiveXx = parseInt(r5, 10);
      if (r4) fourXx = parseInt(r4, 10);
      if (rp) payments = parseInt(rp, 10);
      if (rw) webhooks = parseInt(rw, 10);
      if (ra) api = parseInt(ra, 10);
    } catch {
      // Fallback to in-memory values
    }
  }

  const totalErrors = fiveXx + api + payments;

  return {
    totalErrors,
    fiveXx,
    fourXx,
    paymentFailures: payments,
    webhookFailures: webhooks,
    apiErrors: api,
    recentErrors: errors.slice(0, 15),
  };
}

export async function clearSystemErrors() {
  inMemoryErrors.length = 0;
  count5xxToday = 0;
  count4xxToday = 0;
  countPaymentFailures = 0;
  countWebhookFailures = 0;
  countApiErrors = 0;

  const redis = getRedisClient();
  if (redis) {
    try {
      await Promise.all([
        redis.del('bpg:monitor:errors:list'),
        redis.del('bpg:monitor:errors:5xx'),
        redis.del('bpg:monitor:errors:4xx'),
        redis.del('bpg:monitor:errors:payment'),
        redis.del('bpg:monitor:errors:webhook'),
        redis.del('bpg:monitor:errors:api'),
      ]);
    } catch {
      // ignore
    }
  }
}
