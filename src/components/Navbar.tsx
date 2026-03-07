'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useSession } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import LanguageSwitcher from './LanguageSwitcher'
import { AppIcon } from '@/components/ui/icons'

export default function Navbar() {
  const { data: session } = useSession()
  const t = useTranslations('nav')
  const tc = useTranslations('common')

  return (
    <nav className="glass-nav sticky top-0 z-50">
      <div className="mx-auto max-w-7xl px-3 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-2 sm:gap-3">
          <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
            <Link href={session ? "/workspace" : "/"} className="group shrink-0">
              <Image
                src="/logo-small.png?v=1"
                alt={tc('appName')}
                width={72}
                height={72}
                className="object-contain transition-transform group-hover:scale-110 sm:w-20"
              />
            </Link>
            <span className="hidden sm:inline-flex glass-chip glass-chip-info px-2.5 py-1 text-[11px]">
              {tc('betaVersion')}
            </span>
          </div>

          <div className="flex min-w-0 items-center gap-1.5 sm:gap-4">
            {session ? (
              <>
                <Link
                  href="/workspace"
                  className="text-xs sm:text-sm text-[var(--glass-text-secondary)] hover:text-[var(--glass-text-primary)] font-medium transition-colors px-1.5 sm:px-0"
                >
                  {t('workspace')}
                </Link>
                <Link
                  href="/workspace/asset-hub"
                  className="text-xs sm:text-sm text-[var(--glass-text-secondary)] hover:text-[var(--glass-text-primary)] font-medium transition-colors flex items-center gap-1 px-1.5 sm:px-0"
                >
                  <AppIcon name="folderHeart" className="w-4 h-4" />
                  <span className="hidden sm:inline">{t('assetHub')}</span>
                </Link>
                <Link
                  href="/profile"
                  className="text-xs sm:text-sm text-[var(--glass-text-secondary)] hover:text-[var(--glass-text-primary)] font-medium transition-colors flex items-center gap-1 px-1.5 sm:px-0"
                  title={t('profile')}
                >
                  <AppIcon name="userRoundCog" className="w-4 h-4 sm:w-5 sm:h-5" />
                  <span className="hidden sm:inline">{t('profile')}</span>
                </Link>
                <LanguageSwitcher />
              </>
            ) : (
              <>
                <Link
                  href="/auth/signin"
                  className="text-xs sm:text-sm text-[var(--glass-text-secondary)] hover:text-[var(--glass-text-primary)] font-medium transition-colors"
                >
                  {t('signin')}
                </Link>
                <Link
                  href="/auth/signup"
                  className="glass-btn-base glass-btn-primary px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium"
                >
                  {t('signup')}
                </Link>
                <LanguageSwitcher />
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  )
}
