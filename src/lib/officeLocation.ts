/** Official office / dispatch location — shared across contact, footer, maps */

export const OFFICE_COMPANY_NAME = 'BLESSING PATHWAY EDUCATION (OPC) PRIVATE LIMITED';

export const OFFICE_ADDRESS_LINES = [
  OFFICE_COMPANY_NAME,
  'No.12, Ganesh Apartment, Trust Square St, Nammalwarpet, Ayanavaram, Chennai, Tamil Nadu — 600012',
] as const;

export const OFFICE_ADDRESS_TEXT = OFFICE_ADDRESS_LINES.join('\n');

/** Google Plus Code — exact pin for Maps */
export const OFFICE_PLUS_CODE = '36WR+8P Chennai, Tamil Nadu';

const plusCodeQuery = encodeURIComponent(OFFICE_PLUS_CODE);

export const OFFICE_MAPS_SEARCH_URL = `https://www.google.com/maps/search/?api=1&query=${plusCodeQuery}`;

export const OFFICE_MAPS_EMBED_URL = `https://maps.google.com/maps?q=${plusCodeQuery}&z=17&ie=UTF8&iwloc=&output=embed`;
