import { defineRouting } from 'next-intl/routing';

export const locales = ['zh', 'en', 'vi'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'vi';

export const routing = defineRouting({
    // 支持的所有语言
    locales,

    // 默认语言
    defaultLocale,

    // URL 路径策略: 始终显示语言前缀
    localePrefix: 'always'
});
