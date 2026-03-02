'use client'

import { useCallback, useMemo } from 'react'
import type { Character, SpeakerVoiceEntry, VoiceLine } from './types'

interface UseVoiceSpeakerStateParams {
  characters: Character[]
  voiceLines: VoiceLine[]
  projectSpeakers: string[]
  speakerVoices: Record<string, SpeakerVoiceEntry>
}

export function useVoiceSpeakerState({
  characters,
  voiceLines,
  projectSpeakers,
  speakerVoices,
}: UseVoiceSpeakerStateParams) {
  const matchCharacterBySpeaker = useCallback((speaker: string): Character | undefined => {
    const exactMatch = characters.find((character) => character.name === speaker)
    if (exactMatch) return exactMatch
    return characters.find((character) => character.name.includes(speaker) || speaker.includes(character.name))
  }, [characters])

  const speakerCharacterMap = useMemo(() => {
    const map: Record<string, Character> = {}
    const speakerSet = new Set<string>(voiceLines.map((line) => line.speaker))
    speakerSet.forEach((speaker) => {
      const character = matchCharacterBySpeaker(speaker)
      if (character) map[speaker] = character
    })
    return map
  }, [matchCharacterBySpeaker, voiceLines])

  const getSpeakerVoiceUrl = useCallback((speaker: string): string | null => {
    const character = speakerCharacterMap[speaker]
    if (character?.customVoiceUrl) return character.customVoiceUrl
    const speakerVoice = speakerVoices[speaker]
    if (speakerVoice?.audioUrl) return speakerVoice.audioUrl
    return null
  }, [speakerCharacterMap, speakerVoices])

  const hasSpeakerVoice = useCallback((speaker: string): boolean => {
    const character = speakerCharacterMap[speaker]
    if (character?.voiceId || character?.customVoiceUrl) return true
    const speakerVoice = speakerVoices[speaker]
    return !!speakerVoice?.voiceId || !!speakerVoice?.audioUrl
  }, [speakerCharacterMap, speakerVoices])

  const speakerStats = useMemo(() => {
    const stats: Record<string, number> = {}
    for (const line of voiceLines) {
      stats[line.speaker] = (stats[line.speaker] || 0) + 1
    }
    return stats
  }, [voiceLines])

  const speakers = useMemo(() => Object.keys(speakerStats), [speakerStats])

  const speakerOptions = useMemo(() => {
    const all = new Set<string>()
    projectSpeakers.forEach((speaker) => all.add(speaker))
    voiceLines.forEach((line) => all.add(line.speaker))
    characters.forEach((character) => {
      if (character.name) all.add(character.name)
    })
    return Array.from(all).filter(Boolean).sort((left, right) => left.localeCompare(right))
  }, [characters, projectSpeakers, voiceLines])

  const linesWithVoice = useMemo(() => (
    voiceLines.filter((line) => hasSpeakerVoice(line.speaker)).length
  ), [hasSpeakerVoice, voiceLines])

  const linesWithAudio = useMemo(() => (
    voiceLines.filter((line) => !!line.audioUrl).length
  ), [voiceLines])

  const allSpeakersHaveVoice = useMemo(() => (
    speakers.every((speaker) => hasSpeakerVoice(speaker))
  ), [hasSpeakerVoice, speakers])

  return {
    speakerCharacterMap,
    speakerStats,
    speakers,
    speakerOptions,
    matchCharacterBySpeaker,
    getSpeakerVoiceUrl,
    linesWithVoice,
    linesWithAudio,
    allSpeakersHaveVoice,
  }
}
