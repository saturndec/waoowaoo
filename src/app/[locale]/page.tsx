'use client'

import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import Navbar from '@/components/Navbar'

export default function Home() {
  const t = useTranslations('landing')
  const { data: session } = useSession()

  return (
    <div className="min-h-screen bg-white text-gray-900 overflow-hidden font-sans selection:bg-blue-100">
      {/* Navbar */}
      <div className="relative z-50">
        <Navbar />
      </div>

      {/* Background - Ethereal Light Theme */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-white via-blue-50/30 to-orange-50/20"></div>

        {/* Soft Blobs */}
        <div className="absolute top-[-20%] right-[-10%] w-[800px] h-[800px] bg-blue-100/40 rounded-full blur-[120px] animate-pulse-slow"></div>
        <div className="absolute bottom-[-10%] left-[-10%] w-[600px] h-[600px] bg-orange-100/40 rounded-full blur-[100px] animate-float-slow"></div>
      </div>

      <main className="relative z-10">
        {/* Hero Section */}
        <section className="relative min-h-screen flex items-center justify-center -mt-16 px-4">
          <div className="container mx-auto grid lg:grid-cols-2 gap-16 items-center">

            <div className="text-left space-y-8 animate-slide-up" style={{ animationDuration: '0.8s' }}>
              <div className="inline-block px-4 py-2 rounded-full bg-white/60 backdrop-blur-md border border-gray-200/50 shadow-sm animate-fade-in">
                <span className="bg-gradient-to-r from-cyan-500 to-purple-500 bg-clip-text text-transparent font-semibold tracking-wide text-sm">
                  {t('tagline')}
                </span>
              </div>

              <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-[1.1] animate-fade-in" style={{ animationDelay: '0.2s' }}>
                {/* waoowaoo with glassmorphism gradient effect */}
                <span className="block relative">
                  <span
                    className="relative inline-block text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-500"
                    style={{
                      textShadow: '0 4px 20px rgba(139, 92, 246, 0.3), 0 2px 10px rgba(34, 211, 238, 0.2)',
                      filter: 'drop-shadow(0 0 20px rgba(139, 92, 246, 0.15))',
                    }}
                  >
                    {t('title')}
                  </span>
                  {/* Glass highlight overlay effect */}
                  <span
                    className="absolute inset-0 text-transparent bg-clip-text bg-gradient-to-b from-white/40 to-transparent pointer-events-none"
                    aria-hidden="true"
                    style={{
                      WebkitBackgroundClip: 'text',
                      mixBlendMode: 'overlay',
                    }}
                  >
                    {t('title')}
                  </span>
                </span>
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-indigo-500 to-blue-600 bg-[length:200%_auto] animate-gradient-x">
                  {t('subtitle')}
                </span>
              </h1>

              <p className="text-xl text-gray-600 max-w-lg leading-relaxed animate-fade-in" style={{ animationDelay: '0.4s' }}>
                {t('description')}
              </p>

              <div className="flex flex-wrap gap-4 pt-4 animate-fade-in" style={{ animationDelay: '0.6s' }}>
                {session ? (
                  <Link
                    href="/workspace"
                    className="px-8 py-4 rounded-xl bg-blue-600 text-white font-semibold shadow-lg shadow-blue-200 hover:shadow-blue-300 hover:-translate-y-0.5 transition-all duration-300"
                  >
                    {t('enterWorkspace')}
                  </Link>
                ) : (
                  <Link
                    href="/auth/signup"
                    className="px-8 py-4 rounded-xl bg-blue-600 text-white font-semibold shadow-lg shadow-blue-200 hover:shadow-blue-300 hover:-translate-y-0.5 transition-all duration-300"
                  >
                    {t('getStarted')}
                  </Link>
                )}
              </div>
            </div>

            {/* Visual - Glass Cards Stack */}
            <div className="relative h-[600px] hidden lg:flex items-center justify-center animate-scale-in" style={{ animationDuration: '1s' }}>
              <div className="relative w-full max-w-md aspect-square">
                {/* Background Accents */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-gradient-to-tr from-blue-100/50 to-orange-100/50 rounded-full blur-3xl opacity-60"></div>

                {/* Glass Card 1 (Back) */}
                <div className="absolute top-0 right-10 w-64 h-80 bg-white/40 backdrop-blur-xl border border-white/60 rounded-3xl shadow-xl transform rotate-6 animate-float-delayed"></div>

                {/* Glass Card 2 (Middle) */}
                <div className="absolute bottom-10 left-10 w-72 h-80 bg-white/60 backdrop-blur-xl border border-white/60 rounded-3xl shadow-xl transform -rotate-3 animate-float-slow"></div>

                {/* Main Card (Front) */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-96 bg-white/80 backdrop-blur-2xl border border-white rounded-3xl shadow-2xl overflow-hidden animate-float">
                  <div className="p-6 h-full flex flex-col">
                    <div className="w-full h-48 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl mb-6 relative overflow-hidden group">
                      <div className="absolute inset-0 bg-blue-500/5 group-hover:bg-blue-500/10 transition-colors"></div>
                      {/* Simple geometric shapes */}
                      <div className="absolute top-4 right-4 w-8 h-8 rounded-full bg-blue-200/50"></div>
                      <div className="absolute bottom-4 left-4 w-12 h-12 rounded-lg bg-indigo-200/50 rotate-12"></div>
                    </div>
                    <div className="space-y-3">
                      <div className="h-3 w-3/4 bg-gray-100 rounded-full"></div>
                      <div className="h-3 w-1/2 bg-gray-100 rounded-full"></div>
                      <div className="pt-4 flex gap-2">
                        <div className="h-10 w-10 rounded-full bg-gray-50 border border-gray-100"></div>
                        <div className="h-10 flex-1 rounded-full bg-blue-600/5 border border-blue-100"></div>
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
