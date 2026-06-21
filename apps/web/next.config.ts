import type { NextConfig } from 'next';
const config: NextConfig = {
  // Prevent bundling — load from node_modules at runtime (required for Prisma WASM adapter)
  serverExternalPackages: ['@prisma/client', '@prisma/adapter-pg', 'pg'],
  // Transpile workspace TypeScript packages that point to source files
  transpilePackages: ['@cargo-sentinel/ui'],
};
export default config;
