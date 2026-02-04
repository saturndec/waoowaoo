'use client'

import React, { useMemo, useRef, useEffect, useCallback } from 'react'
import { Player, PlayerRef } from '@remotion/player'
import { VideoComposition } from '../../remotion/VideoComposition'
import { VideoEditorProject } from '../../types/editor.types'
import { calculateTimelineDuration } from '../../utils/time-utils'

interface RemotionPreviewProps {
    project: VideoEditorProject
    currentFrame: number
    playing: boolean
    onFrameChange?: (frame: number) => void
    onPlayingChange?: (playing: boolean) => void
}

/**
 * Remotion Player 预览封装
 * 支持双向同步：timelineState ↔ Player
 */
export const RemotionPreview: React.FC<RemotionPreviewProps> = ({
    project,
    currentFrame,
    playing,
    onFrameChange,
    onPlayingChange
}) => {
    const playerRef = useRef<PlayerRef>(null)
    const lastSyncedFrame = useRef<number>(0)

    const totalDuration = useMemo(
        () => calculateTimelineDuration(project.timeline),
        [project.timeline]
    )

    // 当 currentFrame 从外部改变时，同步到 Player
    useEffect(() => {
        const player = playerRef.current
        if (!player) return

        // 避免循环更新：只有当帧差距大于 1 时才 seek
        if (Math.abs(currentFrame - lastSyncedFrame.current) > 1) {
            player.seekTo(currentFrame)
            lastSyncedFrame.current = currentFrame
        }
    }, [currentFrame])

    // 当 playing 状态改变时，控制 Player 播放/暂停
    useEffect(() => {
        const player = playerRef.current
        if (!player) return

        if (playing) {
            player.play()
        } else {
            player.pause()
        }
    }, [playing])

    // 监听 Player 的帧变化，同步到 timelineState
    useEffect(() => {
        const player = playerRef.current
        if (!player) return

        const handleFrameUpdate = () => {
            const frame = player.getCurrentFrame()
            lastSyncedFrame.current = frame
            onFrameChange?.(frame)
        }

        // Remotion Player 触发 timeupdate 事件
        player.addEventListener('frameupdate', handleFrameUpdate)

        return () => {
            player.removeEventListener('frameupdate', handleFrameUpdate)
        }
    }, [onFrameChange])

    // 监听 Player 播放状态变化
    useEffect(() => {
        const player = playerRef.current
        if (!player) return

        const handlePlay = () => onPlayingChange?.(true)
        const handlePause = () => onPlayingChange?.(false)
        const handleEnded = () => onPlayingChange?.(false)

        player.addEventListener('play', handlePlay)
        player.addEventListener('pause', handlePause)
        player.addEventListener('ended', handleEnded)

        return () => {
            player.removeEventListener('play', handlePlay)
            player.removeEventListener('pause', handlePause)
            player.removeEventListener('ended', handleEnded)
        }
    }, [onPlayingChange])

    // 如果没有片段，显示占位
    if (project.timeline.length === 0) {
        return (
            <div style={{
                width: '100%',
                aspectRatio: `${project.config.width} / ${project.config.height}`,
                maxHeight: '100%',
                background: '#1a1a1a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '8px',
                color: '#666'
            }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '48px', marginBottom: '12px' }}>🎬</div>
                    <span>添加素材开始编辑</span>
                </div>
            </div>
        )
    }

    return (
        <div style={{
            width: '100%',
            aspectRatio: `${project.config.width} / ${project.config.height}`,
            maxHeight: '100%',
            background: '#000',
            borderRadius: '8px',
            overflow: 'hidden'
        }}>
            <Player
                ref={playerRef}
                component={VideoComposition}
                inputProps={{
                    clips: project.timeline,
                    bgmTrack: project.bgmTrack,
                    config: project.config
                }}
                durationInFrames={Math.max(1, totalDuration)}
                fps={project.config.fps}
                compositionWidth={project.config.width}
                compositionHeight={project.config.height}
                style={{
                    width: '100%',
                    height: '100%'
                }}
                controls={false}  // 使用自定义控制
                loop={false}
                clickToPlay={false}  // 禁用点击播放，由外部控制
            />
        </div>
    )
}

export default RemotionPreview
