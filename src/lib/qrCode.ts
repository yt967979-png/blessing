import QRCode from 'qrcode';

/**
 * Generates a clean, vector SVG QR code string.
 * Completely offline and self-contained — zero network dependency.
 */
export async function generateQrSvg(text: string, options: { size?: number; margin?: number } = {}): Promise<string> {
  try {
    const svg = await QRCode.toString(text, {
      type: 'svg',
      margin: options.margin ?? 0,
      width: options.size ?? 120,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    });
    return svg;
  } catch (err) {
    console.error('[QRCode] Failed to generate SVG QR code:', err);
    return '';
  }
}

/**
 * Generates a Data URL (base64 PNG) QR code string for instant inline image rendering.
 * Completely offline — guaranteed to show in print windows immediately.
 */
export async function generateQrDataUrl(text: string, options: { size?: number; margin?: number } = {}): Promise<string> {
  try {
    const dataUrl = await QRCode.toDataURL(text, {
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
