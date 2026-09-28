export type ProductMediumType = 'Both' | 'Tamil' | 'English';

/**
 * Normalizes any language string into one of three canonical types:
 * - 'Both' (Both Tamil and English available — student chooses)
 * - 'Tamil' (Tamil Medium only — single medium)
 * - 'English' (English Medium only — single medium)
 */
export function normalizeProductMedium(rawLang?: string | null): ProductMediumType {
  if (!rawLang) return 'Both';
  const l = String(rawLang).trim().toLowerCase();

  const hasTamil = l.includes('tamil') || l.includes('தமிழ்');
  const hasEnglish = l.includes('english') || l.includes('eng') || l.includes('ஆங்கில');

  if (hasTamil && hasEnglish) {
    return 'Both';
  }
  if (l === 'both' || l.includes('both')) {
    return 'Both';
  }
  if (hasTamil) {
    return 'Tamil';
  }
  if (hasEnglish) {
    return 'English';
  }
  return 'Both';
}

/**
 * Returns true ONLY if the product is bilingual (student must/can choose between Tamil and English).
 * Returns false if the product is English-only or Tamil-only.
 */
export function isProductMultiMedium(rawLang?: string | null): boolean {
  return normalizeProductMedium(rawLang) === 'Both';
}

export interface ProductMediumBadgeInfo {
  type: ProductMediumType;
  shortBadge: string;
  fullLabel: string;
  tamilLabel: string;
  pillClasses: string;
  storeBadgeClasses: string;
}

export function getProductMediumBadge(rawLang?: string | null): ProductMediumBadgeInfo {
  const type = normalizeProductMedium(rawLang);
  switch (type) {
    case 'English':
      return {
        type: 'English',
        shortBadge: '📗 English Med',
        fullLabel: 'English Medium Only',
        tamilLabel: 'ஆங்கில வழி',
        pillClasses: 'bg-emerald-100 text-emerald-900 border border-emerald-200',
        storeBadgeClasses: 'bg-emerald-50 text-emerald-900 border border-emerald-200',
      };
    case 'Tamil':
      return {
        type: 'Tamil',
        shortBadge: '📘 தமிழ் வழி',
        fullLabel: 'Tamil Medium Only',
        tamilLabel: 'தமிழ் வழி',
        pillClasses: 'bg-amber-100 text-amber-900 border border-amber-200',
        storeBadgeClasses: 'bg-amber-50 text-amber-900 border border-amber-200',
      };
    case 'Both':
    default:
      return {
        type: 'Both',
        shortBadge: '🌐 Tamil & Eng',
        fullLabel: 'Tamil & English Edition',
        tamilLabel: 'தமிழ் & ஆங்கில வழி',
        pillClasses: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
        storeBadgeClasses: 'bg-indigo-50 text-indigo-900 border border-indigo-200',
      };
  }
}

/**
 * Resolves the medium string to record with the cart item.
 * For single-medium books, always returns the correct canonical medium name ('English Medium' or 'Tamil Medium').
 */
export function resolveCartItemMedium(rawLang?: string | null, selectedMedium?: string | null): string {
  const type = normalizeProductMedium(rawLang);
  if (type === 'English') return 'English Medium';
  if (type === 'Tamil') return 'Tamil Medium';
  if (selectedMedium && String(selectedMedium).trim()) {
    const s = String(selectedMedium).trim().toLowerCase();
    if (s.includes('english')) return 'English Medium';
    if (s.includes('tamil')) return 'Tamil Medium';
    return String(selectedMedium).trim();
  }
  return 'Tamil Medium';
}
