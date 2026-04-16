/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Tree-shake barrel exports from large icon/component libraries
    optimizePackageImports: ['lucide-react', 'recharts', '@tiptap/react', '@tiptap/starter-kit'],
  },
};

export default nextConfig;
