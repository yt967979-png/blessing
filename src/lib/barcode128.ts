/**
 * High-precision vector Code128 (Subset B) SVG barcode generator.
 * Produces pure vector monochrome SVG with crisp edges — perfect for 203dpi/300dpi thermal printers.
 * Zero external network dependencies.
 */

// Code 128 pattern table (Values 0-106)
const CODE128_PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213', // 0-9
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132', // 10-19
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211', // 20-29
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313', // 30-39
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331', // 40-49
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111', // 50-59
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214', // 60-69
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111', // 70-79
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141', // 80-89
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141', // 90-99
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112', // 100-106 (106 is STOP)
];

const START_CODE_B = 104;
const STOP_CODE = 106;

/**
 * Encodes an alphanumeric string into a Code 128 (Subset B) SVG string.
 */
export function generateCode128Svg(text: string, options: { height?: number; barWidth?: number; showText?: boolean } = {}): string {
  const cleanText = String(text || '').trim();
  if (!cleanText) return '';

  const height = options.height || 48;
  const barWidth = options.barWidth || 2;
  const showText = options.showText !== false;

  // Build character values (ASCII - 32)
  const values: number[] = [START_CODE_B];
  let checksum = START_CODE_B;

  for (let i = 0; i < cleanText.length; i++) {
    const code = cleanText.charCodeAt(i) - 32;
    const safeCode = code >= 0 && code <= 95 ? code : 0;
    values.push(safeCode);
    checksum += safeCode * (i + 1);
  }

  values.push(checksum % 103);
  values.push(STOP_CODE);

  // Convert pattern string into bar segments
  let x = 10; // Quiet zone left
  let rects = '';

  for (const val of values) {
    const pattern = CODE128_PATTERNS[val] || '';
    let isBar = true;
    for (let j = 0; j < pattern.length; j++) {
      const width = parseInt(pattern[j], 10) * barWidth;
      if (isBar) {
        rects += `<rect x="${x}" y="0" width="${width}" height="${height}" fill="#000000" />`;
      }
      x += width;
      isBar = !isBar;
    }
  }

  const totalWidth = x + 10; // Quiet zone right
  const svgHeight = showText ? height + 16 : height;

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${svgHeight}" width="${totalWidth}" height="${svgHeight}" style="display:block;margin:0 auto;max-width:100%;height:auto;">
  ${rects}
  ${showText ? `<text x="${totalWidth / 2}" y="${height + 13}" font-family="ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace" font-size="12" font-weight="bold" fill="#000000" text-anchor="middle" letter-spacing="1.5">${cleanText}</text>` : ''}
</svg>`.trim();
}
