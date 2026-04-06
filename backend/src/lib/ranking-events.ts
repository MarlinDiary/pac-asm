import { Architecture } from '../game/emulator/types'

export interface RankingUpdateEvent {
  levelId: string
  architecture: Architecture
  submissionId: string
  userId: string
  updatedAt: string
}

type RankingUpdateListener = (event: RankingUpdateEvent) => void

const listeners = new Set<RankingUpdateListener>()

export function publishRankingUpdate(event: RankingUpdateEvent) {
  for (const listener of Array.from(listeners)) {
    try {
      listener(event)
    } catch (error) {
      console.error('[RankingEvents] Failed to deliver ranking update', error)
    }
  }
}

export function subscribeToRankingUpdates(listener: RankingUpdateListener) {
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
  }
}
