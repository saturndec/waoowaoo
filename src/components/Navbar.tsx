'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useSession } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import LanguageSwitcher from './LanguageSwitcher'
import { AppIcon } from '@/components/ui/icons'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export default function Navbar() {
  const { data: session } = useSession()
  const t = useTranslations('nav')
  const tc = useTranslations('common')

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center gap-2">
            <Link href={session ? "/workspace" : "/"} className="group">
              <Image
                src="/logo-small.png?v=1"
                alt={tc('appName')}
                width={80}
                height={80}
                className="object-contain transition-transform group-hover:scale-110"
              />
            </Link>
            <Badge variant="secondary" className="px-2.5 py-1 text-[11px]">
              {tc('betaVersion')}
            </Badge>
          </div>
          <div className="flex items-center space-x-6">
            {session ? (
              <>
                <Link
                  href="/workspace"
                  className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  {t('workspace')}
                </Link>
                <Link
                  href="/workspace/asset-hub"
                  className="flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  <AppIcon name="folderHeart" className="w-4 h-4" />
                  {t('assetHub')}
                </Link>
                <Link
                  href="/profile"
                  className="flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                  title={t('profile')}
                >
                  <AppIcon name="userRoundCog" className="w-5 h-5" />
                  {t('profile')}
                </Link>
                <LanguageSwitcher />
              </>

            ) : (
              <>
                <Link
                  href="/auth/signin"
                  className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  {t('signin')}
                </Link>
                <Button size="sm" asChild>
                  <Link href="/auth/signup">{t('signup')}</Link>
                </Button>
                <LanguageSwitcher />
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  )
}
