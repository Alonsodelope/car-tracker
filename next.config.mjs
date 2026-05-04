/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.cars.com" },
      { protocol: "https", hostname: "**.autotrader.com" },
      { protocol: "https", hostname: "**.dealer.com" },
      { protocol: "https", hostname: "**.carfax.com" },
    ],
  },
  experimental: {
    serverComponentsExternalPackages: ["pg", "playwright"],
  },
};

export default nextConfig;
