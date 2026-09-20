import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const MIME_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path: pathSegments } = await context.params;
    if (!pathSegments || pathSegments.length === 0) {
      return new NextResponse('Not Found', { status: 404 });
    }

    const baseUploadDir = path.resolve(process.cwd(), 'public', 'uploads');
    const safeSubPath = path.join(...pathSegments);
    const targetFilePath = path.resolve(baseUploadDir, safeSubPath);

    // Guard against directory traversal attacks (strict boundary check)
    const isUnderBaseDir =
      targetFilePath === baseUploadDir || targetFilePath.startsWith(baseUploadDir + path.sep);
    if (!isUnderBaseDir) {
      return new NextResponse('Forbidden', { status: 403 });
    }

    // Only serve explicitly whitelisted safe media extensions (strictly reject SVGs, scripts, executables, etc.)
    const ext = path.extname(targetFilePath).toLowerCase();
    const contentType = MIME_TYPES[ext];
    if (!contentType) {
      return new NextResponse('Forbidden file type', { status: 403 });
    }

    const isPdf = ext === '.pdf';

    // Anti-Hotlinking & Content Protection for proprietary sample chapter PDFs
    const referer = _request.headers.get('referer');
    if (referer && isPdf) {
      try {
        const refUrl = new URL(referer);
        const isLocal = refUrl.hostname === 'localhost' || refUrl.hostname === '127.0.0.1';
        const isOwnDomain = refUrl.hostname.includes('blessingpowerguide.in');
        if (!isLocal && !isOwnDomain) {
          return new NextResponse('Hotlinking forbidden', { status: 403 });
        }
      } catch {}
    }

    try {
      const stats = await fs.promises.stat(targetFilePath);
      if (!stats.isFile()) {
        return new NextResponse('Not Found', { status: 404 });
      }

      const fileBuffer = await fs.promises.readFile(targetFilePath);

      const headers: Record<string, string> = {
        'Content-Type': contentType,
        'Content-Length': stats.size.toString(),
        'Cache-Control': isPdf ? 'public, max-age=86400' : 'public, max-age=31536000, immutable',
        'Content-Disposition': `inline; filename="${path.basename(targetFilePath)}"`,
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'SAMEORIGIN',
      };

      if (isPdf) {
        headers['X-Robots-Tag'] = 'noindex, nofollow';
      }

      return new NextResponse(fileBuffer, {
        status: 200,
        headers,
      });
    } catch {
      return new NextResponse('File Not Found', { status: 404 });
    }
  } catch (err: any) {
    console.error('[Upload Static Serve Error]:', err);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
