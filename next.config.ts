import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  compress: true,
  poweredByHeader: false,

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
    ].join(" ");

    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          // MUST be explicit unsafe-none — omitting it lets Chrome enforce default COOP
          // which blocks Google Sign-In FedCM postMessage calls
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
      {
        source: "/_next/static/(.*)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/api/products",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
          },
        ],
      },
      {
        source: "/api/products/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
          },
        ],
      },
      {
        source: "/track",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, s-maxage=30, stale-while-revalidate=60",
          },
        ],
      },
      {
        source: "/",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
          },
        ],
      },
      {
        source: "/_next/image(.*)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
