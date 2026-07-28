import { isValidMobileNumber, normalizeMobileDigits } from '@/lib/authValidation';

export function userNeedsProfile(phone: string | null | undefined): boolean {
  const digits = normalizeMobileDigits(String(phone || ''));
  return !isValidMobileNumber(digits);
}

export function isPlaceholderPhone(phone: string | null | undefined): boolean {
  const digits = normalizeMobileDigits(String(phone || ''));
  return digits === '0000000000' || digits.length < 10;
}
