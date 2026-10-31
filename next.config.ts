import path from "node:path";
import type { NextConfig } from "next";
import pkg from "./package.json";

// MediaPipe loads its loader script and wasm from /wasm and the model from
// /models, so everything stays on this origin. 'wasm-unsafe-eval' lets the
// wasm compile, and Next's inline bootstrap scripts need 'unsafe-inline'.
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const immutable = [
  { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: {
    root: path.resolve(__dirname),
  },
  env: {
    NEXT_PUBLIC_MANUS_VERSION: pkg.version,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(), geolocation=()",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
        ],
      },
      { source: "/wasm/:path*", headers: immutable },
      { source: "/models/:path*", headers: immutable },
      { source: "/samples/:path*", headers: immutable },
      { source: "/fonts/:path*", headers: immutable },
    ];
  },
};

export default nextConfig;
