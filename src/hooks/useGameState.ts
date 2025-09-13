import { useState, useCallback } from 'react'
import { GameMap, getPlayerPosition, getGhosts, getDots } from '@/data/maps'
import { createGhostTeleportAnimation } from '@/lib/game-animation'

export interface GameState {
  // Mode states
  isDebugMode: boolean
  isPlayMode: boolean
  isCodeDisabled: boolean
  playStatus: 'running' | undefined
  
  // Victory states  
  hasWon: boolean // Ever won (permanent)
  currentPlayWon: boolean // This play won (temporary)
  
  // Code and map states
  currentCode: string
  currentMap: GameMap
  highlightedLine: number | undefined
  
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
  const [playStatus, setPlayStatus] = useState<'running' | undefined>(undefined)
  
  // Victory states
  const [hasWon, setHasWon] = useState(false)
  const [currentPlayWon, setCurrentPlayWon] = useState(false)
  
  // Code and map states
  const [currentCode, setCurrentCode] = useState(initialCode)
  const [currentMap, setCurrentMap] = useState(initialMap)
  const [highlightedLine, setHighlightedLine] = useState<number | undefined>(undefined)
  
  // Panel states
  const [leftPanelTab, setLeftPanelTab] = useState(0)
  const [rightPanelTab, setRightPanelTab] = useState(0)
  const [memorySearchQuery, setMemorySearchQuery] = useState('')
  const [hideZeroRows, setHideZeroRows] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Helper function to teleport player and ghosts with animation
  const teleportPlayer = useCallback(async (targetMap: GameMap, currentPlayerPos?: { row: number; col: number; direction: string } | null) => {
    return await new Promise<void>((resolve) => {
      const targetPlayerPos = getPlayerPosition(targetMap)
      const currentGhostPositions = getGhosts(currentMap)
      const targetGhostPositions = getGhosts(targetMap)
      const currentDots = getDots(currentMap)
      const targetDots = getDots(targetMap)
    
    if (!targetPlayerPos) {
      setCurrentMap(targetMap)
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
      setTimeout(() => {
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
        setTimeout(() => {
          setCurrentMap({ ...targetMap, dotAnimations: undefined })
          resolve()
        }, 150)
      }, 150)
    } else {
      setCurrentMap(targetMap)
      resolve()
    }
    })
  }, [currentMap])

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
    setHighlightedLine(undefined)
    
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
    currentCode,
    currentMap,
    highlightedLine,
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
    setCurrentCode,
    setCurrentMap,
    setHighlightedLine,
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
