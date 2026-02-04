'use client'

import React from 'react'

export type TransitionType = 'none' | 'dissolve' | 'fade' | 'slide'

interface TransitionPickerProps {
    value: TransitionType
    duration: number
    onChange: (type: TransitionType, duration: number) => void
    disabled?: boolean
}

const TRANSITION_OPTIONS: { type: TransitionType; label: string; icon: string }[] = [
    { type: 'none', label: '无', icon: '⏸' },
    { type: 'dissolve', label: '溶解', icon: '🔀' },
    { type: 'fade', label: '淡入淡出', icon: '🌫' },
    { type: 'slide', label: '滑动', icon: '➡️' }
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
    return (
        <div className="transition-picker" style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            padding: '12px',
            background: '#2a2a2a',
            borderRadius: '8px'
        }}>
            <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px' }}>
                转场效果
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
                            background: value === option.type ? '#4a9eff' : '#3a3a3a',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: disabled ? 'not-allowed' : 'pointer',
                            opacity: disabled ? 0.5 : 1,
                            transition: 'all 0.2s'
                        }}
                    >
                        <span style={{ fontSize: '16px' }}>{option.icon}</span>
                        <span style={{ fontSize: '10px', color: '#fff' }}>{option.label}</span>
                    </button>
                ))}
            </div>

            {/* 持续时间选择 */}
            {value !== 'none' && (
                <div style={{ marginTop: '8px' }}>
                    <div style={{ fontSize: '11px', color: '#666', marginBottom: '4px' }}>
                        持续时间
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
                                    background: duration === option.value ? '#4a9eff' : '#333',
                                    border: 'none',
                                    borderRadius: '4px',
                                    fontSize: '11px',
                                    color: '#fff',
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
