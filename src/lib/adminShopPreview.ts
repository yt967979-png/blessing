/** Session flag so staff can browse the storefront without being bounced to /admin. */
export const ADMIN_SHOP_PREVIEW_KEY = 'bpg-admin-shop-preview';

export function enableAdminShopPreview(): void {
  try {
    sessionStorage.setItem(ADMIN_SHOP_PREVIEW_KEY, '1');
  } catch {
    /* private mode */
  }
}

export function disableAdminShopPreview(): void {
  try {
    sessionStorage.removeItem(ADMIN_SHOP_PREVIEW_KEY);
  } catch {
    /* ignore */
  }
}

export function isAdminShopPreview(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const q = new URLSearchParams(window.location.search);
    if (q.get('preview') === '1' || q.get('view') === 'shop') {
      sessionStorage.setItem(ADMIN_SHOP_PREVIEW_KEY, '1');
      return true;
    }
    return sessionStorage.getItem(ADMIN_SHOP_PREVIEW_KEY) === '1';
  } catch {
    return false;
  }
}
