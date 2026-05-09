import type { NextConfig } from 'next';
// @ts-expect-error — next-pwa has no types
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
})(nextConfig);
