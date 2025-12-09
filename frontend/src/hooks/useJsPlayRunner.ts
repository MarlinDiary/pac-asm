import { useState, useRef, useCallback } from 'react'
import { GameMap } from '@/data/maps'
import { updateMapWithMovementAndGhosts } from '@/lib/game-animation'
import {
  createScoreTracker,
  computeScoreForMapTransition,
  formatScoreValue,
  ScoreTracker
} from '@/lib/score'
import { checkVictoryCondition } from '@/lib/game-animation'

/**
 * A simple JS-controlled play runner that randomly moves Pacman
 * Used for development/testing purposes
 */
export const useJsPlayRunner = () => {
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentMap, setCurrentMap] = useState<GameMap | null>(null)
  const [score, setScore] = useState(0)
  const scoreTrackerRef = useRef<ScoreTracker>(createScoreTracker())
  const abortControllerRef = useRef<AbortController | null>(null)

  const resetScore = useCallback(() => {
    setScore(0)
    scoreTrackerRef.current = createScoreTracker()
  }, [])

  const startRandomPlay = useCallback(async (initialMap: GameMap) => {
    console.log('[JS Random] Starting random play')

    // Cancel any existing play
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    const abortController = new AbortController()
    abortControllerRef.current = abortController

    resetScore()
    setCurrentMap(initialMap)
    setIsPlaying(true)

    let currentMapState = { ...initialMap }
    let previousMapState = { ...initialMap }
    let movementCount = 0

    // Run until victory, game over, or 300 moves
    while (movementCount < 300) {
      if (abortController.signal.aborted) {
        setIsPlaying(false)
        return { success: false, reason: 'aborted' }
      }

      // Delay before each move
      await new Promise(resolve => setTimeout(resolve, 400))

      // Random direction: 1=up, 2=down, 3=left, 4=right
      const randomDirection = Math.floor(Math.random() * 4) + 1
      console.log('[JS Random] Move', movementCount + 1, 'direction:', randomDirection)

      movementCount++
      currentMapState = updateMapWithMovementAndGhosts(currentMapState, randomDirection)

      // Update score
      const { tracker, victoryAchieved } = computeScoreForMapTransition(
        scoreTrackerRef.current,
        previousMapState,
        currentMapState
      )
      scoreTrackerRef.current = tracker
      setScore(tracker.score)

      // Check for game over
      if (currentMapState.gameOver) {
        setCurrentMap({ ...currentMapState })
        setIsPlaying(false)
        return { success: false, reason: 'game_over', moves: movementCount, score: tracker.score }
      }

      // Update UI
      setCurrentMap({ ...currentMapState })

      // Check victory
      if (victoryAchieved) {
        setIsPlaying(false)
        return { success: true, reason: 'victory', moves: movementCount, score: tracker.score }
      }

      previousMapState = { ...currentMapState }
    }

    setIsPlaying(false)
    return { success: false, reason: 'max_moves', moves: movementCount, score: scoreTrackerRef.current.score }
  }, [resetScore])

  const stopPlay = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    setIsPlaying(false)
  }, [])

  const reset = useCallback(() => {
    stopPlay()
    resetScore()
    setCurrentMap(null)
  }, [stopPlay, resetScore])

  return {
    isPlaying,
    currentMap,
    score,
    formattedScore: formatScoreValue(score),
    startRandomPlay,
    stopPlay,
    reset
  }
}
