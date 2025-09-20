import { useCallback, useEffect } from 'react'
import { GameMap, getPlayerPosition } from '@/data/maps'
import { useDebugger } from './useDebugger'
import { usePlayRunner } from './usePlayRunner'
import { useGameState } from './useGameState'
import { ensurePlayerAnimation, checkVictoryCondition } from '@/lib/game-animation'

interface UseExecutionControlProps {
  gameState: ReturnType<typeof useGameState>
  levelMap: GameMap
}

const handleVictoryCheck = (
  map: GameMap,
  setHasWon: (won: boolean) => void,
  setCurrentPlayWon: (won: boolean) => void,
  isPlayMode: boolean
) => {
  if (!isPlayMode) {
    return
  }
  if (checkVictoryCondition(map)) {
    setHasWon(true)
    setCurrentPlayWon(true)
  }
}

export const useExecutionControl = ({ gameState, levelMap }: UseExecutionControlProps) => {
  const debugState = useDebugger()
  const playState = usePlayRunner()

  const {
    currentCode,
    setIsCodeDisabled,
    setIsDebugMode,
    setIsPlayMode,
    setPlayStatus,
    setHasWon,
    setCurrentPlayWon,
    setHighlightedLine,
    setHighlightedLineSecondary,
    setCurrentMap,
    setCodeOverride,
    teleportPlayer,
    isPlayMode,
    isDebugMode
  } = gameState

  const handlePlayClick = useCallback(async () => {
    // Use level map as-is (disable Level 4 dot randomization)
    const randomizedMap = levelMap

    // Reset map to initial state before starting play with teleport animation
    const currentPlayerPos = getPlayerPosition(gameState.currentMap)
    await teleportPlayer(randomizedMap, currentPlayerPos)
    setHighlightedLine(undefined)
    setHighlightedLineSecondary(undefined)
    setCurrentPlayWon(false) // Reset current play victory status
    // Don't clear hasWon - keep Next button permanently after first victory
    
    setCodeOverride(null)
    setIsCodeDisabled(true)
    setIsPlayMode(true)
    setPlayStatus('running') // Show "Running..." immediately
    
    const result = await playState.startPlay(currentCode, randomizedMap)
    if (!result.success && result.error) {
      // Handle error - reset UI state
      setIsCodeDisabled(false)
      setIsPlayMode(false)
      setPlayStatus(undefined)
      // Play failure already handled by diagnostics
    } else if (!result.success && !result.error) {
      // User cancelled - reset UI state without error
      setIsCodeDisabled(false)
      setIsPlayMode(false)
      setPlayStatus(undefined)
    }
  }, [currentCode, levelMap, gameState.currentMap, teleportPlayer, setHighlightedLine, setHighlightedLineSecondary, setCurrentPlayWon, setIsCodeDisabled, setIsPlayMode, setPlayStatus, setCodeOverride, playState])

  const handleDebugClick = useCallback(async () => {
    // Use level map as-is (disable Level 4 dot randomization)
    const randomizedMap = levelMap

    // Reset map to initial state before starting debug with teleport animation
    const currentPlayerPos = getPlayerPosition(gameState.currentMap)
    await teleportPlayer(randomizedMap, currentPlayerPos)
    setHighlightedLine(undefined)
    // Don't clear hasWon - keep Next button permanently after first victory
    
    setIsDebugMode(true)
    setIsCodeDisabled(true)
    
    const result = await debugState.startDebugLazy(currentCode, randomizedMap) // Use lazy debug initialization
    if (result.success && result.initialState) {
      if (result.reorderedView) {
        setCodeOverride(result.reorderedView.transformedSource)
      } else {
        setCodeOverride(null)
      }
      setCurrentMap(result.initialState.mapState)
      setHighlightedLine(result.initialState.highlightedLine)
      setHighlightedLineSecondary(result.initialState.highlightedLineSecondary)
    } else {
      // Handle error silently - just reset UI state
      setIsDebugMode(false)
      setIsCodeDisabled(false)
      setCodeOverride(null)
      setHighlightedLineSecondary(undefined)
    }
  }, [currentCode, levelMap, gameState.currentMap, teleportPlayer, setHighlightedLine, setHighlightedLineSecondary, setIsDebugMode, setIsCodeDisabled, setCurrentMap, setCodeOverride, debugState])

  const handleStepDown = useCallback(async () => {
    const nextState = await debugState.stepDownLazy()
    if (nextState) {
      const stateWithAnimation = ensurePlayerAnimation(nextState)
      setCurrentMap(stateWithAnimation.mapState)
      setHighlightedLine(nextState.highlightedLine)
      setHighlightedLineSecondary(nextState.highlightedLineSecondary)
    }
  }, [debugState, setCurrentMap, setHighlightedLine, setHighlightedLineSecondary])

  const handleStepUp = useCallback(() => {
    const prevState = debugState.stepUp()
    if (prevState) {
      const stateWithAnimation = ensurePlayerAnimation(prevState)
      setCurrentMap(stateWithAnimation.mapState)
      setHighlightedLine(prevState.highlightedLine)
      setHighlightedLineSecondary(prevState.highlightedLineSecondary)
    }
  }, [debugState, setCurrentMap, setHighlightedLine, setHighlightedLineSecondary])

  const handleStopClick = useCallback(async () => {
    setIsCodeDisabled(false)
    setIsDebugMode(false)
    setHighlightedLine(undefined)
    setHighlightedLineSecondary(undefined)
    setCodeOverride(null)
    
    const currentPlayerPos = getPlayerPosition(gameState.currentMap)
    await teleportPlayer(levelMap, currentPlayerPos) // Reset map with teleport animation
    
    // Reset states to clear panels
    await Promise.all([
      debugState.reset(),
      playState.reset()
    ])
  }, [setIsCodeDisabled, setIsDebugMode, setHighlightedLine, setHighlightedLineSecondary, setCodeOverride, teleportPlayer, levelMap, gameState.currentMap, debugState, playState])

  const handleReplay = useCallback(async () => {
    const firstState = debugState.replay()
    if (firstState) {
      const currentPlayerPos = getPlayerPosition(gameState.currentMap)
      await teleportPlayer(firstState.mapState, currentPlayerPos)
      setHighlightedLine(firstState.highlightedLine)
      setHighlightedLineSecondary(firstState.highlightedLineSecondary)
    }
  }, [debugState, teleportPlayer, gameState.currentMap, setHighlightedLine, setHighlightedLineSecondary])

  // Get current and previous debug states for panels
  // In play mode, surface live emulator state so panels stay in sync with execution
  const getCurrentState = useCallback(() => {
    if (isPlayMode || playState.isPlaying) {
      return playState.getCurrentState()
    }
    return debugState.getCurrentState()
  }, [playState, isPlayMode, debugState])

  const currentDebugState = getCurrentState()
  const previousDebugState = (isPlayMode || playState.isPlaying)
    ? playState.getPreviousState()
    : debugState.getPreviousState()

  // Listen for play state updates (including when game ends)
  useEffect(() => {
    if (playState.currentMap) {
      setCurrentMap(playState.currentMap)
      setHighlightedLine(playState.highlightedLine)
      setHighlightedLineSecondary(undefined)
      
      // Check victory condition during play mode using game logic
      if (isPlayMode && playState.currentMap) {
        handleVictoryCheck(playState.currentMap, setHasWon, setCurrentPlayWon, isPlayMode)
      }
    }
  }, [playState.currentMap, playState.highlightedLine, isPlayMode, setCurrentMap, setHighlightedLine, setHighlightedLineSecondary, setHasWon, setCurrentPlayWon])

  // Listen for play completion
  useEffect(() => {
    if (isPlayMode && !playState.isPlaying) {
      // Play has finished - reset everything
      setTimeout(() => {
        setIsPlayMode(false)
        setIsCodeDisabled(false)
        setHighlightedLine(undefined)
        setHighlightedLineSecondary(undefined)
        setPlayStatus(undefined) // Always reset play status
        // Keep Pacman at final position regardless of win/loss
        // Don't reset the map - keep the current state
        // Don't reset currentPlayWon here - let confetti play naturally
        // It will be reset when starting a new game
      }, 300) // Small delay to show final state briefly
    }
  }, [playState.isPlaying, isPlayMode, setIsPlayMode, setIsCodeDisabled, setHighlightedLine, setHighlightedLineSecondary, setPlayStatus])

  // Auto-stop debug mode when error occurs
  useEffect(() => {
    if (debugState.hasError && isDebugMode) {
      handleStopClick()
    }
  }, [debugState.hasError, isDebugMode, handleStopClick])

  return {
    // Debug state
    debugState,
    playState,
    currentDebugState,
    previousDebugState,
    
    // Handler functions
    handlePlayClick,
    handleDebugClick,
    handleStepDown,
    handleStepUp,
    handleStopClick,
    handleReplay
  }
}
