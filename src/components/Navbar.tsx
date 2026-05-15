'use client'

import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import Image from 'next/image'
import { useSession } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import LanguageSwitcher from './LanguageSwitcher'
import { AppIcon, type AppIconName } from '@/components/ui/icons'
import UpdateNoticeModal from './UpdateNoticeModal'
import { useGithubReleaseUpdate } from '@/hooks/common/useGithubReleaseUpdate'
import { Link } from '@/i18n/navigation'
import { buildAuthenticatedHomeTarget } from '@/lib/home/default-route'
import type { ProfileSection } from '@/lib/profile/sections'

interface NavbarSettingsBoundary {
  contains(target: Node | null): boolean
}

interface NavbarProps {
  reserveLayoutSpace?: boolean
}

export function shouldCloseNavbarSettingsMenu(
  target: Node | null,
  trigger: NavbarSettingsBoundary | null | undefined,
  menu: NavbarSettingsBoundary | null | undefined,
) {
  if (target === null) return false
  if (trigger?.contains(target)) return false
  if (menu?.contains(target)) return false
  return true
}

export default function Navbar({ reserveLayoutSpace = true }: NavbarProps) {
  const { data: session, status } = useSession()
  const t = useTranslations('nav')
  const tc = useTranslations('common')
  const { currentVersion, update, shouldPulse, showModal, openModal, dismissCurrentUpdate, checkNow } = useGithubReleaseUpdate()
  const [checkMsg, setCheckMsg] = useState<string | null>(null)
  const [checkMsgFading, setCheckMsgFading] = useState(false)
  const [manualChecking, setManualChecking] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsMenuStyle, setSettingsMenuStyle] = useState<CSSProperties | null>(null)
  const settingsTriggerRef = useRef<HTMLDivElement>(null)
  const settingsMenuRef = useRef<HTMLDivElement>(null)
  const downloadLogsHref = '/api/admin/download-logs'
  const settingsMenuId = 'navbar-settings-menu'
  const navControlClass = 'glass-selection-control inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium'

  const settingsMenuItems: Array<{
    section: ProfileSection
    icon: AppIconName
    label: string
  }> = [
    { section: 'apiConfig', icon: 'settingsHexAlt', label: t('settingsMenu.apiConfig') },
    { section: 'stylePresets', icon: 'sparkles', label: t('settingsMenu.stylePresets') },
    { section: 'billing', icon: 'receipt', label: t('settingsMenu.billingRecords') },
  ]

  const handleCheckUpdate = async () => {
    setCheckMsg(null)
    setCheckMsgFading(false)
    setManualChecking(true)
    const minSpin = new Promise(r => setTimeout(r, 1000))
    await Promise.all([checkNow(), minSpin])
    setManualChecking(false)
    setTimeout(() => {
      setCheckMsg('upToDate')
      setTimeout(() => setCheckMsgFading(true), 2000)
      setTimeout(() => { setCheckMsg(null); setCheckMsgFading(false) }, 3000)
    }, 100)
  }

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!settingsOpen) return

    const updatePosition = () => {
      const trigger = settingsTriggerRef.current
      if (!trigger) return

      const rect = trigger.getBoundingClientRect()
      const width = 240
      const viewportPadding = 16
      const maxLeft = Math.max(viewportPadding, window.innerWidth - width - viewportPadding)
      const left = Math.min(Math.max(viewportPadding, rect.right - width), maxLeft)

      setSettingsMenuStyle({
        position: 'fixed',
        top: rect.bottom + 8,
        left,
        width,
      })
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return

      if (shouldCloseNavbarSettingsMenu(event.target, settingsTriggerRef.current, settingsMenuRef.current)) {
        setSettingsOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSettingsOpen(false)
      }
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('pointerdown', handlePointerDown, true)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('pointerdown', handlePointerDown, true)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [settingsOpen])

  const settingsMenu = (
    <div
      id={settingsMenuId}
      ref={settingsMenuRef}
      role="menu"
      aria-label={t('profile')}
      style={settingsMenuStyle ?? undefined}
      className="z-[1000] rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface-strong)] p-2 shadow-[0_18px_50px_-24px_rgba(0,0,0,0.55)] backdrop-blur-xl"
    >
      {settingsMenuItems.map(item => (
        <Link
          key={item.section}
          href={{ pathname: '/profile', query: { section: item.section } }}
          target="_blank"
          rel="noopener noreferrer"
          role="menuitem"
          onClick={() => setSettingsOpen(false)}
          className="glass-selection-control group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium"
        >
          <AppIcon name={item.icon} className="h-4 w-4 transition-transform group-hover:scale-110" />
          <span>{item.label}</span>
        </Link>
      ))}
      <div className="my-2 h-px bg-[var(--glass-stroke-base)]" />
      <div className="rounded-lg px-1 py-1">
        <LanguageSwitcher />
      </div>
      <a
        href={downloadLogsHref}
        download
        role="menuitem"
        className="glass-selection-control group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium"
        title={t('downloadLogs')}
      >
        <AppIcon name="download" className="h-4 w-4 transition-transform group-hover:scale-110" />
        <span>{t('downloadLogs')}</span>
      </a>
      <button
        type="button"
        role="menuitem"
        onClick={() => void handleCheckUpdate()}
        disabled={manualChecking}
        className="glass-selection-control group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium disabled:opacity-50"
      >
        <AppIcon name="refresh" className={`h-4 w-4 transition-transform group-hover:scale-110 ${manualChecking ? 'animate-spin' : ''}`} />
        <span>{tc('updateNotice.checkUpdate')}</span>
      </button>
    </div>
  )

  return (
    <>
      <nav className="pointer-events-none fixed inset-x-0 top-0 z-50 px-4 py-4 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl items-start justify-between gap-4">
            <div className="pointer-events-auto flex h-[52px] items-center gap-2">
              <Link
                href={session ? buildAuthenticatedHomeTarget() : { pathname: '/' }}
                target={session ? '_blank' : undefined}
                rel={session ? 'noopener noreferrer' : undefined}
                className="group"
              >
                <Image
                  src="/logo-small.png"
                  alt={tc('appName')}
                  width={250}
                  height={78}
                  className="h-[78px] w-[250px] object-contain transition-transform group-hover:scale-105"
                />
              </Link>
              {update ? (
                <button
                  type="button"
                  onClick={openModal}
                  className="relative inline-flex items-center gap-1.5 rounded-full border border-[var(--glass-tone-warning-fg)]/40 bg-[linear-gradient(135deg,var(--glass-tone-warning-bg),var(--glass-bg-surface-strong))] px-2.5 py-1 text-[11px] font-semibold text-[var(--glass-tone-warning-fg)] shadow-[0_8px_24px_-16px_rgba(245,158,11,0.9)] transition-all hover:brightness-105"
                  aria-label={tc('updateNotice.openDialog')}
                >
                  {shouldPulse ? <span className="absolute -inset-1 animate-ping rounded-full bg-[var(--glass-tone-warning-fg)] opacity-20" /> : null}
                  <AppIcon name="upload" className="h-3.5 w-3.5" />
                  {tc('updateNotice.updateTag')}
                </button>
              ) : checkMsg === 'upToDate' ? (
                <span
                  className="text-[11px] font-medium text-[var(--glass-tone-success-fg)] transition-opacity duration-1000"
                  style={{ opacity: checkMsgFading ? 0 : 1 }}
                >
                  ✓ {tc('updateNotice.upToDate')}
                </span>
              ) : null}
              <span className="sr-only">{tc('betaVersion', { version: currentVersion })}</span>
            </div>
            <div className="glass-surface-nav pointer-events-auto flex min-h-[52px] items-center gap-2 px-2 py-2">
              {status === 'loading' ? (
                /* Session 加载中骨架屏 */
                <div className="flex items-center space-x-4">
                  <div className="h-4 w-16 rounded-full bg-[var(--glass-bg-muted)] animate-pulse" />
                  <div className="h-4 w-16 rounded-full bg-[var(--glass-bg-muted)] animate-pulse" />
                  <div className="h-8 w-20 rounded-lg bg-[var(--glass-bg-muted)] animate-pulse" />
                </div>
              ) : session ? (
                <>
                  <Link
                    href={{ pathname: '/workspace' }}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={navControlClass}
                  >
                    <AppIcon name="monitor" className="w-4 h-4" />
                    {t('workspace')}
                  </Link>
                  <Link
                    href={{ pathname: '/workspace/asset-hub' }}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={navControlClass}
                  >
                    <AppIcon name="folderHeart" className="w-4 h-4" />
                    {t('assetHub')}
                  </Link>
                  <div ref={settingsTriggerRef} className="relative">
                    <button
                      type="button"
                      aria-haspopup="menu"
                      aria-expanded={settingsOpen}
                      aria-controls={settingsMenuId}
                      onClick={() => setSettingsOpen(open => !open)}
                      className={navControlClass}
                      title={t('profile')}
                    >
                      <AppIcon name="settingsHexAlt" className="h-4 w-4" />
                      {t('profile')}
                      <AppIcon name="chevronDown" className={`h-3.5 w-3.5 transition-transform ${settingsOpen ? 'rotate-180' : ''}`} />
                    </button>
                  </div>
                  {!mounted ? (
                    <div className="hidden" aria-hidden="true">
                      {settingsMenuItems.map(item => (
                        <Link
                          key={item.section}
                          href={{ pathname: '/profile', query: { section: item.section } }}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {item.label}
                        </Link>
                      ))}
                      <a href={downloadLogsHref} download>{t('downloadLogs')}</a>
                      <span>{tc('updateNotice.checkUpdate')}</span>
                    </div>
                  ) : null}
                </>

              ) : (
                <>
                  <Link
                    href={{ pathname: '/auth/signin' }}
                    className="glass-selection-control rounded-full px-2.5 py-1.5 text-sm font-medium"
                  >
                    {t('signin')}
                  </Link>
                  <Link
                    href={{ pathname: '/auth/signup' }}
                    className="glass-btn-base glass-btn-primary px-4 py-2 text-sm font-medium"
                  >
                    {t('signup')}
                  </Link>
                  <LanguageSwitcher />
                </>
              )}
            </div>
        </div>
      </nav>
      {reserveLayoutSpace ? <div aria-hidden="true" className="h-16" /> : null}
      {update ? (
        <UpdateNoticeModal
          show={showModal}
          currentVersion={currentVersion}
          latestVersion={update.latestVersion}
          releaseUrl={update.releaseUrl}
          releaseName={update.releaseName}
          publishedAt={update.publishedAt}
          onDismiss={dismissCurrentUpdate}
        />
      ) : null}
      {mounted && settingsOpen && settingsMenuStyle ? createPortal(settingsMenu, document.body) : null}
    </>
  )
}
