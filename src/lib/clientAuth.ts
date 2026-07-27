import type { UserData } from '@/context/StoreContext';

export function authHeaders(user: UserData | null, extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extra,
  };
  if (user?.token) {
    headers.Authorization = `Bearer ${user.token}`;
  }
  if (user?.id) {
    headers['x-admin-user-id'] = String(user.id);
  }
  return headers;
}
