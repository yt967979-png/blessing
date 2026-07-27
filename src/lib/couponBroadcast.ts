import { getDbClient, releaseDbClient } from '@/lib/db';
import { couponConditionLabel, couponOfferLabel, restrictionLabel, type CouponRow } from '@/lib/coupons';
import { sendWhatsAppMessageInProcess } from '@/lib/whatsapp';

function siteUrl() {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || 'https://blessing-production.up.railway.app';
  return raw.replace(/\/$/, '');
}

function fmtExpiry(expiry: string | Date | null | undefined) {
  if (!expiry) return 'No expiry — use anytime';
  return new Date(expiry).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function formatCouponWhatsAppMessage(coupon: CouponRow, userName?: string) {
  const name = userName?.trim() || 'Student';
  const offer = couponOfferLabel(coupon);
  const conditions = couponConditionLabel(coupon);
  const restrictions = restrictionLabel(coupon);
  const expiry = fmtExpiry(coupon.expiry_date);
  const title = coupon.title || coupon.code;
  const desc = coupon.description?.trim();

  const lines = [
    '*🎁 BLESSING POWER GUIDE — NEW OFFER*',
    '',
    `Dear *${name}*,`,
    '',
    `*${title}*`,
    '',
    `🏷️ *Coupon code:* \`${coupon.code}\``,
    `✨ *Offer:* ${offer}`,
  ];

  if (desc) lines.push(`📝 ${desc}`);
  if (conditions && conditions !== 'No minimum') lines.push(`📋 ${conditions}`);
  if (restrictions) lines.push(`📚 Applies to: ${restrictions}`);
  lines.push(`⏰ *Valid till:* ${expiry}`);
  lines.push('');
  lines.push(`🛒 Shop & apply at checkout:`);
  lines.push(siteUrl());
  lines.push('');
  lines.push('_Blessing Pathway Education — Power Guides for 6th–12th_');

  return lines.join('\n');
}

async function logWhatsAppSend(phone: string, message: string, status: string, orderId?: string) {
  let client: any = null;
  try {
    client = await getDbClient();
    await client.query(
      `INSERT INTO whatsapp_logs (id, order_id, phone, message, status, sent_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [`walog-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, orderId || null, phone, message.slice(0, 4000), status]
    );
  } catch {
    /* non-fatal */
  } finally {
    releaseDbClient(client);
  }
}

/** Send new-coupon alert to every user with a valid phone (queued, paced). */
export async function broadcastCouponToAllUsers(coupon: CouponRow): Promise<{
  attempted: number;
  sent: number;
  failed: number;
}> {
  let client: any = null;
  const stats = { attempted: 0, sent: 0, failed: 0 };

  try {
    client = await getDbClient();
    const res = await client.query(
      `SELECT DISTINCT ON (phone10)
         phone10,
         name
       FROM (
         SELECT
           RIGHT(REGEXP_REPLACE(COALESCE(phone, ''), '\\D', '', 'g'), 10) AS phone10,
           name
         FROM users
         WHERE COALESCE(status, 'active') = 'active'
           AND phone IS NOT NULL
           AND phone <> ''
       ) u
       WHERE LENGTH(phone10) = 10
       ORDER BY phone10, name`
    );

    const recipients = res.rows as { phone10: string; name: string }[];
    stats.attempted = recipients.length;

    console.log(`[coupon-broadcast] Sending ${coupon.code} to ${recipients.length} users via WhatsApp…`);

    for (const row of recipients) {
      const message = formatCouponWhatsAppMessage(coupon, row.name);
      try {
        await sendWhatsAppMessageInProcess(row.phone10, message);
        stats.sent++;
        await logWhatsAppSend(row.phone10, message, 'SENT', `coupon-${coupon.id}`);
      } catch (err: any) {
        stats.failed++;
        console.warn(`[coupon-broadcast] failed for ${row.phone10}:`, err?.message || err);
        await logWhatsAppSend(row.phone10, message, 'FAILED', `coupon-${coupon.id}`);
      }
    }

    console.log(
      `[coupon-broadcast] ${coupon.code} done — sent ${stats.sent}/${stats.attempted}, failed ${stats.failed}`
    );
    return stats;
  } finally {
    releaseDbClient(client);
  }
}

/** Fire-and-forget wrapper — does not block admin API response. */
export function scheduleCouponWhatsAppBroadcast(coupon: CouponRow) {
  if (String(coupon.status || '').toLowerCase() !== 'active') return;
  setTimeout(() => {
    void broadcastCouponToAllUsers(coupon).catch((err) => {
      console.error('[coupon-broadcast] fatal:', err?.message || err);
    });
  }, 0);
}
