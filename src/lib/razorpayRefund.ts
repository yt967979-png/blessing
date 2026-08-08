/**
 * Razorpay refund helper — used when admin cancels a paid online order.
 * Refund-first: callers should abort cancel if this fails.
 */

export type RefundResult =
  | {
      ok: true;
      refundId: string;
      alreadyRefunded?: boolean;
      amountPaise?: number;
      /** Razorpay refund object status: pending | processed | failed */
      razorpayStatus?: string;
    }
  | { ok: false; error: string };

function razorpayAuthHeader(): string | null {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return null;
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`;
}

/** True when order looks like a captured Razorpay payment that may need a refund. */
export function needsRazorpayRefund(row: {
  payment_method?: string | null;
  payment_status?: string | null;
  razorpay_payment_id?: string | null;
  razorpay_refund_id?: string | null;
}): boolean {
  const method = String(row.payment_method || '').toLowerCase();
  if (method.includes('cod')) return false;
  const payId = String(row.razorpay_payment_id || '').trim();
  if (!payId) return false;
  const ps = String(row.payment_status || '').toLowerCase();
  if (ps.includes('fail') || ps.includes('unpaid')) return false;
  // Already marked refunded in DB — treat as no new refund needed (idempotent path).
  if (ps.includes('refund') || String(row.razorpay_refund_id || '').trim()) return true;
  if (
    ps.includes('paid') ||
    ps.includes('confirm') ||
    ps.includes('captured') ||
    ps.includes('success') ||
    method.includes('razorpay') ||
    method.includes('upi') ||
    method.includes('online')
  ) {
    return true;
  }
  // Any non-COD row with a payment id is treated as prepaid.
  return true;
}

export async function refundRazorpayPayment(opts: {
  paymentId: string;
  /** Optional idempotency / notes */
  orderNumber?: string;
  /** If we already stored a refund id, skip creating another */
  existingRefundId?: string | null;
}): Promise<RefundResult> {
  const paymentId = String(opts.paymentId || '').trim();
  if (!paymentId) return { ok: false, error: 'Missing Razorpay payment id.' };

  const existing = String(opts.existingRefundId || '').trim();
  if (existing) {
    return { ok: true, refundId: existing, alreadyRefunded: true };
  }

  const auth = razorpayAuthHeader();
  if (!auth) {
    return {
      ok: false,
      error:
        'Razorpay is not configured (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET). Cannot refund — cancel aborted.',
    };
  }

  try {
    // Check payment first — already fully refunded is success (idempotent).
    const payRes = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}`, {
      headers: { Authorization: auth },
    });
    const payment = await payRes.json().catch(() => ({}));
    if (!payRes.ok) {
      return {
        ok: false,
        error:
          payment?.error?.description ||
          `Could not fetch Razorpay payment (${payRes.status}). Cancel aborted.`,
      };
    }

    const amount = Number(payment.amount || 0);
    const amountRefunded = Number(payment.amount_refunded || 0);
    const status = String(payment.status || '').toLowerCase();

    if (status === 'refunded' || (amount > 0 && amountRefunded >= amount)) {
      // Prefer the latest refund id if available
      let refundId = `already_${paymentId}`;
      try {
        const listRes = await fetch(
          `https://api.razorpay.com/v1/payments/${paymentId}/refunds?count=1`,
          { headers: { Authorization: auth } }
        );
        const list = await listRes.json().catch(() => ({}));
        const first = Array.isArray(list?.items) ? list.items[0] : null;
        if (first?.id) refundId = String(first.id);
      } catch {
        /* keep synthetic id */
      }
      return { ok: true, refundId, alreadyRefunded: true, amountPaise: amount, razorpayStatus: 'processed' };
    }

    if (status !== 'captured' && status !== 'authorized') {
      return {
        ok: false,
        error: `Payment status is "${payment.status || 'unknown'}" — cannot refund. Cancel aborted.`,
      };
    }

    const refundRes = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}/refunds`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: auth,
      },
      body: JSON.stringify({
        amount, // full refund
        notes: {
          order_number: String(opts.orderNumber || ''),
          reason: 'admin_cancel',
        },
      }),
    });
    const refundData = await refundRes.json().catch(() => ({}));

    if (!refundRes.ok) {
      const desc = refundData?.error?.description || '';
      // Race: another refund completed between GET and POST
      if (
        String(desc).toLowerCase().includes('already') ||
        String(refundData?.error?.code || '').includes('refund')
      ) {
        const again = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}`, {
          headers: { Authorization: auth },
        });
        const againPay = await again.json().catch(() => ({}));
        if (
          String(againPay.status || '').toLowerCase() === 'refunded' ||
          Number(againPay.amount_refunded || 0) >= Number(againPay.amount || 0)
        ) {
          return {
            ok: true,
            refundId: String(refundData?.id || `already_${paymentId}`),
            alreadyRefunded: true,
            amountPaise: Number(againPay.amount || amount),
            razorpayStatus: 'processed',
          };
        }
      }
      return {
        ok: false,
        error: desc || `Razorpay refund failed (${refundRes.status}). Cancel aborted — retry cancel after fixing payment.`,
      };
    }

    const refundId = String(refundData.id || '').trim();
    if (!refundId) {
      return { ok: false, error: 'Razorpay refund succeeded but returned no refund id. Cancel aborted.' };
    }

    return {
      ok: true,
      refundId,
      amountPaise: amount,
      razorpayStatus: String(refundData.status || 'processed').toLowerCase(),
    };
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || 'Razorpay refund request failed. Cancel aborted.',
    };
  }
}
