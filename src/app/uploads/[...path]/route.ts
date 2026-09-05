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
  '.svg': 'image/svg+xml',
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

    // Guard against directory traversal attacks
    if (!targetFilePath.startsWith(baseUploadDir)) {
      return new NextResponse('Forbidden', { status: 403 });
    }

    try {
      const stats = await fs.promises.stat(targetFilePath);
      if (!stats.isFile()) {
        return new NextResponse('Not Found', { status: 404 });
      }

      const ext = path.extname(targetFilePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      const fileBuffer = await fs.promises.readFile(targetFilePath);

      return new NextResponse(fileBuffer, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Content-Length': stats.size.toString(),
          'Cache-Control': 'public, max-age=31536000, immutable',
          'Content-Disposition': `inline; filename="${path.basename(targetFilePath)}"`,
        },
      });
    } catch {
      return new NextResponse('File Not Found', { status: 404 });
    }
  } catch (err: any) {
    console.error('[Upload Static Serve Error]:', err);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
