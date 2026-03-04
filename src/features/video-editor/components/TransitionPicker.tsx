'use client'

import React from 'react'
import { useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'
import type { AppIconName } from '@/components/ui/icons'

export type TransitionType = 'none' | 'dissolve' | 'fade' | 'slide'

interface TransitionPickerProps {
    value: TransitionType
    duration: number
    onChange: (type: TransitionType, duration: number) => void
    disabled?: boolean
}

const TRANSITION_OPTIONS: { type: TransitionType; labelKey: string; icon: AppIconName }[] = [
    { type: 'none', labelKey: 'none', icon: 'minus' },
    { type: 'dissolve', labelKey: 'dissolve', icon: 'diamond' },
    { type: 'fade', labelKey: 'fade', icon: 'clock' },
    { type: 'slide', labelKey: 'slide', icon: 'arrowRight' }
]

const DURATION_OPTIONS = [
    { value: 10, label: '0.3s' },
    { value: 15, label: '0.5s' },
    { value: 30, label: '1s' },
    { value: 45, label: '1.5s' }
]

export const TransitionPicker: React.FC<TransitionPickerProps> = ({
    value,
    duration,
    onChange,
    disabled = false
}) => {
    const t = useTranslations('video')
    return (
        <div className="transition-picker" style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            padding: '12px',
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: '8px'
        }}>
            <div style={{ fontSize: '12px', color: 'var(--muted-foreground)', marginBottom: '4px' }}>
                {t('editor.transition.title')}
            </div>

            {/* 转场类型选择 */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '4px'
            }}>
                {TRANSITION_OPTIONS.map(option => (
                    <button
                        key={option.type}
                        onClick={() => onChange(option.type, duration)}
                        disabled={disabled}
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '2px',
                            padding: '8px 4px',
                            background: value === option.type ? 'var(--primary)' : 'var(--muted)',
                            border: value === option.type ? '1px solid var(--ring)' : '1px solid var(--border)',
                            borderRadius: '6px',
                            cursor: disabled ? 'not-allowed' : 'pointer',
                            opacity: disabled ? 0.5 : 1,
                            transition: 'all 0.2s'
                        }}
                    >
                        <AppIcon
                            name={option.icon}
                            size={16}
                            color={value === option.type ? 'var(--primary-foreground)' : 'var(--foreground)'}
                        />
                        <span style={{ fontSize: '10px', color: value === option.type ? 'var(--primary-foreground)' : 'var(--foreground)' }}>{t(`editor.transition.options.${option.labelKey}`)}</span>
                    </button>
                ))}
            </div>

            {/* 持续时间选择 */}
            {value !== 'none' && (
                <div style={{ marginTop: '8px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginBottom: '4px' }}>
                        {t('editor.transition.duration')}
                    </div>
                    <div style={{
                        display: 'flex',
                        gap: '4px'
                    }}>
                        {DURATION_OPTIONS.map(option => (
                            <button
                                key={option.value}
                                onClick={() => onChange(value, option.value)}
                                disabled={disabled}
                                style={{
                                    flex: 1,
                                    padding: '6px 8px',
                                    background: duration === option.value ? 'var(--primary)' : 'var(--muted)',
                                    border: duration === option.value ? '1px solid var(--ring)' : '1px solid var(--border)',
                                    borderRadius: '4px',
                                    fontSize: '11px',
                                    color: duration === option.value ? 'var(--primary-foreground)' : 'var(--foreground)',
                                    cursor: disabled ? 'not-allowed' : 'pointer',
                                    opacity: disabled ? 0.5 : 1
                                }}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}

export default TransitionPicker
