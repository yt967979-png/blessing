import type { UserData } from '@/context/StoreContext';
import { authHeaders } from '@/lib/clientAuth';

export interface SavedAddress {
  id: string;
  type: string;
  name: string;
  phone: string;
  alternatePhone?: string;
  address: string;
  landmark?: string;
  city: string;
  pincode: string;
  state?: string;
  isDefault?: boolean;
}

export type AddressMutationResult =
  | { ok: true; address: SavedAddress }
  | { ok: false; error: string };

async function readAddressApiError(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const data = JSON.parse(text) as { error?: string; message?: string };
    if (data?.error) return String(data.error);
    if (data?.message) return String(data.message);
  } catch {
    /* not JSON */
  }
  return text.slice(0, 180) || `Could not save address (${res.status}).`;
}

export async function fetchUserAddresses(user: UserData | null): Promise<SavedAddress[]> {
  if (!user?.id) return [];
  const res = await fetch(`/api/addresses?userId=${encodeURIComponent(String(user.id))}`, {
    headers: authHeaders(user),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function createUserAddress(
  user: UserData | null,
  addr: Omit<SavedAddress, 'id'> & { isDefault?: boolean }
): Promise<AddressMutationResult> {
  if (!user?.id) return { ok: false, error: 'Login required to save an address.' };
  const res = await fetch('/api/addresses', {
    method: 'POST',
    headers: authHeaders(user),
    body: JSON.stringify({ userId: user.id, ...addr }),
  });
  if (!res.ok) return { ok: false, error: await readAddressApiError(res) };
  return { ok: true, address: await res.json() };
}

export async function updateUserAddress(
  user: UserData | null,
  id: string,
  patch: Partial<Omit<SavedAddress, 'id'>> & { isDefault?: boolean }
): Promise<AddressMutationResult> {
  if (!user?.id || !id) return { ok: false, error: 'Login required to update an address.' };
  const res = await fetch('/api/addresses', {
    method: 'PATCH',
    headers: authHeaders(user),
    body: JSON.stringify({ id, userId: user.id, ...patch }),
  });
  if (!res.ok) return { ok: false, error: await readAddressApiError(res) };
  return { ok: true, address: await res.json() };
}

export async function deleteUserAddress(user: UserData | null, id: string): Promise<boolean> {
  if (!user?.id || !id) return false;
  const res = await fetch(
    `/api/addresses?id=${encodeURIComponent(id)}&userId=${encodeURIComponent(String(user.id))}`,
    { method: 'DELETE', headers: authHeaders(user) }
  );
  return res.ok;
}

/** One-time migrate any old localStorage addresses into DB, then clear them. */
export async function migrateLocalAddressesToDb(user: UserData | null): Promise<SavedAddress[]> {
  if (!user?.id || typeof window === 'undefined') return fetchUserAddresses(user);

  const existing = await fetchUserAddresses(user);
  const raw = localStorage.getItem('bpg_user_addresses');
  if (!raw) return existing;

  let localList: any[] = [];
  try {
    localList = JSON.parse(raw);
  } catch {
    localStorage.removeItem('bpg_user_addresses');
    return existing;
  }

  if (!Array.isArray(localList) || localList.length === 0) {
    localStorage.removeItem('bpg_user_addresses');
    return existing;
  }

  // Only migrate if DB is empty
  if (existing.length === 0) {
    for (const addr of localList) {
      await createUserAddress(user, {
        type: addr.type || 'HOME',
        name: addr.name || user.name || 'Customer',
        phone: addr.phone || user.phone || '',
        alternatePhone: addr.alternatePhone || '',
        address: addr.address || '',
        city: addr.city || 'Chennai',
        pincode: String(addr.pincode || ''),
        isDefault: false,
      });
    }
  }

  localStorage.removeItem('bpg_user_addresses');
  return fetchUserAddresses(user);
}
