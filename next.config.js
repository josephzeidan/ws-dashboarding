/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Enables instrumentation.ts (boots the background poller on server start).
    instrumentationHook: true,
  },
}
module.exports = nextConfig
