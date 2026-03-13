import { describe, expect, it } from 'vitest'
import { hasLoadedPanels, getPanels, getPanelCandidates } from '@/types/storyboard-types'
import { NovelPromotionStoryboard, NovelPromotionPanel } from '@/types/project'

describe('storyboard-types utils', () => {
    describe('hasLoadedPanels', () => {
        it('should return true when panels is an array', () => {
            const storyboard = {
                panels: []
            } as unknown as NovelPromotionStoryboard
            expect(hasLoadedPanels(storyboard)).toBe(true)
        })

        it('should return false when panels is missing', () => {
            const storyboard = {} as NovelPromotionStoryboard
            expect(hasLoadedPanels(storyboard)).toBe(false)
        })

        it('should return false when panels is not an array', () => {
            const storyboard = {
                panels: 'not an array'
            } as unknown as NovelPromotionStoryboard
            expect(hasLoadedPanels(storyboard)).toBe(false)
        })
    })

    describe('getPanels', () => {
        it('should return panels array when it exists', () => {
            const panels = [{ id: '1' }] as NovelPromotionPanel[]
            const storyboard = {
                panels
            } as unknown as NovelPromotionStoryboard
            expect(getPanels(storyboard)).toEqual(panels)
        })

        it('should return empty array when panels are missing', () => {
            const storyboard = {} as NovelPromotionStoryboard
            expect(getPanels(storyboard)).toEqual([])
        })

        it('should return empty array when panels exists but is not an array', () => {
            const storyboard = {
                panels: 'not an array'
            } as unknown as NovelPromotionStoryboard
            expect(getPanels(storyboard)).toEqual([])
        })
    })

    describe('getPanelCandidates', () => {
        it('should return empty array if imageHistory is null', () => {
            const panel = { imageHistory: null } as NovelPromotionPanel
            expect(getPanelCandidates(panel)).toEqual([])
        })

        it('should return empty array if imageHistory is undefined', () => {
            const panel = {} as NovelPromotionPanel
            expect(getPanelCandidates(panel)).toEqual([])
        })

        it('should return parsed array if imageHistory is a valid JSON array', () => {
            const images = ['url1', 'url2']
            const panel = { imageHistory: JSON.stringify(images) } as NovelPromotionPanel
            expect(getPanelCandidates(panel)).toEqual(images)
        })

        it('should return empty array if imageHistory is valid JSON but not an array', () => {
            const panel = { imageHistory: JSON.stringify({ not: 'an array' }) } as NovelPromotionPanel
            expect(getPanelCandidates(panel)).toEqual([])
        })

        it('should return empty array if imageHistory is malformed JSON', () => {
            const panel = { imageHistory: '{ invalid json' } as NovelPromotionPanel
            expect(getPanelCandidates(panel)).toEqual([])
        })
    })
})
