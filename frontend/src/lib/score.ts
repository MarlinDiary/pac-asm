import { GameMap } from '@/data/maps'
import { checkVictoryCondition } from './game-animation'

const TURN_PENALTY = 1
const DOT_REWARD = 10
const VICTORY_BONUS = 200
const GHOST_PENALTY = 200
const SCORE_DIGITS = 4

interface ScoreRule {
  turnPenalty: number
  dotReward: number
  victoryBonus: number
  ghostPenalty: number
}

export interface ScoreTracker {
  score: number
  victoryBonusAwarded: boolean
}

export interface ScoreUpdateResult {
  tracker: ScoreTracker
  victoryAchieved: boolean
  ghostCaught: boolean
  dotsEaten: number
  scoreDelta: number
}

export const createScoreTracker = (): ScoreTracker => ({
  score: 0,
  victoryBonusAwarded: false
})

const getScoreRule = (map: GameMap): ScoreRule => {
  if (map.id === 'challenge') {
    return {
      turnPenalty: 0,
      dotReward: DOT_REWARD,
      victoryBonus: VICTORY_BONUS,
      ghostPenalty: 0
    }
  }

  return {
    turnPenalty: TURN_PENALTY,
    dotReward: DOT_REWARD,
    victoryBonus: VICTORY_BONUS,
    ghostPenalty: GHOST_PENALTY
  }
}

const countDots = (map: GameMap | null): number => {
  if (!map) return 0
  let count = 0
  for (let row = 0; row < map.height; row++) {
    for (let col = 0; col < map.width; col++) {
      if (map.tiles[row][col] === '.') {
        count++
      }
    }
  }
  return count
}

export const computeScoreForMapTransition = (
  tracker: ScoreTracker,
  previousMap: GameMap,
  currentMap: GameMap
): ScoreUpdateResult => {
  const scoreRule = getScoreRule(currentMap)
  const dotsBefore = countDots(previousMap)
  const dotsAfter = countDots(currentMap)
  const dotsEaten = Math.max(0, dotsBefore - dotsAfter)

  let scoreDelta = -scoreRule.turnPenalty
  if (dotsEaten > 0) {
    scoreDelta += dotsEaten * scoreRule.dotReward
  }

  const ghostCaught = Boolean(currentMap.gameOver && !previousMap.gameOver)
  if (ghostCaught) {
    scoreDelta -= scoreRule.ghostPenalty
  }

  const victoryAchieved = checkVictoryCondition(currentMap)
  let victoryBonusAwarded = tracker.victoryBonusAwarded
  if (victoryAchieved && !victoryBonusAwarded) {
    scoreDelta += scoreRule.victoryBonus
    victoryBonusAwarded = true
  }

  const nextScore = Math.max(0, tracker.score + scoreDelta)

  return {
    tracker: {
      score: nextScore,
      victoryBonusAwarded
    },
    victoryAchieved,
    ghostCaught,
    dotsEaten,
    scoreDelta
  }
}

export const formatScoreValue = (value: number): string => {
  return value.toString().padStart(SCORE_DIGITS, '0').slice(-SCORE_DIGITS)
}
