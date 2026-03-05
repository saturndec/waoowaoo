'use client'

import { useEffect } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Navbar from '@/components/Navbar'
import ApiConfigTab from './components/ApiConfigTab'
import { AppIcon } from '@/components/ui/icons'

export default function ProfilePage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const t = useTranslations('profile')
  const tc = useTranslations('common')

  useEffect(() => {
    if (status === 'loading') return
    if (!session) { router.push('/auth/signin'); return }
  }, [router, session, status])

  if (status === 'loading' || !session) {
    return (
      <div className="glass-page flex min-h-screen items-center justify-center">
        <div className="text-[var(--glass-text-secondary)]">{tc('loading')}</div>
      </div>
    )
  }

  return (
    <div className="glass-page min-h-screen">
      <Navbar />

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex gap-6 h-[calc(100vh-140px)]">

          {/* Thanh bên trái */}
          <div className="w-64 flex-shrink-0">
            <div className="glass-surface-elevated h-full flex flex-col p-5">

              {/* Thông tin người dùng */}
              <div className="mb-6">
                <div className="mb-4">
                  <h2 className="font-semibold text-[var(--glass-text-primary)]">{session.user?.name || t('user')}</h2>
                  <p className="text-xs text-[var(--glass-text-tertiary)]">{t('personalAccount')}</p>
                </div>
              </div>

              {/* Menu điều hướng */}
              <nav className="flex-1 space-y-2">
                <button
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all cursor-pointer glass-btn-base glass-btn-tone-info"
                >
                  <AppIcon name="settingsHexAlt" className="w-5 h-5" />
                  <span className="font-medium">{t('apiConfig')}</span>
                </button>
              </nav>

              {/* Đăng xuất */}
              <button
                onClick={() => signOut({ callbackUrl: '/' })}
                className="glass-btn-base glass-btn-tone-danger mt-auto flex items-center gap-2 px-4 py-3 text-sm rounded-xl transition-all cursor-pointer"
              >
                <AppIcon name="logout" className="w-4 h-4" />
                {t('logout')}
              </button>
            </div>
          </div>

          {/* Nội dung chính - chỉ API Config */}
          <div className="flex-1 min-w-0">
            <div className="glass-surface-elevated h-full flex flex-col">
              <ApiConfigTab />
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
