// Disposable Email Domain Prevention & Security Validation Helper

const DISPOSABLE_EMAIL_DOMAINS = new Set([
  'mailinator.com',
  '10minutemail.com',
  'tempmail.com',
  'guerrillamail.com',
  'yopmail.com',
  'dispostable.com',
  'trashmail.com',
  'sharklasers.com',
  'getnada.com',
  'tempmail.net',
  'throwawaymail.com',
  'maildrop.cc',
  'fakemailgenerator.com',
  'crazymailing.com',
  'mytemp.email',
  'bccto.me',
  'getairmail.com',
  'disposablemail.com',
]);

export function isDisposableEmail(email: string): boolean {
  if (!email || !email.includes('@')) return true;
  const domain = email.split('@')[1]?.toLowerCase().trim();
  return DISPOSABLE_EMAIL_DOMAINS.has(domain);
}

export function isValidEmailFormat(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function isAdminCredentials(email: string, pass: string): boolean {
  const cleanEmail = email.toLowerCase().trim();
  return (
    (cleanEmail === 'admin@blessingpowerguide.in' || cleanEmail === 'admin@gmail.com' || cleanEmail === 'admin') &&
    (pass === '123456' || pass === 'admin123' || pass === 'bpg_admin_key_2026')
  );
}

export interface PasswordCriteria {
  minLength: boolean; // >= 8 chars
  hasUpper: boolean;  // >= 1 Uppercase (A-Z)
  hasLower: boolean;  // >= 1 Lowercase (a-z)
  hasNumber: boolean; // >= 1 Number (0-9)
  hasSpecial: boolean;// >= 1 Special Character (!@#$%^&*)
}

export function checkPasswordCriteria(password: string): PasswordCriteria {
  return {
    minLength: password.length >= 8,
    hasUpper: /[A-Z]/.test(password),
    hasLower: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecial: /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password),
  };
}

export function isStrongPassword(password: string): boolean {
  const c = checkPasswordCriteria(password);
  return c.minLength && c.hasUpper && c.hasLower && c.hasNumber && c.hasSpecial;
}
