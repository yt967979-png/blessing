/** Shop invoice / GST config — set in env for production. */

export function getShopGstin(): string {
  return String(process.env.SHOP_GSTIN || process.env.NEXT_PUBLIC_SHOP_GSTIN || '').trim();
}

export function getShopLegalName(): string {
  return String(process.env.SHOP_LEGAL_NAME || 'Blessing Pathway Education').trim();
}

export function getShopInvoiceAddress(): string {
  return String(
    process.env.SHOP_INVOICE_ADDRESS ||
      'Chennai, Tamil Nadu, India'
  ).trim();
}

/** Display GSTIN or placeholder note when unset */
export function formatGstinLine(): string {
  const gstin = getShopGstin();
  if (gstin) return `GSTIN: ${gstin}`;
  return 'GSTIN: Update SHOP_GSTIN in env';
}
