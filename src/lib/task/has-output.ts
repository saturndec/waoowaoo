import { prisma } from '@/lib/prisma'

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function parseJsonStringArray(raw: string | null | undefined): string[] {
  if (!raw || typeof raw !== 'string') return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => isNonEmptyString(item))
  } catch {
    return []
  }
}

function hasUrlList(raw: string | null | undefined) {
  return parseJsonStringArray(raw).length > 0
}

function parseCompositeTargetId(targetId: string): string[] {
  return targetId.split(':').map((item) => item.trim()).filter(Boolean)
}

export async function hasCharacterAppearanceOutput(params: {
  appearanceId?: string | null
  characterId?: string | null
  appearanceIndex?: number | null
}) {
  if (isNonEmptyString(params.appearanceId)) {
    const row = await prisma.characterAppearance.findUnique({
      where: { id: params.appearanceId },
      select: {
        imageUrl: true,
        imageUrls: true,
        imageMediaId: true,
      },
    })
    if (!row) return false
    return isNonEmptyString(row.imageUrl) || !!row.imageMediaId || hasUrlList(row.imageUrls)
  }

  if (!isNonEmptyString(params.characterId)) return false
  const row = await prisma.characterAppearance.findFirst({
    where: {
      characterId: params.characterId,
      ...(typeof params.appearanceIndex === 'number'
        ? { appearanceIndex: params.appearanceIndex }
        : {}),
    },
    select: {
      imageUrl: true,
      imageUrls: true,
      imageMediaId: true,
    },
  })
  if (!row) return false
  return isNonEmptyString(row.imageUrl) || !!row.imageMediaId || hasUrlList(row.imageUrls)
}

export async function hasLocationImageOutput(params: {
  imageId?: string | null
  locationId?: string | null
  imageIndex?: number | null
}) {
  if (isNonEmptyString(params.imageId)) {
    const row = await prisma.locationImage.findUnique({
      where: { id: params.imageId },
      select: {
        imageUrl: true,
        imageMediaId: true,
      },
    })
    if (!row) return false
    return isNonEmptyString(row.imageUrl) || !!row.imageMediaId
  }

  if (!isNonEmptyString(params.locationId)) return false
  const row = await prisma.locationImage.findFirst({
    where: {
      locationId: params.locationId,
      ...(typeof params.imageIndex === 'number' ? { imageIndex: params.imageIndex } : {}),
    },
    select: {
      imageUrl: true,
      imageMediaId: true,
    },
  })
  if (!row) return false
  return isNonEmptyString(row.imageUrl) || !!row.imageMediaId
}

export async function hasPanelImageOutput(panelId: string | null | undefined) {
  if (!isNonEmptyString(panelId)) return false
  const panel = await prisma.projectPanel.findUnique({
    where: { id: panelId },
    select: {
      imageUrl: true,
      imageMediaId: true,
    },
  })
  if (!panel) return false
  return isNonEmptyString(panel.imageUrl) || !!panel.imageMediaId
}

export async function hasPanelVideoOutput(panelId: string | null | undefined) {
  if (!isNonEmptyString(panelId)) return false
  const panel = await prisma.projectPanel.findUnique({
    where: { id: panelId },
    select: {
      videoUrl: true,
      videoMediaId: true,
    },
  })
  if (!panel) return false
  return isNonEmptyString(panel.videoUrl) || !!panel.videoMediaId
}

export async function hasVideoGroupOutput(groupId: string | null | undefined) {
  if (!isNonEmptyString(groupId)) return false
  const group = await prisma.projectVideoGroup.findUnique({
    where: { id: groupId },
    select: {
      videoUrl: true,
      videoMediaId: true,
    },
  })
  if (!group) return false
  return isNonEmptyString(group.videoUrl) || !!group.videoMediaId
}

export async function hasPanelLipSyncOutput(panelId: string | null | undefined) {
  if (!isNonEmptyString(panelId)) return false
  const panel = await prisma.projectPanel.findUnique({
    where: { id: panelId },
    select: {
      lipSyncVideoUrl: true,
      lipSyncVideoMediaId: true,
    },
  })
  if (!panel) return false
  return isNonEmptyString(panel.lipSyncVideoUrl) || !!panel.lipSyncVideoMediaId
}

