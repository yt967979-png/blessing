// Client-side validation helpers for Blessing Power Guide auth forms

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

export interface PasswordCriteria {
  minLength: boolean;
  hasUpper: boolean;
  hasLower: boolean;
  hasNumber: boolean;
  hasSpecial: boolean;
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
