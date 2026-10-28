import { NextResponse } from 'next/server';
import { getActiveStorefrontContext } from '@/lib/cofounder/themeEngine';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const context = await getActiveStorefrontContext();
    return NextResponse.json(context, {
      status: 200,
      headers: {
        'Cache-Control': 'public, s-maxage=5, stale-while-revalidate=10',
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        theme: {
          id: 'default',
          name: 'Standard Academic Excellence',
          greeting: 'Welcome to Blessing Power Guide',
          accentColor: '#f59e0b',
          secondaryColor: '#0ea5e9',
          ambientEffect: 'none',
          isActive: true,
        },
        announcement: null,
        timestamp: Date.now(),
        error: err?.message,
      },
      { status: 200 }
    );
  }
}
