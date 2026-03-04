'use client'

/**
 * ModelCapabilityDropdown - 方案 A 经典分区式
 * 自定义下拉组件：上半区选模型，分割线，下半区配参数
 * 触发器显示模型名 + provider + 参数摘要
 *
 * 用于：
 *  - 项目配置中心 (ConfigEditModal / SettingsModal)
 *  - 系统级设置中心 (ApiConfigTabContainer)
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { CapabilityValue } from '@/lib/model-config-contract'
import { AppIcon, RatioPreviewIcon } from '@/components/ui/icons'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

// ─── Types ────────────────────────────────────────────

export interface ModelCapabilityOption {
    /** Composite key e.g. "ark::doubao-seedance-1-0-pro-250528" */
    value: string
    /** Display name */
    label: string
    /** Raw provider id */
    provider?: string
    /** Friendly provider name */
    providerName?: string
    /** Whether this model is disabled in current context */
    disabled?: boolean
}

export interface CapabilityFieldDefinition {
    field: string
    label: string
    options: CapabilityValue[]
    disabledOptions?: CapabilityValue[]
}

export interface CapabilityBooleanToggle {
    key: string
    label: string
    value: boolean
    onChange: (next: boolean) => void
    onLabel?: string
    offLabel?: string
}

export interface ModelCapabilityDropdownProps {
    /** Available model options */
    models: ModelCapabilityOption[]
    /** Currently selected model key */
    value: string | undefined
    /** Callback when model selection changes */
    onModelChange: (modelKey: string) => void
    /** Capability fields for the currently selected model */
    capabilityFields: CapabilityFieldDefinition[]
    /** Current capability override values keyed by field name */
    capabilityOverrides: Record<string, CapabilityValue>
    /** Callback when a capability value changes. Pass empty string to reset. */
    onCapabilityChange: (field: string, rawValue: string, sample: CapabilityValue) => void
    /** Optional: label text to show when no model is selected */
    placeholder?: string
    /** Optional: compact mode for smaller card contexts */
    compact?: boolean
    /** Optional: extra boolean toggles rendered in param section */
    booleanToggles?: CapabilityBooleanToggle[]
}

const DEFAULT_PANEL_MAX_HEIGHT = 280
const VIEWPORT_EDGE_GAP = 8

// ─── Helpers ──────────────────────────────────────────

function RatioIcon({ ratio, size = 12, selected = false }: { ratio: string; size?: number; selected?: boolean }) {
    return (
        <RatioPreviewIcon
            ratio={ratio}
            size={size}
            selected={selected}
            radiusClassName="rounded-[3px]"
        />
    )
}

function isRatioLike(field: string, options: CapabilityValue[]): boolean {
    const normalizedField = field.toLowerCase().replace(/[_\-\s]/g, '')
    if (normalizedField === 'ratio' || normalizedField === 'aspectratio') return true
    return options.every((o) => typeof o === 'string' && /^\d+:\d+$/.test(o))
}

function isValidRatioText(value: string): boolean {
    return /^\d+:\d+$/.test(value)
}

function shouldUseSelectControl(field: string, options: CapabilityValue[]): boolean {
    if (options.length <= 3) return false
    if (field.toLowerCase().includes('duration')) return true
    if (field.toLowerCase().includes('fps')) return true
    return options.every((item) => typeof item === 'number')
}

function formatValue(val: CapabilityValue, field: string): string {
    const s = String(val)
    if (field === 'duration') return `${s}s`
    return s
}

function isOptionDisabled(def: CapabilityFieldDefinition, option: CapabilityValue): boolean {
    if (!Array.isArray(def.disabledOptions) || def.disabledOptions.length === 0) return false
    return def.disabledOptions.includes(option)
}

// ─── Component ────────────────────────────────────────