export async function hasVoiceLineAudioOutput(lineId: string | null | undefined) {
  if (!isNonEmptyString(lineId)) return false
  const line = await prisma.projectVoiceLine.findUnique({
    where: { id: lineId },
    select: {
      audioUrl: true,
      audioMediaId: true,
    },
  })
  if (!line) return false
  return isNonEmptyString(line.audioUrl) || !!line.audioMediaId
}

export async function hasGlobalCharacterOutput(params: {
  characterId?: string | null
  appearanceIndex?: number | null
}) {
  if (!isNonEmptyString(params.characterId)) return false
  const appearance = await prisma.globalCharacterAppearance.findFirst({
    where: {
      characterId: params.characterId,
      ...(typeof params.appearanceIndex === 'number'
        ? { appearanceIndex: params.appearanceIndex }
        : {}),
    },
    select: {
      imageUrl: true,
      imageUrls: true,
      imageMediaId: true,
    },
  })
  if (!appearance) return false
  return (
    isNonEmptyString(appearance.imageUrl) ||
    !!appearance.imageMediaId ||
    hasUrlList(appearance.imageUrls)
  )
}

export async function hasGlobalLocationOutput(params: {
  locationId?: string | null
  imageIndex?: number | null
}) {
  if (!isNonEmptyString(params.locationId)) return false
  const image = await prisma.globalLocationImage.findFirst({
    where: {
      locationId: params.locationId,
      ...(typeof params.imageIndex === 'number' ? { imageIndex: params.imageIndex } : {}),
    },
    select: {
      imageUrl: true,
      imageMediaId: true,
    },
  })
  if (!image) return false
  return isNonEmptyString(image.imageUrl) || !!image.imageMediaId
}

export async function hasGlobalCharacterAppearanceOutput(params: {
  targetId?: string | null
  characterId?: string | null
  appearanceIndex?: number | null
  imageIndex?: number | null
}) {
  let characterId = params.characterId || null
  let appearanceIndex = params.appearanceIndex ?? null
  let imageIndex = params.imageIndex ?? null

  if (isNonEmptyString(params.targetId)) {
    const parts = parseCompositeTargetId(params.targetId)
    if (parts[0]) characterId = parts[0]
    if (parts[1] && Number.isFinite(Number(parts[1]))) appearanceIndex = Number(parts[1])
    if (parts[2] && Number.isFinite(Number(parts[2]))) imageIndex = Number(parts[2])
  }

  if (!isNonEmptyString(characterId) || typeof appearanceIndex !== 'number') return false
  const appearance = await prisma.globalCharacterAppearance.findFirst({
    where: {
      characterId,
      appearanceIndex,
    },
    select: {
      imageUrl: true,
      imageUrls: true,
      imageMediaId: true,
      selectedIndex: true,
    },
  })
  if (!appearance) return false
  if (isNonEmptyString(appearance.imageUrl) || !!appearance.imageMediaId) return true

  const imageUrls = parseJsonStringArray(appearance.imageUrls)
  if (imageUrls.length === 0) return false
  if (typeof imageIndex === 'number') {
    return isNonEmptyString(imageUrls[imageIndex] || null)
  }
  if (typeof appearance.selectedIndex === 'number') {
    return isNonEmptyString(imageUrls[appearance.selectedIndex] || null)
  }
  return imageUrls.some((url) => isNonEmptyString(url))
}

export async function hasGlobalLocationImageOutput(params: {
  targetId?: string | null
  locationId?: string | null
  imageIndex?: number | null
}) {
  let locationId = params.locationId || null
  let imageIndex = params.imageIndex ?? null
  if (isNonEmptyString(params.targetId)) {
    const parts = parseCompositeTargetId(params.targetId)
    if (parts[0]) locationId = parts[0]
    if (parts[1] && Number.isFinite(Number(parts[1]))) imageIndex = Number(parts[1])
  }

  if (!isNonEmptyString(locationId) || typeof imageIndex !== 'number') return false
  const image = await prisma.globalLocationImage.findFirst({
    where: {
      locationId,
      imageIndex,
    },
    select: {
      imageUrl: true,
      imageMediaId: true,
    },
  })
  if (!image) return false
  return isNonEmptyString(image.imageUrl) || !!image.imageMediaId
}
