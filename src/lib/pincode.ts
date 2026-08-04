/** Tamil Nadu / serviceable pincode helpers (free, no paid API). */

const TN_PREFIXES = ['60', '61', '62', '63', '64', '65', '66'];

export function normalizePincode(raw: string): string {
  return String(raw || '').replace(/\D/g, '').slice(0, 6);
}

export function isValidPincode(raw: string): boolean {
  return /^\d{6}$/.test(normalizePincode(raw));
}

/** Serviceable for ST Courier Express focus (TN + nearby common prefixes). */
export function isServiceablePincode(raw: string): boolean {
  const pin = normalizePincode(raw);
  if (!isValidPincode(pin)) return false;
  return TN_PREFIXES.some((p) => pin.startsWith(p)) || pin.startsWith('5') || pin.startsWith('67');
}

export function pincodeDeliveryMessage(raw: string): {
  ok: boolean;
  message: string;
  region: 'tn' | 'india' | 'invalid';
} {
  const pin = normalizePincode(raw);
  if (!isValidPincode(pin)) {
    return { ok: false, message: 'Enter a valid 6-digit pincode.', region: 'invalid' };
  }
  if (TN_PREFIXES.some((p) => pin.startsWith(p))) {
    return {
      ok: true,
      message: 'Deliverable via ST Courier — usually 2–3 days in Tamil Nadu.',
      region: 'tn',
    };
  }
  if (isServiceablePincode(pin)) {
    return {
      ok: true,
      message: 'Deliverable via ST Courier — usually 3–5 days.',
      region: 'india',
    };
  }
  return {
    ok: false,
    message: 'This pincode may not be serviceable yet. Call +91 9840418228 to confirm.',
    region: 'invalid',
  };
}
