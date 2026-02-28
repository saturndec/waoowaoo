import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n.ts');

const nextConfig: NextConfig = {
  // 已删除 ignoreBuildErrors / ignoreDuringBuilds，构建保持严格门禁
  // Next 15 的 allowedDevOrigins 是顶层配置，不属于 experimental
  allowedDevOrigins: [
    'http://192.168.31.218:3000',
    'http://192.168.31.*:3000',
  ],
  serverExternalPackages: [
    'bullmq',
    'ioredis',
    'mysql2',
    '@prisma/client',
    'prisma',
    'cos-nodejs-sdk-v5',
    'remotion',
    '@remotion/cli',
    '@remotion/player',
    'mammoth',
    'archiver',
    'jszip',
    'bcryptjs',
    'express',
  ],
};

export default withNextIntl(nextConfig);
