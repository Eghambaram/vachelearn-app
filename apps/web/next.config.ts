import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Workspace packages ship TypeScript source (D-035); Next compiles them with the app.
  transpilePackages: ['@vachelearn/contracts'],
};

export default nextConfig;
