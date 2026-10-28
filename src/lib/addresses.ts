import type { UserData } from '@/context/StoreContext';
import { authHeaders } from '@/lib/clientAuth';
import { isValidMobileNumber, normalizeRequiredAlternateMobile, isValidEmailFormat } from '@/lib/authValidation';

export const TAMIL_NADU_DISTRICTS = [
  'Ariyalur',
  'Chengalpattu',
  'Chennai',
  'Coimbatore',
  'Cuddalore',
  'Dharmapuri',
  'Dindigul',
  'Erode',
  'Kallakurichi',
  'Kanchipuram',
  'Kanyakumari',
  'Karur',
  'Krishnagiri',
  'Madurai',
  'Mayiladuthurai',
  'Nagapattinam',
  'Namakkal',
  'Nilgiris',
  'Perambalur',
  'Pudukkottai',
  'Ramanathapuram',
  'Ranipet',
  'Salem',
  'Sivaganga',
  'Tenkasi',
  'Thanjavur',
  'Theni',
  'Thoothukudi (Tuticorin)',
  'Tiruchirappalli (Trichy)',
  'Tirunelveli',
  'Tirupathur',
  'Tiruppur',
  'Tiruvallur',
  'Tiruvannamalai',
  'Tiruvarur',
  'Vellore',
  'Viluppuram',
  'Virudhunagar',
] as const;

export const FLOOR_OPTIONS = [
  'Independent House (தனி வீடு / Ground Floor)',
  'Ground Floor (தரைத்தளம்)',
  '1st Floor (முதல் தளம்)',
  '2nd Floor (இரண்டாம் தளம்)',
  '3rd Floor (மூன்றாம் தளம்)',
] as const;

export interface SavedAddress {
  id: string;
  type: string;

  // ── 14 Mandatory Fields (*) ──
  studentName?: string; // 1. Student Full Name *
  parentName?: string; // 2. Parent / Guardian Name *
  phone: string; // 3. Mobile Number *
  alternatePhone?: string; // 4. Alternate Mobile Number *
  email?: string; // 5. Primary Email ID *
  doorNo?: string; // 6. Door / House / Flat Number *
  floorNo?: string; // 7. Floor Number / Floor Details * (e.g. Independent House)
  streetName?: string; // 8. Street / Road Name *
  areaLocality?: string; // 9. Area / Locality *
  townCity?: string; // 10. Village / Town / City *
  district?: string; // 11. District *
  state?: string; // 12. State *
  pincode: string; // 13. PIN Code *
  landmark?: string; // 14. Nearby Landmark *

  // ── 5 Optional Fields ──
  whatsappNumber?: string; // 1. WhatsApp Number (optional)
  alternateEmail?: string; // 2. Alternate Email ID (optional)
  buildingName?: string; // 3. Building / Apartment Name (optional)
  taluk?: string; // 4. Taluk (optional)
  deliveryInstructions?: string; // 5. Delivery Instructions (optional)

  // Backward-compatibility aliases
  name: string; // maps to studentName
  address: string; // composite formatted address
  town?: string; // maps to townCity
  city: string; // maps to district / townCity
  isDefault?: boolean;
}

export interface AddressCompleteness {
  isComplete: boolean;
  missingFields: string[];
}

/**
 * Validates that an address satisfies ALL 14 mandatory fields of the new format.
 * If any of the 14 mandatory fields are missing or invalid, checkout is strictly blocked.
 */
