import QRCode from 'qrcode';

/**
 * Generates a clean, vector SVG QR code string.
 * Completely offline and self-contained — zero network dependency.
 * Inlines directly into HTML as <svg>...</svg> so it CANNOT fail or show a broken image icon.
 */
export async function generateQrSvg(
  text: string,
  options: { size?: number; margin?: number } = {}
): Promise<string> {
  try {
    const rawSvg = await QRCode.toString(text || 'https://blessingpowerguide.com/track', {
      type: 'svg',
      margin: options.margin ?? 0,
      width: options.size ?? 120,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    });
    return rawSvg;
  } catch (err) {
    console.error('[QRCode] Failed to generate SVG QR code:', err);
    return '';
  }
}

/**
 * Generates a Data URL (base64 PNG) QR code string as fallback.
 */
export async function generateQrDataUrl(
  text: string,
  options: { size?: number; margin?: number } = {}
): Promise<string> {
  try {
    const dataUrl = await QRCode.toDataURL(text || 'https://blessingpowerguide.com/track', {
      margin: options.margin ?? 0,
      width: options.size ?? 140,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    });
    return dataUrl;
  } catch (err) {
    console.error('[QRCode] Failed to generate DataURL QR code:', err);
    return '';
  }
}
