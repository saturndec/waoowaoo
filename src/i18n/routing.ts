import { defineRouting } from 'next-intl/routing';

export const locales = ['vi', 'zh', 'en'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'vi';

export const routing = defineRouting({
    // Tất cả ngôn ngữ được hỗ trợ
    locales,

    // Ngôn ngữ mặc định
    defaultLocale,

    // Chiến lược URL: luôn hiển thị tiền tố ngôn ngữ
    localePrefix: 'always'
});
