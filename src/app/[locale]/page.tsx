'use client'

import { useEffect } from 'react'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { useSession } from 'next-auth/react'
import { useRouter } from '@/i18n/navigation'
import Navbar from '@/components/Navbar'
import { Link } from '@/i18n/navigation'
import { buildAuthenticatedHomeTarget } from '@/lib/home/default-route'

export default function Home() {
  const t = useTranslations('landing')
  const { status } = useSession()
  const router = useRouter()

  // 已登录用户自动跳转到 home
  useEffect(() => {
    if (status === 'authenticated') {
      router.replace(buildAuthenticatedHomeTarget())
    }
  }, [status, router])

  // session 加载中或已登录（即将跳转），不渲染落地页，避免闪烁
  if (status !== 'unauthenticated') {
    return (
      <div className="glass-page min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Image
            src="/logo-small.png"
            alt="waoowaoo"
            width={80}
            height={80}
            className="animate-pulse"
          />
        </div>
      </div>
    )
  }

  return (
    <div className="glass-page min-h-screen overflow-hidden font-sans selection:bg-[var(--glass-tone-info-bg)]">
      {/* Navbar */}
      <div className="relative z-50">
        <Navbar />
      </div>

      {/* Background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(1200px_600px_at_80%_-10%,rgba(138,170,255,0.12),transparent),radial-gradient(900px_500px_at_0%_100%,rgba(148,163,184,0.16),transparent)]"></div>
      </div>

      <main className="relative z-10">
        <section className="relative min-h-screen flex items-center justify-center -mt-16 px-4">
          <div className="container mx-auto grid lg:grid-cols-2 gap-16 items-center">
            <div className="text-left space-y-8 animate-slide-up" style={{ animationDuration: '0.8s' }}>
              <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-[1.1] animate-fade-in" style={{ animationDelay: '0.2s' }}>
                <span className="block text-[var(--glass-text-primary)]">
                  {t('title')}
                </span>
                <span className="text-[var(--glass-tone-info-fg)]">
                  {t('subtitle')}
                </span>
              </h1>

              <div className="flex flex-wrap gap-4 pt-4 animate-fade-in" style={{ animationDelay: '0.6s' }}>
                <Link
                  href={{ pathname: '/auth/signup' }}
                  className="glass-btn-base glass-btn-primary px-8 py-4 rounded-xl font-semibold transition-all duration-300"
                >
                  {t('getStarted')}
                </Link>
              </div>
            </div>

            <div className="relative h-[600px] hidden lg:flex items-center justify-center animate-scale-in" style={{ animationDuration: '1s' }}>
              <div className="relative w-full max-w-md aspect-square">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-[radial-gradient(circle,rgba(148,163,184,0.2),transparent_65%)] rounded-full blur-3xl opacity-70"></div>
                <div className="absolute top-0 right-10 w-64 h-80 glass-surface rounded-3xl transform rotate-6 animate-float-delayed"></div>
                <div className="absolute bottom-10 left-10 w-72 h-80 glass-surface-soft rounded-3xl transform -rotate-3 animate-float-slow"></div>
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-96 glass-surface-modal rounded-3xl overflow-hidden animate-float">
                  <div className="p-6 h-full flex flex-col">
                    <div className="w-full h-48 bg-[var(--glass-bg-muted)] rounded-2xl mb-6 relative overflow-hidden group">
                      <div className="absolute inset-0 bg-[var(--glass-tone-info-bg)]/20 group-hover:bg-[var(--glass-tone-info-bg)]/35 transition-colors"></div>
                      <div className="absolute top-4 right-4 w-8 h-8 rounded-full bg-[var(--glass-bg-surface)]"></div>
                      <div className="absolute bottom-4 left-4 w-12 h-12 rounded-lg bg-[var(--glass-bg-surface-strong)] rotate-12"></div>
                    </div>
                    <div className="space-y-3">
                      <div className="h-3 w-3/4 bg-[var(--glass-bg-muted)] rounded-full"></div>
                      <div className="h-3 w-1/2 bg-[var(--glass-bg-muted)] rounded-full"></div>
                      <div className="pt-4 flex gap-2">
                        <div className="h-10 w-10 rounded-full bg-[var(--glass-bg-surface)] border border-[var(--glass-stroke-soft)]"></div>
                        <div className="h-10 flex-1 rounded-full bg-[var(--glass-tone-info-bg)]/40 border border-[var(--glass-stroke-base)]"></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
