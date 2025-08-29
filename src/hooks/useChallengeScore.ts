import { useState, useEffect, useCallback, useRef } from 'react'
import { GameMap } from '@/data/maps'

interface ScoreEvents {
  dotEaten: number  // Number of dots eaten
  allDotsEaten: boolean
  caughtByGhost: boolean
  turnExecuted: boolean
}

export function useChallengeScore(
  isChallenge: boolean,
  gameState: {
    currentMap: GameMap
    isPlayMode: boolean
    hasWon: boolean
    currentPlayWon: boolean
  }
) {
  const [score, setScore] = useState(0)
  const [previousMapState, setPreviousMapState] = useState<GameMap | null>(null)
  const previousPlayerPosRef = useRef<{row: number, col: number} | null>(null)
  const hasDetectedGhostCatchRef = useRef(false)
  const hasCompletedLevelRef = useRef(false)

  // Count dots in the current map
  const countDots = useCallback((map: GameMap) => {
    let count = 0
    for (let row = 0; row < map.height; row++) {
      for (let col = 0; col < map.width; col++) {
        const tile = map.tiles[row][col]
        if (tile === '.' || tile === 'o') {  // dot or energizer
          count++
        }
      }
    }
    return count
  }, [])

  // Detect score events
  const detectScoreEvents = useCallback((currentMap: GameMap, prevMap: GameMap | null): ScoreEvents => {
    const events: ScoreEvents = {
      dotEaten: 0,
      allDotsEaten: false,
      caughtByGhost: false,
      turnExecuted: false
    }

    if (!prevMap) return events

    // Check if dots were eaten by comparing tile states
    const currentDots = countDots(currentMap)
    const prevDots = countDots(prevMap)
    const dotsEaten = prevDots - currentDots
    
    if (dotsEaten > 0) {
      events.dotEaten = dotsEaten
      // Check if all dots are eaten
      if (currentDots === 0) {
        events.allDotsEaten = true
      }
    }

    // Check if caught by ghost
    // This happens when player position overlaps with any ghost position
    if (currentMap.playerPosition && currentMap.ghostPositions) {
      for (const ghost of currentMap.ghostPositions) {
        if (ghost.row === currentMap.playerPosition.row && 
            ghost.col === currentMap.playerPosition.col) {
          // Only count it once per catch (not every frame)
          if (!hasDetectedGhostCatchRef.current) {
            events.caughtByGhost = true
            hasDetectedGhostCatchRef.current = true
          }
          break
        }
      }
      // Reset ghost catch detection when player moves away from ghosts
      const playerSafe = !currentMap.ghostPositions.some(ghost => 
        ghost.row === currentMap.playerPosition.row && 
        ghost.col === currentMap.playerPosition.col
      )
      if (playerSafe) {
        hasDetectedGhostCatchRef.current = false
      }
    }

    // Check if a turn was executed (player position changed)
    if (currentMap.playerPosition && prevMap.playerPosition) {
      if (currentMap.playerPosition.row !== prevMap.playerPosition.row ||
          currentMap.playerPosition.col !== prevMap.playerPosition.col) {
        events.turnExecuted = true
      }
    }

    return events
  }, [countDots])

  // Update score based on events
  const updateScore = useCallback((events: ScoreEvents) => {
    if (!isChallenge) return

    let scoreChange = 0

    // Add points for eating dots (10 points per dot)
    if (events.dotEaten > 0) {
      scoreChange += events.dotEaten * 10
    }
    
    // Add bonus for completing level (eating all dots)
    if (events.allDotsEaten && !hasCompletedLevelRef.current) {
      scoreChange += 200
      hasCompletedLevelRef.current = true
    }
    
    // Subtract points for being caught by ghost
    if (events.caughtByGhost) {
      scoreChange -= 200
    }
    
    // Subtract 1 point per turn
    if (events.turnExecuted) {
      scoreChange -= 1
    }

    if (scoreChange !== 0) {
      setScore(prev => Math.max(0, prev + scoreChange)) // Don't go below 0
    }
  }, [isChallenge])

  // Reset score when starting a new game
  useEffect(() => {
    if (!isChallenge) return
    
    // When play mode starts, reset the score
    if (gameState.isPlayMode && previousMapState === null) {
      setScore(0)
      hasCompletedLevelRef.current = false
      hasDetectedGhostCatchRef.current = false
    }
  }, [isChallenge, gameState.isPlayMode, previousMapState])

  // Monitor game state changes
  useEffect(() => {
    if (!isChallenge) return
    
    // Reset completion flag when game stops
    if (!gameState.isPlayMode) {
      hasCompletedLevelRef.current = false
      hasDetectedGhostCatchRef.current = false
      setPreviousMapState(null)
      previousPlayerPosRef.current = null
      return
    }

    const events = detectScoreEvents(gameState.currentMap, previousMapState)
    updateScore(events)
    
    // Update previous state for next comparison
    setPreviousMapState(JSON.parse(JSON.stringify(gameState.currentMap)))
    
    // Store previous player position
    if (gameState.currentMap.playerPosition) {
      previousPlayerPosRef.current = {
        row: gameState.currentMap.playerPosition.row,
        col: gameState.currentMap.playerPosition.col
      }
    }
  }, [
    isChallenge,
    gameState.currentMap,
    gameState.isPlayMode,
    detectScoreEvents,
    updateScore
  ])

  // Check for level completion bonus using currentPlayWon
  // This ensures we catch the win condition even if we miss the moment when last dot is eaten
  useEffect(() => {
    if (isChallenge && gameState.currentPlayWon && !hasCompletedLevelRef.current) {
      // Award completion bonus when level is won (if not already awarded)
      // The bonus might have already been given in updateScore when all dots were eaten
      // This is a safety net to ensure the bonus is always given
      setScore(prev => Math.max(0, prev + 200))
      hasCompletedLevelRef.current = true
    }
  }, [isChallenge, gameState.currentPlayWon])

  // Format score as 4-digit string
  const formatScore = useCallback((score: number): string => {
    return score.toString().padStart(4, '0').slice(-4)
  }, [])

  return {
    score,
    formattedScore: formatScore(score),
    resetScore: () => setScore(0)
  }
}