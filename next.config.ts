import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  compress: true,
  poweredByHeader: false,

  turbopack: {
    root: path.resolve(__dirname),
  },

  experimental: {
    optimizePackageImports: ["lucide-react", "framer-motion"],
  },

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 86400,
  },

  async headers() {
    const isDev = process.env.NODE_ENV !== "production";
    const scriptSrc = [
      "script-src 'self' 'unsafe-inline'",
      isDev ? "'unsafe-eval'" : "",
      "https://accounts.google.com",
      "https://apis.google.com",
      "https://www.gstatic.com",
      "https://checkout.razorpay.com",
      "https://cdn.razorpay.com",
      "https://static.cloudflareinsights.com",
    ]
      .filter(Boolean)
      .join(" ");
    const scriptSrcElem = [
      "script-src-elem 'self' 'unsafe-inline'",
      "https://accounts.google.com",
      "https://apis.google.com",
      "https://www.gstatic.com",
      "https://checkout.razorpay.com",
      "https://cdn.razorpay.com",
      "https://static.cloudflareinsights.com",
    ].join(" ");

    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Cross-Origin-Opener-Policy",
            value: "unsafe-none",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              scriptSrc,
              scriptSrcElem,
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com",
              "font-src 'self' https://fonts.gstatic.com data:",
              "img-src 'self' data: blob: https://res.cloudinary.com https://images.unsplash.com https://*.googleusercontent.com https://*.gstatic.com https://*.razorpay.com",
              "connect-src 'self' https://accounts.google.com https://oauth2.googleapis.com https://www.googleapis.com https://stcourier.com https://erpstcourier.com https://api.razorpay.com https://lumberjack.razorpay.com https://lumberjack-cx.razorpay.com https://checkout.razorpay.com https://cdn.razorpay.com",
              "frame-src 'self' https://accounts.google.com https://checkout.razorpay.com https://api.razorpay.com https://maps.google.com https://www.google.com",
              "worker-src 'self' blob:",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
              "upgrade-insecure-requests",
            ].join("; "),
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(self)",
          },
        ],
      },

      // Browsing Pages — Safe Edge & Fast Browser Caching for Instant Browsing
      ...[
        "/",
        "/products",
        "/products/:path*",
        "/search",
        "/help",
        "/privacy-policy",
        "/shipping-policy",
        "/terms-of-service",
      ].map((browsePattern) => ({
        source: browsePattern,
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate, s-maxage=60, stale-while-revalidate=120",
          },
          {
            key: "CDN-Cache-Control",
            value: "max-age=60, stale-while-revalidate=120",
          },
          {
            key: "Cloudflare-CDN-Cache-Control",
            value: "max-age=60, stale-while-revalidate=120",
          },
        ],
      })),

      // VPS DB Real-Time Pages & Dynamic APIs — Strictly NEVER Cached (Always Hit VPS & Database Direct)
      ...[
        "/admin",
        "/admin/:path*",
        "/checkout",
        "/checkout/:path*",
        "/cart",
        "/cart/:path*",
        "/orders",
        "/orders/:path*",
        "/track",
        "/track/:path*",
        "/payment",
        "/payment/:path*",
        "/profile",
        "/profile/:path*",
        "/wishlist",
        "/wishlist/:path*",
        "/ops",
        "/ops/:path*",
        "/support",
        "/support/:path*",
        "/api/orders",
        "/api/orders/:path*",
        "/api/track",
        "/api/track/:path*",
        "/api/stock",
        "/api/stock/:path*",
        "/api/admin",
        "/api/admin/:path*",
        "/api/checkout",
        "/api/checkout/:path*",
        "/api/razorpay",
        "/api/razorpay/:path*",
        "/api/cart",
        "/api/cart/:path*",
        "/api/auth",
        "/api/auth/:path*",
        "/api/addresses",
        "/api/addresses/:path*",
        "/api/courier",
        "/api/courier/:path*",
        "/api/user",
        "/api/user/:path*",
        "/api/contact",
        "/api/health",
        "/api/notifications",
        "/api/notifications/:path*",
        "/api/coupons",
        "/api/coupons/:path*",
        "/api/ops",
        "/api/ops/:path*",
      ].map((pattern) => ({
        source: pattern,
        headers: [
          {
            key: "Cache-Control",
            value: "private, no-cache, no-store, max-age=0, must-revalidate",
          },
          {
            key: "CDN-Cache-Control",
            value: "no-store",
          },
          {
            key: "Cloudflare-CDN-Cache-Control",
            value: "no-store",
          },
          {
            key: "Pragma",
            value: "no-cache",
          },
        ],
      })),
      // Real-Time SSE Streams — Prevent Proxy Buffering & Stale Sockets
      ...[
        "/api/stock/stream",
        "/api/orders/stream",
        "/api/support/stream",
      ].map((ssePattern) => ({
        source: ssePattern,
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-transform",
          },
          {
            key: "X-Accel-Buffering",
            value: "no",
          },
          {
            key: "Connection",
            value: "keep-alive",
          },
        ],
      })),
    ];
  },
};

export default nextConfig;