export function checkAddressCompleteness(addr: Partial<SavedAddress> | null | undefined): AddressCompleteness {
  if (!addr) {
    return { isComplete: false, missingFields: ['Address details are missing'] };
  }

  const missing: string[] = [];

  // 1. Student Full Name *
  const student = (addr.studentName || addr.name || '').trim();
  if (!student) missing.push('Student Full Name');

  // 2. Parent / Guardian Name *
  const parent = (addr.parentName || '').trim();
  if (!parent) missing.push('Parent / Guardian Name');

  // 3. Primary Mobile Number * (10 digits)
  const phone = (addr.phone || '').trim();
  if (!isValidMobileNumber(phone)) missing.push('10-digit Primary Mobile Number');

  // 4. Alternate Mobile Number * (10 digits, different from primary)
  const alt = (addr.alternatePhone || '').trim();
  if (!normalizeRequiredAlternateMobile(alt, phone).ok) {
    missing.push('Different Alternate Mobile Number');
  }

  // 5. Primary Email ID *
  const email = (addr.email || '').trim();
  if (!email || !isValidEmailFormat(email)) missing.push('Primary Email ID');

  // 6. Door / House / Flat Number *
  const door = (addr.doorNo || '').trim();
  if (!door) missing.push('Door / Flat Number');

  // 7. Floor Details * (or Independent House)
  const floor = (addr.floorNo || '').trim();
  if (!floor) missing.push('Floor Details (or Independent House)');

  // 8. Street / Road Name *
  const street = (addr.streetName || addr.address || '').trim();
  if (!street) missing.push('Street / Road Name');

  // 9. Area / Locality *
  const area = (addr.areaLocality || '').trim();
  if (!area) missing.push('Area / Locality');

  // 10. Village / Town / City *
  const town = (addr.townCity || addr.town || addr.city || '').trim();
  if (!town) missing.push('Village / Town / City');

  // 11. District *
  const district = (addr.district || addr.city || '').trim();
  if (!district) missing.push('District');

  // 12. State *
  const state = (addr.state || '').trim();
  if (!state) missing.push('State');

  // 13. PIN Code * (6 digits)
  const pin = String(addr.pincode || '').replace(/\D/g, '');
  if (pin.length !== 6) missing.push('6-digit PIN Code');

  // 14. Nearby Landmark *
  const landmark = (addr.landmark || '').trim();
  if (!landmark) missing.push('Nearby Landmark');

  return {
    isComplete: missing.length === 0,
    missingFields: missing,
  };
}

/**
 * Formats a clean, professional ST Courier delivery address line from all parts.
 * Example: "Door No. 14/B, Independent House (தனி வீடு), Sri Krishna Apts, Anna Street, Gandhi Nagar, Melmaruvathur Town"
 */
export function formatFullAddressLine(parts: {
  doorNo?: string | null;
  floorNo?: string | null;
  buildingName?: string | null;
  streetName?: string | null;
  address?: string | null;
  areaLocality?: string | null;
  townCity?: string | null;
  town?: string | null;
  taluk?: string | null;
  landmark?: string | null;
}): string {
  const segments: string[] = [];
  const door = (parts.doorNo || '').trim();
  const floor = (parts.floorNo || '').trim();
  const building = (parts.buildingName || '').trim();
  const street = (parts.streetName || parts.address || '').trim();
  const area = (parts.areaLocality || '').trim();
  const town = (parts.townCity || parts.town || '').trim();
  const taluk = (parts.taluk || '').trim();

  if (door) {
    if (/^(door|d\.?\s*no|flat|plot|house|no\.?|#)/i.test(door)) {
      segments.push(door);
    } else {
      segments.push(`Door No. ${door}`);
    }
  }

  if (floor) {
    if (/independent|தனி வீடு|ground|basement/i.test(floor)) {
      segments.push(floor);
    } else if (/floor|flr/i.test(floor)) {
      segments.push(floor);
    } else {
      segments.push(`${floor} Floor`);
    }
  }

  if (building) {
    segments.push(building);
  }

  if (street) {
    segments.push(street);
  }

  if (area && !street.toLowerCase().includes(area.toLowerCase())) {
    segments.push(area);
  }

  if (town && !street.toLowerCase().includes(town.toLowerCase()) && !area.toLowerCase().includes(town.toLowerCase())) {
    segments.push(town);
  }

  if (taluk && !town.toLowerCase().includes(taluk.toLowerCase())) {
    segments.push(taluk.toLowerCase().includes('taluk') ? taluk : `${taluk} Taluk`);
  }

  return segments.join(', ');
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
        name: addr.name || addr.studentName || user.name || 'Student',
        studentName: addr.studentName || addr.name || user.name || 'Student',
        parentName: addr.parentName || '',
        phone: addr.phone || user.phone || '',
        alternatePhone: addr.alternatePhone || '',
        email: addr.email || user.email || '',
        doorNo: addr.doorNo || '',
        floorNo: addr.floorNo || 'Independent House (தனி வீடு / Ground Floor)',
        streetName: addr.streetName || addr.address || '',
        address: addr.address || '',
        areaLocality: addr.areaLocality || '',
        townCity: addr.townCity || addr.town || addr.city || '',
        district: addr.district || addr.city || 'Chennai',
        city: addr.city || 'Chennai',
        state: 'Tamil Nadu',
        pincode: String(addr.pincode || ''),
        landmark: addr.landmark || '',
        isDefault: false,
      });
    }
  }

  localStorage.removeItem('bpg_user_addresses');
  return fetchUserAddresses(user);
}
