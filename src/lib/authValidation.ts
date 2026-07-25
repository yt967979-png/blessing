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
    (pass === 'admin123' || pass === 'bpg_admin_key_2026')
  );
}
