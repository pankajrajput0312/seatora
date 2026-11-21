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
// Razorpay Checkout (features/payments): its script, its modal (an iframe on api.razorpay.com) and its calls. Phone
// sign-in (features/auth/components/phone-login.tsx): Firebase Auth's calls, its reCAPTCHA and its auth iframe.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://checkout.razorpay.com https://www.google.com https://www.gstatic.com https://apis.google.com${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.razorpay.com https://www.gstatic.com",
  "font-src 'self'",
  "frame-src https://api.razorpay.com https://checkout.razorpay.com https://www.google.com https://*.firebaseapp.com",
  `connect-src 'self' https://api.razorpay.com https://lumberjack.razorpay.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.google.com${isDev ? " ws:" : ""}`,
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
  // The FAQ is a section of the home page; a typed /residents opens the public residents list. Decide's Schedule (its nav name) is the Counselling page: a typed
  // /decide/schedule opens it, never a not-found (its query, ?exam= too, goes with it).
  async redirects() {
    return [
      { source: "/faq", destination: "/#faq", permanent: true },
      { source: "/residents", destination: "/neet-pg/residents", permanent: true },
      { source: "/decide/schedule", destination: "/decide/counselling", permanent: false },
      // Hidden (21 Nov 2026, owner; src/features/exams/exam.ts hiddenPages): delete both to bring it back.
      { source: "/decide/rank-scan", destination: "/decide", permanent: false },
    ];
  },
};

export default nextConfig;
