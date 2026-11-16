import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// Production builds must know their public URL and a privacy contact (see README).
if (!isDev) {
  const missing = [
    !process.env.NEXT_PUBLIC_SITE_URL && !process.env.VERCEL_PROJECT_PRODUCTION_URL && "NEXT_PUBLIC_SITE_URL",
    !process.env.NEXT_PUBLIC_CONTACT_EMAIL && "NEXT_PUBLIC_CONTACT_EMAIL",
  ].filter(Boolean);
  if (missing.length) throw new Error(`Missing required env for production build: ${missing.join(", ")}`);
}

// Static pages can't carry per-request nonces, so inline scripts/styles Next emits are allowed.
// Razorpay Checkout (features/payments): its script, its modal (an iframe on api.razorpay.com) and its calls.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://checkout.razorpay.com${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.razorpay.com",
  "font-src 'self'",
  "frame-src https://api.razorpay.com https://checkout.razorpay.com",
  `connect-src 'self' https://api.razorpay.com https://lumberjack.razorpay.com${isDev ? " ws:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

// The private app (src/middleware.ts) and the auth pages stay out of search; marketing and policy pages are indexable.
const noindex = ["/decide/:path*", "/api/:path*", "/login", "/signup", "/account"].map((source) => ({
  source,
  headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
}));

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The build-time catalog snapshot (prisma/snapshot.ts) ships with every server route; Ask Seatora's skills (read
  // from disk, features/ask/skills.ts) with its chat route.
  outputFileTracingIncludes: { "/**": ["./.snapshot/catalog.json.gz"], "/api/ask/chat": ["./src/features/ask/skills/*.md"] },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }, ...noindex];
  },
};

export default nextConfig;
