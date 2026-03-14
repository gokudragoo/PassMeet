import type { NextConfig } from "next";

function allowedImageHosts(): string[] {
  const hosts = new Set<string>([
    "images.unsplash.com",
    "gateway.pinata.cloud",
    "ipfs.io",
    "cloudflare-ipfs.com",
  ]);

  const gatewayUrl = process.env.NEXT_PUBLIC_GATEWAY_URL;
  if (gatewayUrl) {
    try {
      hosts.add(new URL(gatewayUrl).hostname);
    } catch {
      // ignore invalid URL
    }
  }

  return Array.from(hosts);
}

const nextConfig: NextConfig = {
  images: {
    remotePatterns: allowedImageHosts().map((hostname) => ({
      protocol: "https",
      hostname,
    })),
  },
} as NextConfig;

export default nextConfig;
