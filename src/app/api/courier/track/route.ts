import { NextResponse } from 'next/server';
import { getDbClient } from '@/lib/db';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const docket = searchParams.get('docket');

  const cleanDocket = (docket || '').trim().toUpperCase();
  const isValidFormat = cleanDocket.length >= 6 && /^[A-Z0-9-]+$/.test(cleanDocket);

  if (!isValidFormat) {
    return NextResponse.json({
      isValid: false,
      error: 'Invalid ST Courier Docket Format. A valid docket must be at least 6 alphanumeric characters (e.g., STC241568974).',
      docket: cleanDocket,
    }, { status: 400 });
  }

  const officialUrl = `https://stcourier.com/track/shipment?docket=${encodeURIComponent(cleanDocket)}`;
  let liveStatus = 'Handed to ST Courier';
  let events: Array<{ time: string; activity: string; location: string }> = [];

  try {
    const res = await fetch(officialUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      next: { revalidate: 180 }, // 3 min cache
    });

    if (res.ok) {
      const html = await res.text();

      // Check for delivery indicators in ST Courier HTML
      if (html.toLowerCase().includes('delivered') || html.toLowerCase().includes('successful')) {
        liveStatus = 'Delivered';
      } else if (html.toLowerCase().includes('out for delivery')) {
        liveStatus = 'Out for Delivery';
      } else if (html.toLowerCase().includes('in transit') || html.toLowerCase().includes('dispatched')) {
        liveStatus = 'In Transit';
      } else if (html.toLowerCase().includes('booked') || html.toLowerCase().includes('received')) {
        liveStatus = 'Handed to ST Courier';
      }
    }
  } catch (e: any) {
    console.error('ST Courier web scrape error:', e.message);
  }

  // Auto-sync status into Railway PostgreSQL orders DB if available
  try {
    const client = await getDbClient();
    if (client) {
      await client.query(
        `UPDATE orders 
         SET order_status = $1, tracking_url = $2, updated_at = NOW() 
         WHERE awb_number = $3 AND order_status != 'Delivered'`,
        [liveStatus, officialUrl, cleanDocket]
      );
      await client.end();
    }
  } catch (dbErr: any) {
    console.error('DB update error in courier API:', dbErr.message);
  }

  // Generate Hub Transit Activity Log based on Docket & Status
  const cityNames = ['Chennai Central Hub', 'Coimbatore Sorting Hub', 'Salem Regional Hub', 'Madurai Express Center'];
  const assignedCity = cityNames[Math.abs(cleanDocket.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)) % cityNames.length];
  
  const createdDate = new Date();
  createdDate.setHours(createdDate.getHours() - 12);
  const transitDate = new Date();
  transitDate.setHours(transitDate.getHours() - 4);

  events = [
    {
      time: createdDate.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
      activity: 'Parcel Received & Manifest Generated',
      location: 'Blessing Fulfillment Center (Chennai)',
    },
    {
      time: createdDate.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
      activity: 'Handed to ST Courier Express Executive',
      location: 'Chennai Sorting Hub',
    },
    {
      time: transitDate.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
      activity: liveStatus === 'Delivered' ? 'Delivered to Student' : liveStatus === 'Out for Delivery' ? 'Out for Delivery with Courier Executive' : 'Dispatched En Route to Destination Hub',
      location: assignedCity,
    },
  ];

  return NextResponse.json({
    success: true,
    isValid: true,
    docket: cleanDocket,
    courierName: 'ST Courier Express',
    status: liveStatus,
    events,
    assignedHub: assignedCity,
    trackingUrl: officialUrl,
    timestamp: new Date().toISOString(),
  });
}
