import path from 'node:path';
import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n.ts');
const projectRoot = path.resolve(__dirname);

const nextConfig: NextConfig = {
  // 已删除 ignoreBuildErrors / ignoreDuringBuilds，构建保持严格门禁
  // Next 15 的 allowedDevOrigins 是顶层配置，不属于 experimental
  allowedDevOrigins: [
    'http://192.168.31.218:3000',
    'http://192.168.31.*:3000',
  ],
  // 强制限定到当前仓库，避免被上级目录 lockfile 误判 workspace root
  turbopack: {
    root: projectRoot,
  },
  outputFileTracingRoot: projectRoot,
};

export default withNextIntl(nextConfig);
