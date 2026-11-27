import type { NextConfig } from "next";

// 本番は静的ファイルとして出力し（out/）、Cloudflare Workers の静的アセットとして配信する。
// 開発時（next dev）は /api/* を wrangler dev（http://localhost:8787）へ転送する。
const isDev = process.env.NODE_ENV === "development";

const nextConfig: NextConfig = isDev
  ? { rewrites: async () => [{ source: "/api/:path*", destination: `${process.env.API_ORIGIN ?? "http://localhost:8787"}/api/:path*` }] }
  : { output: "export", images: { unoptimized: true } };

export default nextConfig;
