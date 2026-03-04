'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { usePathname, useRouter } from 'next/navigation'
import { type Locale } from '@/i18n/routing'
import ConfirmDialog from './ConfirmDialog'
import { AppIcon } from '@/components/ui/icons'

const LANGUAGE_LABELS: Record<Locale, string> = {
    zh: '简体中文',
    en: 'English',
}

const SWITCH_CONFIRM_COPY: Record<Locale, { title: string; message: string; action: string; cancel: string; triggerLabel: string }> = {
    zh: {
        title: '切换语言？',
        message:
            '切换到 {targetLanguage} 后，不仅界面文字会改变，整条流程的提示词模板、剧本生成和任务输出语言也会同步切换。是否继续？',
        action: '确认切换',
        cancel: '取消',
        triggerLabel: '切换语言',
    },
    en: {
        title: 'Switch language?',
        message:
            'Switching to {targetLanguage} will update not only interface text, but also end-to-end prompt templates, script generation, and workflow output language. Continue?',
        action: 'Switch now',
        cancel: 'Cancel',
        triggerLabel: 'Switch language',
    },
}

function isSupportedLocale(locale?: string): locale is Locale {
    return locale === 'zh' || locale === 'en'
}

export default function LanguageSwitcher() {
    const router = useRouter()
    const pathname = usePathname()
    const params = useParams<{ locale?: string }>()
    const containerRef = useRef<HTMLDivElement | null>(null)
    const [isMenuOpen, setIsMenuOpen] = useState(false)
    const [showConfirm, setShowConfirm] = useState(false)
    const [pendingLocale, setPendingLocale] = useState<Locale | null>(null)

    if (!pathname) {
        throw new Error('LanguageSwitcher requires a non-null pathname')
    }
    if (!isSupportedLocale(params?.locale)) {
        throw new Error('LanguageSwitcher requires locale param to be zh or en')
    }
    const currentLocale: Locale = params.locale
    const targetLocale: Locale = currentLocale === 'zh' ? 'en' : 'zh'
    const activeLocaleForCopy: Locale = pendingLocale ?? targetLocale
    const confirmCopy = SWITCH_CONFIRM_COPY[activeLocaleForCopy]

    useEffect(() => {
        if (!isMenuOpen) return

        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsMenuOpen(false)
            }
        }

        document.addEventListener('mousedown', handleClickOutside)
        return () => {
            document.removeEventListener('mousedown', handleClickOutside)
        }
    }, [isMenuOpen])

    const requestLanguageSwitch = (newLocale: Locale) => {
        setIsMenuOpen(false)
        if (newLocale === currentLocale) return
        setPendingLocale(newLocale)
        setShowConfirm(true)
    }

    const confirmLanguageSwitch = () => {
        if (!pendingLocale) {
            throw new Error('LanguageSwitcher confirm requires a pending locale')
        }
        const newPathname = pathname.replace(`/${currentLocale}`, `/${pendingLocale}`)
        setShowConfirm(false)
        setPendingLocale(null)
        router.push(newPathname)
    }

    const cancelLanguageSwitch = () => {
        setShowConfirm(false)
        setPendingLocale(null)
    }

    return (
        <>
            <div ref={containerRef} className="relative inline-block">
                <button
                    type="button"
                    onClick={() => setIsMenuOpen((prev) => !prev)}
                    aria-label={SWITCH_CONFIRM_COPY[targetLocale].triggerLabel}
                    aria-expanded={isMenuOpen}
                    className="inline-flex items-center justify-center border border-input bg-background hover:bg-accent hover:text-accent-foreground inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm"
                >
                    <AppIcon name="globe" className="h-4 w-4" />
                    <span>{LANGUAGE_LABELS[currentLocale]}</span>
                    <AppIcon name="chevronDown" className="h-4 w-4 text-muted-foreground" />
                </button>

                {isMenuOpen ? (
                    <div className="rounded-xl border border-border bg-card shadow-lg absolute right-0 z-50 mt-2 w-44 rounded-xl p-2">
                        {(Object.entries(LANGUAGE_LABELS) as Array<[Locale, string]>).map(([locale, label]) => {
                            const isActive = locale === currentLocale
                            return (
                                <button
                                    key={locale}
                                    type="button"
                                    onClick={() => requestLanguageSwitch(locale)}
                                    className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${isActive
                                        ? 'bg-primary/10 text-foreground'
                                        : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                                        }`}
                                >
                                    {label}
                                </button>
                            )
                        })}
                    </div>
                ) : null}
            </div>
            <ConfirmDialog
                show={showConfirm}
                title={confirmCopy.title}
                message={confirmCopy.message.replace('{targetLanguage}', pendingLocale ? LANGUAGE_LABELS[pendingLocale] : '')}
                confirmText={confirmCopy.action}
                cancelText={confirmCopy.cancel}
                onConfirm={confirmLanguageSwitch}
                onCancel={cancelLanguageSwitch}
                type="info"
            />
        </>
    )
}
