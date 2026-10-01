import sharp from 'sharp';

export interface OptimizedMedia {
  buffer: Buffer;
  mimeType: string;
  ext: string;
  originalSize: number;
  optimizedSize: number;
  savingsPercent: number;
}

/**
 * Optimizes uploaded images and PDFs:
 * - Images (JPEG, PNG, WebP): Auto-orients EXIF, caps max dimension to 1600px, converts to 82% quality WebP.
 * - PDFs: Compresses object streams and metadata structures using pdf-lib.
 * - Fallback: Gracefully retains original buffer if processing fails or if original is already smaller.
 */
export async function optimizeUploadMedia(
  inputBuffer: Buffer,
  kind: 'jpeg' | 'png' | 'webp' | 'gif' | 'pdf'
): Promise<OptimizedMedia> {
  const originalSize = inputBuffer.length;

  if (kind === 'jpeg' || kind === 'png' || kind === 'webp') {
    try {
      const optimized = await sharp(inputBuffer)
        .rotate() // Auto-orient mobile phone photos
        .resize({
          width: 1600,
          height: 1600,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: 82, effort: 4 })
        .toBuffer();

      // Ensure we only use the optimized version if it actually saved bytes
      if (optimized.length < originalSize) {
        return {
          buffer: optimized,
          mimeType: 'image/webp',
          ext: 'webp',
          originalSize,
          optimizedSize: optimized.length,
          savingsPercent: Math.round(((originalSize - optimized.length) / originalSize) * 100),
        };
      }
    } catch (err) {
      console.warn('[mediaOptimizer] Image compression failed, falling back to original:', err);
    }
  }

  if (kind === 'pdf') {
    try {
      const { PDFDocument } = await import('pdf-lib');
      const pdfDoc = await PDFDocument.load(inputBuffer, { ignoreEncryption: true });
      const optimizedBytes = await pdfDoc.save({ useObjectStreams: true });
      if (optimizedBytes.length < originalSize) {
        const optimizedBuffer = Buffer.from(optimizedBytes);
        return {
          buffer: optimizedBuffer,
          mimeType: 'application/pdf',
          ext: 'pdf',
          originalSize,
          optimizedSize: optimizedBuffer.length,
          savingsPercent: Math.round(((originalSize - optimizedBuffer.length) / originalSize) * 100),
        };
      }
    } catch (err) {
      console.warn('[mediaOptimizer] PDF optimization failed, falling back to original:', err);
    }
  }

  const ext = kind === 'jpeg' ? 'jpg' : kind;
  const mimeType = kind === 'pdf' ? 'application/pdf' : `image/${kind}`;

  return {
    buffer: inputBuffer,
    mimeType,
    ext,
    originalSize,
    optimizedSize: originalSize,
    savingsPercent: 0,
  };
}
