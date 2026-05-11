import type { NextConfig } from 'next';
import withPWA from 'next-pwa';

const nextConfig: NextConfig = {
  turbopack: {
    // Pin root to this project directory to avoid reading parent dirs with multiple lockfiles
    root: __dirname,
  },
};

export default withPWA({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  // @ts-expect-error next-pwa ships types compiled against an older Next NextConfig
})(nextConfig);
