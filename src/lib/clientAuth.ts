import type { UserData } from '@/context/StoreContext';

export function authHeaders(user: UserData | null, extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extra,
  };
  if (user?.token) {
    headers.Authorization = `Bearer ${user.token}`;
  }
  return headers;
}

export function authFormHeaders(user: UserData | null, extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = {
    ...extra,
  };
  // Explicitly do not set Content-Type so browser computes multipart/form-data boundary
  if (user?.token) {
    headers.Authorization = `Bearer ${user.token}`;
  }
  return headers;
}
