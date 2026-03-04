'use client'

import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import Navbar from '@/components/Navbar'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export default function Home() {
  const t = useTranslations('landing')
  const { data: session } = useSession()

  return (
    <div className="min-h-screen overflow-hidden bg-background font-sans selection:bg-primary/20">
      {/* Navbar */}
      <div className="relative z-50">
        <Navbar />
      </div>

      {/* Background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(1200px_600px_at_80%_-10%,rgba(138,170,255,0.12),transparent),radial-gradient(900px_500px_at_0%_100%,rgba(148,163,184,0.16),transparent)]"></div>
      </div>

      <main className="relative z-10">
        <section className="relative min-h-screen flex items-center justify-center -mt-16 px-4 sm:px-8 lg:px-12">
          <div className="w-full grid lg:grid-cols-2 gap-16 items-center">
            <div className="text-left space-y-8 animate-slide-up" style={{ animationDuration: '0.8s' }}>
              <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-[1.1] animate-fade-in" style={{ animationDelay: '0.2s' }}>
                <span className="block text-foreground">
                  {t('title')}
                </span>
                <span className="text-primary">
                  {t('subtitle')}
                </span>
              </h1>

              <div className="flex flex-wrap gap-4 pt-4 animate-fade-in" style={{ animationDelay: '0.6s' }}>
                {session ? (
                  <Link
                    href="/workspace"
                    className={cn(buttonVariants({ size: 'lg' }), 'rounded-xl px-8 py-4 font-semibold')}
                  >
                    {t('enterWorkspace')}
                  </Link>
                ) : (
                  <Link
                    href="/auth/signup"
                    className={cn(buttonVariants({ size: 'lg' }), 'rounded-xl px-8 py-4 font-semibold')}
                  >
                    {t('getStarted')}
                  </Link>
                )}
              </div>
            </div>

            <div className="relative h-[600px] hidden lg:flex items-center justify-center animate-scale-in" style={{ animationDuration: '1s' }}>
              <div className="relative w-full aspect-square">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-[radial-gradient(circle,rgba(148,163,184,0.2),transparent_65%)] rounded-full blur-3xl opacity-70"></div>
                <div className="absolute top-0 right-10 h-80 w-64 rounded-3xl border border-border bg-card shadow-sm transform rotate-6 animate-float-delayed"></div>
                <div className="absolute bottom-10 left-10 h-80 w-72 rounded-3xl border border-border bg-muted/40 shadow-sm transform -rotate-3 animate-float-slow"></div>
                <div className="absolute top-1/2 left-1/2 h-96 w-80 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-3xl border border-border bg-card shadow-lg animate-float">
                  <div className="p-6 h-full flex flex-col">
                    <div className="group relative mb-6 h-48 w-full overflow-hidden rounded-2xl bg-muted">
                      <div className="absolute inset-0 bg-primary/10 transition-colors group-hover:bg-primary/20"></div>
                      <div className="absolute top-4 right-4 h-8 w-8 rounded-full bg-background"></div>
                      <div className="absolute bottom-4 left-4 h-12 w-12 rotate-12 rounded-lg bg-card"></div>
                    </div>
                    <div className="space-y-3">
                      <div className="h-3 w-3/4 rounded-full bg-muted"></div>
                      <div className="h-3 w-1/2 rounded-full bg-muted"></div>
                      <div className="pt-4 flex gap-2">
                        <div className="h-10 w-10 rounded-full border border-border bg-background"></div>
                        <div className="h-10 flex-1 rounded-full border border-border bg-primary/15"></div>
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
