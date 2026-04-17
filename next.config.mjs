/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Tree-shake barrel exports from large icon/component libraries
    optimizePackageImports: ['recharts', '@tiptap/react', '@tiptap/starter-kit'],
    // Required for @sparticuz/chromium to work on Vercel serverless
    serverComponentsExternalPackages: ['@sparticuz/chromium', 'puppeteer-core'],
  },
};

export default nextConfig;
