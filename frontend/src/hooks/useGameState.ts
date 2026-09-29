import { useState, useCallback, useRef, useEffect } from 'react'
import { GameMap, getPlayerPosition, getGhosts, getDots } from '@/data/maps'
import { createGhostTeleportAnimation } from '@/lib/game-animation'

export interface GameState {
  // Mode states
  isDebugMode: boolean
  isPlayMode: boolean
  isCodeDisabled: boolean
  playStatus: 'running' | 'pending' | undefined

  // Victory states
  hasWon: boolean // Ever won (permanent)
  currentPlayWon: boolean // This play won (temporary)
  shouldShakePlayer: boolean // Shake animation flag
  currentPlayGameOver: boolean // This play ended with death (temporary)
  currentPlayObjectiveNotMet: boolean // This play ended without accomplishing objective (temporary)
  
  // Code and map states
  currentCode: string
  codeOverride: string | null
  currentMap: GameMap
  highlightedLine: number | undefined
  highlightedLines: number[] | undefined
  highlightedLineSecondary: number | undefined
  breakpoints: number[]
  
  // Panel states
  leftPanelTab: number
  rightPanelTab: number
  memorySearchQuery: string
  hideZeroRows: boolean
  isFullscreen: boolean
}

export const useGameState = (initialMap: GameMap, initialCode: string = '') => {
  // Mode states
  const [isDebugMode, setIsDebugMode] = useState(false)
  const [isPlayMode, setIsPlayMode] = useState(false)
  const [isCodeDisabled, setIsCodeDisabled] = useState(false)
  const [playStatus, setPlayStatus] = useState<'running' | 'pending' | undefined>(undefined)
  
  // Victory states
  const [hasWon, setHasWon] = useState(false)
  const [currentPlayWon, setCurrentPlayWon] = useState(false)
  const [shouldShakePlayer, setShouldShakePlayer] = useState(false)
  const [currentPlayGameOver, setCurrentPlayGameOver] = useState(false)
  const [currentPlayObjectiveNotMet, setCurrentPlayObjectiveNotMet] = useState(false)
  
  // Code and map states
  const [currentCode, setCurrentCode] = useState(initialCode)
  const [codeOverride, setCodeOverride] = useState<string | null>(null)
  const [currentMap, setCurrentMap] = useState(initialMap)
  const [highlightedLine, setHighlightedLine] = useState<number | undefined>(undefined)
  const [highlightedLines, setHighlightedLines] = useState<number[] | undefined>(undefined)
  const [highlightedLineSecondary, setHighlightedLineSecondary] = useState<number | undefined>(undefined)
  const [breakpoints, setBreakpoints] = useState<number[]>([])
  
  // Panel states
  const [leftPanelTab, setLeftPanelTab] = useState(0)
  const [rightPanelTab, setRightPanelTab] = useState(0)
  const [memorySearchQuery, setMemorySearchQuery] = useState('')
  const [hideZeroRows, setHideZeroRows] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const teleportTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([])

  const clearTeleportTimeouts = useCallback(() => {
    teleportTimeoutsRef.current.forEach(clearTimeout)
    teleportTimeoutsRef.current = []
  }, [])

  // Helper function to teleport player and ghosts with animation
  const teleportPlayer = useCallback(async (targetMap: GameMap, currentPlayerPos?: { row: number; col: number; direction: string } | null) => {
    return await new Promise<void>((resolve) => {
      clearTeleportTimeouts()
      const targetPlayerPos = getPlayerPosition(targetMap)
      const currentGhostPositions = getGhosts(currentMap)
      const targetGhostPositions = getGhosts(targetMap)
      const currentDots = getDots(currentMap)
      const targetDots = getDots(targetMap)
    
    if (!targetPlayerPos) {
      setCurrentMap(targetMap)
      resolve()
      return
    }

    // Check if player position is actually changing
    const isPlayerPositionChanging = currentPlayerPos && (
      currentPlayerPos.row !== targetPlayerPos.row ||
      currentPlayerPos.col !== targetPlayerPos.col
    )

    // Check if any ghost positions are changing
    const isAnyGhostPositionChanging = currentGhostPositions.some((currentGhost, index) => {
      const targetGhost = targetGhostPositions[index]
      return targetGhost && (
        currentGhost.row !== targetGhost.row ||
        currentGhost.col !== targetGhost.col
      )
    })

    const removedDots = currentDots.filter(cd => !targetDots.some(td => td.row === cd.row && td.col === cd.col))
    const addedDots = targetDots.filter(td => !currentDots.some(cd => cd.row === td.row && cd.col === td.col))

    const isAnyDotChanging = removedDots.length > 0 || addedDots.length > 0

    if (!isPlayerPositionChanging && !isAnyGhostPositionChanging && !isAnyDotChanging) {
      setCurrentMap(targetMap)
      resolve()
      return
    }

    // Start fade out at current positions
    if (currentPlayerPos || isAnyGhostPositionChanging || isAnyDotChanging) {
      // Create ghost fade-out animations for ghosts that are moving
      const ghostFadeOutAnimations = currentGhostPositions.map((currentGhost, index) => {
        const targetGhost = targetGhostPositions[index]
        if (targetGhost && (currentGhost.row !== targetGhost.row || currentGhost.col !== targetGhost.col)) {
          return createGhostTeleportAnimation('right', 'fade-out')
        }
        return { shouldAnimate: false } // Provide default animation state for non-moving ghosts
      })

      setCurrentMap({
        ...currentMap,
        playerAnimation: isPlayerPositionChanging ? {
          direction: (currentPlayerPos.direction as 'up' | 'down' | 'left' | 'right') || 'right',
          teleportAnimation: 'fade-out'
        } : undefined,
        ghostAnimations: ghostFadeOutAnimations,
        dotAnimations: removedDots.map(d => ({ row: d.row, col: d.col, teleportAnimation: 'fade-out' }))
      })

      // After fade out, move to new position and fade in
      const fadeOutTimeout = setTimeout(() => {
        // Create ghost fade-in animations
        const ghostFadeInAnimations = targetGhostPositions.map((targetGhost, index) => {
          const currentGhost = currentGhostPositions[index]
          if (currentGhost && (currentGhost.row !== targetGhost.row || currentGhost.col !== targetGhost.col)) {
            return createGhostTeleportAnimation('right', 'fade-in')
          }
          return { shouldAnimate: false } // Provide default animation state for non-moving ghosts
        })

        setCurrentMap({
          ...targetMap,
          playerAnimation: isPlayerPositionChanging ? {
            direction: targetPlayerPos.direction,
            teleportAnimation: 'fade-in'
          } : undefined,
          ghostAnimations: ghostFadeInAnimations,
          dotAnimations: addedDots.map(d => ({ row: d.row, col: d.col, teleportAnimation: 'fade-in' }))
        })

        // Remove animation after fade in
        const settleTimeout = setTimeout(() => {
          setCurrentMap({ ...targetMap, dotAnimations: undefined })
          clearTeleportTimeouts()
          resolve()
        }, 150)
        teleportTimeoutsRef.current.push(settleTimeout)
      }, 150)
      teleportTimeoutsRef.current.push(fadeOutTimeout)
    } else {
      setCurrentMap(targetMap)
      clearTeleportTimeouts()
      resolve()
    }
    })
  }, [clearTeleportTimeouts, currentMap])

  useEffect(() => {
    return () => {
      clearTeleportTimeouts()
    }
  }, [clearTeleportTimeouts])

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen()
      setIsFullscreen(true)
    } else {
      document.exitFullscreen()
      setIsFullscreen(false)
    }
  }, [])

  const resetGameState = useCallback(() => {
    setIsDebugMode(false)
    setIsPlayMode(false)
    setIsCodeDisabled(false)
    setPlayStatus(undefined)
    setCurrentPlayWon(false)
    setCurrentPlayObjectiveNotMet(false)
    setHighlightedLine(undefined)
    setHighlightedLines(undefined)
    setHighlightedLineSecondary(undefined)
    
    const currentPlayerPos = getPlayerPosition(currentMap)
    teleportPlayer(initialMap, currentPlayerPos)
  }, [initialMap, currentMap, teleportPlayer])

  return {
    // States
    isDebugMode,
    isPlayMode,
    isCodeDisabled,
    playStatus,
    hasWon,
    currentPlayWon,
    shouldShakePlayer,
    currentPlayGameOver,
    currentPlayObjectiveNotMet,
    currentCode,
    codeOverride,
    currentMap,
    highlightedLine,
    highlightedLines,
    highlightedLineSecondary,
    breakpoints,
    leftPanelTab,
    rightPanelTab,
    memorySearchQuery,
    hideZeroRows,
    isFullscreen,
    
    // Setters
    setIsDebugMode,
    setIsPlayMode,
    setIsCodeDisabled,
    setPlayStatus,
    setHasWon,
    setCurrentPlayWon,
    setShouldShakePlayer,
    setCurrentPlayGameOver,
    setCurrentPlayObjectiveNotMet,
    setCurrentCode,
    setCodeOverride,
    setCurrentMap,
    setHighlightedLine,
    setHighlightedLines,
    setHighlightedLineSecondary,
    setBreakpoints,
    setLeftPanelTab,
    setRightPanelTab,
    setMemorySearchQuery,
    setHideZeroRows,
    
    // Helper functions
    teleportPlayer,
    toggleFullscreen,
    resetGameState
  }
}
