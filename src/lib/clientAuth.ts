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
