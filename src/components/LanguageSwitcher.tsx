'use client'

import { useParams } from 'next/navigation'
import { usePathname, useRouter } from 'next/navigation'
import { type Locale } from '@/i18n/routing'

const languages = {
    zh: { name: '中文', flag: '🇨🇳' },
    en: { name: 'English', flag: '🇬🇧' },
} as const

export default function LanguageSwitcher() {
    const router = useRouter()
    const pathname = usePathname()
    const params = useParams()
    const currentLocale = params.locale as Locale

    const switchLanguage = (newLocale: Locale) => {
        if (newLocale === currentLocale) return

        // 替换路径中的语言前缀
        const newPathname = pathname.replace(`/${currentLocale}`, `/${newLocale}`)
        router.push(newPathname)
    }

    return (
        <div className="relative inline-block">
            <select
                value={currentLocale}
                onChange={(e) => switchLanguage(e.target.value as Locale)}
                className="appearance-none bg-white border border-gray-200 rounded-lg px-3 py-2 pr-8 text-sm text-gray-700 hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors cursor-pointer"
                aria-label="Select language"
            >
                {Object.entries(languages).map(([locale, { name }]) => (
                    <option key={locale} value={locale}>
                        {name}
                    </option>
                ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </div>
        </div>
    )
}