export function ModelCapabilityDropdown({
    models,
    value,
    onModelChange,
    capabilityFields,
    capabilityOverrides,
    onCapabilityChange,
    placeholder,
    compact = false,
    booleanToggles = [],
}: ModelCapabilityDropdownProps) {
    const t = useTranslations('configModal')
    const tv = useTranslations('video')
    const [isOpen, setIsOpen] = useState(false)
    const [openUpward, setOpenUpward] = useState(false)
    const [panelMaxHeight, setPanelMaxHeight] = useState<number>(DEFAULT_PANEL_MAX_HEIGHT)
    const ref = useRef<HTMLDivElement>(null)

    const updateDropdownPlacement = useCallback(() => {
        const container = ref.current
        if (!container) return

        const rect = container.getBoundingClientRect()
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight
        const spaceAbove = Math.max(0, rect.top - VIEWPORT_EDGE_GAP)
        const spaceBelow = Math.max(0, viewportHeight - rect.bottom - VIEWPORT_EDGE_GAP)
        const shouldOpenUpward = spaceBelow < DEFAULT_PANEL_MAX_HEIGHT && spaceAbove > spaceBelow
        const availableSpace = shouldOpenUpward ? spaceAbove : spaceBelow

        setOpenUpward(shouldOpenUpward)
        setPanelMaxHeight(Math.max(0, Math.min(DEFAULT_PANEL_MAX_HEIGHT, Math.floor(availableSpace))))
    }, [])

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false)
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    useLayoutEffect(() => {
        if (!isOpen) return

        updateDropdownPlacement()
        window.addEventListener('resize', updateDropdownPlacement)
        window.addEventListener('scroll', updateDropdownPlacement, true)

        return () => {
            window.removeEventListener('resize', updateDropdownPlacement)
            window.removeEventListener('scroll', updateDropdownPlacement, true)
        }
    }, [isOpen, updateDropdownPlacement])

    const handleToggleOpen = () => {
        if (isOpen) {
            setIsOpen(false)
            return
        }
        updateDropdownPlacement()
        setIsOpen(true)
    }

    const selectedModel = models.find((m) => m.value === value)
    const visibleCapabilityFields = capabilityFields.filter((field) => field.field !== 'generationMode')

    const resolveCapabilityLabel = useCallback((field: CapabilityFieldDefinition): string => {
        try {
            return tv(`capability.${field.field}` as never)
        } catch {
            return field.label
        }
    }, [tv])

    // Build summary text from capability overrides + defaults
    const paramSummary = visibleCapabilityFields
        .map((def) => {
            const val = capabilityOverrides[def.field] !== undefined
                ? String(capabilityOverrides[def.field])
                : (def.options.length > 0 ? formatValue(def.options[0], def.field) : '')
            return val
        })
        .concat(
            booleanToggles.map((toggle) => {
                if (toggle.value) return `${toggle.label}:${toggle.onLabel || 'On'}`
                return ''
            }),
        )
        .filter(Boolean)
        .join(' · ')
    const shouldShowParamSummary = !compact && paramSummary.length > 0

    const triggerPy = compact ? 'py-1' : 'py-2.5'
    const triggerPx = compact ? 'px-1.5' : 'px-3'
    const textSize = compact ? 'text-[11px]' : 'text-sm'
    const subTextSize = compact ? 'text-[9px]' : 'text-[11px]'
    const providerSize = compact ? 'text-[9px]' : 'text-[10px]'
    const modelOptionTextSize = compact ? 'text-[12px]' : 'text-sm'
    const modelOptionProviderSize = compact ? 'text-[9px] px-1 py-0.5' : 'text-[10px] px-1.5 py-0.5'
    const shouldShowProviderInTrigger = !compact
    const panelMinWidth = compact ? '260px' : '340px'

    return (
        <div className="relative" ref={ref}>
            <Button
                type="button"
                variant="outline"
                onClick={handleToggleOpen}
                className={`${triggerPx} ${triggerPy} h-auto w-full justify-between gap-2 bg-background text-left hover:bg-accent/30`}
            >
                <div className="min-w-0 flex-1">
                    {selectedModel ? (
                        <>
                            <div className="flex min-w-0 items-center gap-2">
                                <span className={`${textSize} min-w-0 flex-1 truncate font-medium text-foreground`}>
                                    {selectedModel.label}
                                </span>
                                {shouldShowProviderInTrigger && (selectedModel.providerName || selectedModel.provider) && (
                                    <span className={`${providerSize} max-w-[9rem] shrink-0 truncate whitespace-nowrap rounded border border-border px-1.5 py-0.5 text-muted-foreground`}>
                                        {selectedModel.providerName || selectedModel.provider || ''}
                                    </span>
                                )}
                            </div>
                            {shouldShowParamSummary && (
                                <div className={`${subTextSize} mt-0.5 truncate text-muted-foreground`}>
                                    {paramSummary}
                                </div>
                            )}
                        </>
                    ) : (
                        <span className={`${textSize} text-muted-foreground`}>
                            {placeholder || t('pleaseSelect')}
                        </span>
                    )}
                </div>
                <AppIcon name="chevronDown" className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </Button>

            {isOpen && (
                <div
                    className={`absolute left-0 right-0 z-50 flex flex-col overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-md ${openUpward ? 'bottom-full mb-1' : 'top-full mt-1'}`}
                    style={{
                        minWidth: panelMinWidth,
                        maxHeight: `${panelMaxHeight}px`,
                    }}
                >
                    <div className="p-3 pb-2 shrink-0">
                        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            {t('selectModel')}
                        </div>
                    </div>
                    <div className="px-3 pb-2 min-h-0 flex-1 overflow-y-auto custom-scrollbar">
                        <div className="space-y-1">
                            {models.map((m) => (
                                <Button
                                    key={m.value}
                                    type="button"
                                    onClick={() => {
                                        if (m.disabled) return
                                        onModelChange(m.value)
                                    }}
                                    disabled={m.disabled}
                                    variant={value === m.value ? 'secondary' : 'ghost'}
                                    className={`h-auto w-full justify-start gap-2 px-3 py-2 text-left ${m.disabled ? 'cursor-not-allowed opacity-60' : ''}`}
                                >
                                    <span className={`min-w-0 flex-1 truncate font-medium ${modelOptionTextSize}`}>{m.label}</span>
                                    {(m.providerName || m.provider) && (
                                        <span className={`${modelOptionProviderSize} max-w-[9rem] shrink-0 truncate whitespace-nowrap rounded border border-border text-muted-foreground`}>
                                            {m.providerName || m.provider || ''}
                                        </span>
                                    )}
                                </Button>
                            ))}
                        </div>
                    </div>

                    {(visibleCapabilityFields.length > 0 || booleanToggles.length > 0) && (
                        <div className="shrink-0 border-t border-border bg-background">
                            <div className="p-3 pt-2">
                                <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                    {t('paramConfig')}
                                </div>
                                <div className="max-h-[156px] overflow-y-auto custom-scrollbar pr-1">
                                    <div className="space-y-2.5">
                                        {visibleCapabilityFields.map((def) => {
                                            const currentVal = capabilityOverrides[def.field] !== undefined
                                                ? String(capabilityOverrides[def.field])
                                                : ''
                                            const isR = isRatioLike(def.field, def.options)
                                            const useSelect = shouldUseSelectControl(def.field, def.options)
                                            const fallbackOption = def.options[0]
                                            const selectValue = currentVal || String(fallbackOption)

                                            return (
                                                <div key={def.field} className="flex items-center justify-between gap-3">
                                                    <span className="shrink-0 text-xs font-medium text-muted-foreground">
                                                        {resolveCapabilityLabel(def)}
                                                    </span>
                                                    {def.options.length === 1 ? (
                                                        <span className="flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground">
                                                            {(() => {
                                                                const ratioValue = String(def.options[0])
                                                                return isR && isValidRatioText(ratioValue) ? <RatioIcon ratio={ratioValue} size={10} /> : null
                                                            })()}
                                                            {String(def.options[0])}
                                                            <span className="text-[10px] text-muted-foreground">({t('fixed')})</span>
                                                        </span>
                                                    ) : useSelect ? (
                                                        <Select
                                                            value={selectValue}
                                                            onValueChange={(nextValue) =>
                                                                onCapabilityChange(def.field, nextValue, def.options[0])}
                                                        >
                                                            <SelectTrigger className="h-7 min-w-[120px] px-2 text-[11px]">
                                                                <SelectValue />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {def.options.map((opt) => {
                                                                    const s = String(opt)
                                                                    return (
                                                                        <SelectItem key={s} value={s} className="text-[11px]">
                                                                            {s}
                                                                        </SelectItem>
                                                                    )
                                                                })}
                                                            </SelectContent>
                                                        </Select>
                                                    ) : (
                                                        <div className="flex overflow-hidden rounded-lg border border-border">
                                                            {def.options.map((opt) => {
                                                                const s = String(opt)
                                                                const disabled = isOptionDisabled(def, opt)
                                                                const on = currentVal ? s === currentVal : s === String(fallbackOption)
                                                                return (
                                                                    <Button
                                                                        key={s}
                                                                        type="button"
                                                                        size="sm"
                                                                        variant={on ? 'secondary' : 'ghost'}
                                                                        onClick={() => onCapabilityChange(def.field, s, def.options[0])}
                                                                        disabled={disabled}
                                                                        className={`h-6 rounded-none px-2 text-[11px] ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
                                                                    >
                                                                        {isR && isValidRatioText(s) && <RatioIcon ratio={s} size={10} selected={on} />}
                                                                        {s}
                                                                    </Button>
                                                                )
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            )
                                        })}
                                        {booleanToggles.map((toggle) => (
                                            <div key={toggle.key} className="flex items-center justify-between gap-3">
                                                <span className="shrink-0 text-xs font-medium text-muted-foreground">
                                                    {toggle.label}
                                                </span>
                                                <div className="flex overflow-hidden rounded-lg border border-border">
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant={toggle.value ? 'secondary' : 'ghost'}
                                                        onClick={() => toggle.onChange(true)}
                                                        className="h-6 rounded-none px-2 text-[11px]"
                                                    >
                                                        {toggle.onLabel || 'On'}
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant={!toggle.value ? 'secondary' : 'ghost'}
                                                        onClick={() => toggle.onChange(false)}
                                                        className="h-6 rounded-none px-2 text-[11px]"
                                                    >
                                                        {toggle.offLabel || 'Off'}
                                                    </Button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
