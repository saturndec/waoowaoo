import React from 'react'
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion'

interface TransitionWrapperProps {
    type: 'dissolve' | 'fade' | 'slide' | 'none'
    durationInFrames: number
    isEntering: boolean  // true = entering transition, false = exiting
    children: React.ReactNode
}

/**
 * 转场效果包装器
 * 为片段添加进入/退出动画
 */
export const TransitionWrapper: React.FC<TransitionWrapperProps> = ({
    type,
    durationInFrames,
    isEntering,
    children
}) => {
    const frame = useCurrentFrame()

    if (type === 'none') {
        return <AbsoluteFill>{children}</AbsoluteFill>
    }

    const progress = isEntering
        ? interpolate(frame, [0, durationInFrames], [0, 1], { extrapolateRight: 'clamp' })
        : interpolate(frame, [0, durationInFrames], [1, 0], { extrapolateRight: 'clamp' })

    const getTransitionStyle = (): React.CSSProperties => {
        switch (type) {
            case 'dissolve':
            case 'fade':
                return { opacity: progress }

            case 'slide':
                const translateX = isEntering
                    ? interpolate(progress, [0, 1], [100, 0])
                    : interpolate(progress, [1, 0], [0, -100])
                return {
                    transform: `translateX(${translateX}%)`,
                    opacity: 1
                }

            default:
                return {}
        }
    }

    return (
        <AbsoluteFill style={getTransitionStyle()}>
            {children}
        </AbsoluteFill>
    )
}

/**
 * 淡入淡出转场
 */
export const CrossDissolve: React.FC<{
    durationInFrames: number
    children: React.ReactNode
}> = ({ durationInFrames, children }) => {
    const frame = useCurrentFrame()
    const opacity = interpolate(
        frame,
        [0, durationInFrames],
        [0, 1],
        { extrapolateRight: 'clamp' }
    )

    return (
        <AbsoluteFill style={{ opacity }}>
            {children}
        </AbsoluteFill>
    )
}

/**
 * 滑动转场
 */
export const SlideTransition: React.FC<{
    direction: 'left' | 'right' | 'up' | 'down'
    durationInFrames: number
    children: React.ReactNode
}> = ({ direction, durationInFrames, children }) => {
    const frame = useCurrentFrame()

    const getTransform = () => {
        const progress = interpolate(
            frame,
            [0, durationInFrames],
            [100, 0],
            { extrapolateRight: 'clamp' }
        )

        switch (direction) {
            case 'left': return `translateX(${progress}%)`
            case 'right': return `translateX(-${progress}%)`
            case 'up': return `translateY(${progress}%)`
            case 'down': return `translateY(-${progress}%)`
        }
    }

    return (
        <AbsoluteFill style={{ transform: getTransform() }}>
            {children}
        </AbsoluteFill>
    )
}

export default { TransitionWrapper, CrossDissolve, SlideTransition }
