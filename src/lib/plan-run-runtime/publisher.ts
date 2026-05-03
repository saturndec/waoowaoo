import type { PlanRunEventInput } from './types'
import { appendPlanRunEventWithSeq } from './service'

export async function publishPlanRunEvent(input: PlanRunEventInput) {
  const event = await appendPlanRunEventWithSeq(input)
  return {
    id: event.id,
    planRunId: event.planRunId,
    seq: event.seq,
    eventType: event.eventType,
    createdAt: event.createdAt,
  }
}
