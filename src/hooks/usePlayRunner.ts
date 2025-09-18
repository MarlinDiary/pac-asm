import { useState, useRef, useCallback } from 'react'
import { useEmulator } from './useEmulator'
import { GameMap } from '@/data/maps'
import { RegisterInfo } from '@/workers/emulator/types'
import { useDiagnosticsStore } from '@/stores/diagnosticsStore'
import { updateMapWithMovementAndGhosts, updateGhostsOnly, checkVictoryCondition } from '@/lib/game-animation'
import { 
  initializeEmulatorWithCode, 
  getEmulatorMemoryState,
  MEMORY_CONFIG 
} from '@/lib/emulator-utils'
import {
  EMULATOR_RUN_TIMEOUT_MS,
  EMULATOR_RUN_TIMEOUT_US,
  formatMemoryError,
  formatRuntimeError,
  formatTimeoutError,
} from '@/lib/emulator-errors'
import { writeMapUpdatesToMemory } from '@/lib/map-memory'

export const usePlayRunner = () => {
  const emulator = useEmulator()
  const addError = useDiagnosticsStore((state) => state.addError)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentMap, setCurrentMap] = useState<GameMap | null>(null)
  const [highlightedLine, setHighlightedLine] = useState<number | undefined>(undefined)
  const [movementActionCount, setMovementActionCount] = useState(0)
  const [currentRegisters, setCurrentRegisters] = useState<RegisterInfo[]>([])
  const [previousRegisters, setPreviousRegisters] = useState<RegisterInfo[]>([])
  const currentRegistersRef = useRef<RegisterInfo[]>([])
  const [currentMemory, setCurrentMemory] = useState<{ codeMemory: number[], stackMemory: number[], dataMemory: number[] }>({ 
    codeMemory: [], 
    stackMemory: [], 
    dataMemory: [] 
  })
  const abortControllerRef = useRef<AbortController | null>(null)
  const currentCodeRef = useRef<string>('')
  const [isInitializing, setIsInitializing] = useState(false)

  const startPlay = async (sourceCode: string, initialMap: GameMap) => {
    // Cancel any existing initialization
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    
    setIsInitializing(true)
    currentCodeRef.current = sourceCode
    
    const abortController = new AbortController()
    abortControllerRef.current = abortController
    
    setMovementActionCount(0)
    setCurrentMap(null) // Clear old map state immediately to prevent false victory detection
    setHighlightedLine(undefined)
    setIsPlaying(true)
    
    // Wait briefly before starting play
    await new Promise(resolve => setTimeout(resolve, 125))
    
    setCurrentMap(initialMap)
    
    try {
      if (abortController.signal.aborted) {
        setIsInitializing(false)
        return { success: false, error: null }
      }
      
      await initializeEmulatorWithCode(emulator, sourceCode, initialMap, abortController)
      
      if (abortController.signal.aborted) {
        setIsPlaying(false)
        setIsInitializing(false)
        return { success: false, error: null }
      }
      
      await updateSystemState()
      const executionResult = await executeWithDelays(initialMap, abortController)

      setIsInitializing(false)

      if (executionResult && executionResult.success === false) {
        return executionResult
      }

      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      addError(errorMessage, currentCodeRef.current)
      setIsPlaying(false)
      setIsInitializing(false)
      return { success: false, error: errorMessage }
    }
  }

  const updateSystemState = async () => {
    const memoryState = await getEmulatorMemoryState(emulator)
    
    if (memoryState) {
      setPreviousRegisters(currentRegistersRef.current)
      setCurrentRegisters(memoryState.registers)
      currentRegistersRef.current = memoryState.registers
      setCurrentMemory({
        codeMemory: memoryState.codeMemory,
        stackMemory: memoryState.stackMemory,
        dataMemory: memoryState.dataMemory
      })
    }
  }

  const executeWithDelays = async (initialMap: GameMap, abortController: AbortController) => {
    let currentMapState = { ...initialMap }
    let previousMapState = { ...initialMap }
    let movementCount = 0
    let recordedMovementCount = 0
    let stagnantSteps = 0

    // Continuous execution: emulator runs until it writes a command to 0x30000
    while (movementCount < 300) {
      if (abortController.signal.aborted) {
        setMovementActionCount(movementCount)
        setIsPlaying(false)
        return { success: false as const, error: null }
      }

      try {
        // Execute until the program writes a move command to DATA_BASE
        const runAddress = MEMORY_CONFIG.DATA_BASE
        const validValues = [1, 2, 3, 4]
        const timeoutUs = EMULATOR_RUN_TIMEOUT_US
        const result = await emulator.runUntilMemWrite(runAddress, validValues, timeoutUs)

        if (!result) {
          const errorMessage = formatRuntimeError(
            'runUntilMemWrite returned no result',
            `addr=0x${runAddress.toString(16)}, expect=${validValues.join('/')}, timeout=${EMULATOR_RUN_TIMEOUT_MS}ms`
          )
          addError(errorMessage, currentCodeRef.current)
          setMovementActionCount(movementCount)
          setIsPlaying(false)
          return { success: false as const, error: errorMessage }
        }

        if (result.stopReason === 'timeout') {
          // Report timeout error to diagnostics
          const errorMessage = formatTimeoutError(
            'No movement command observed',
            EMULATOR_RUN_TIMEOUT_MS,
            `addr=0x${runAddress.toString(16)}, expect=${validValues.join('/')}`
          )
          addError(errorMessage, currentCodeRef.current)
          setMovementActionCount(movementCount)
          setIsPlaying(false)
          return { success: false as const, error: errorMessage }
        }

        if (result.stopReason === 'end-of-code' || result.stopReason === 'unknown') {
          // No more code or unknown stop; stop play gracefully
          break
        }

        const nextAction = result.memEvent?.value ?? 0

        // Always move on each cycle - both player and ghosts (if action invalid, move ghosts only)
        movementCount++

        if (nextAction >= 1 && nextAction <= 4) {
          currentMapState = updateMapWithMovementAndGhosts(currentMapState, nextAction)
        } else {
          currentMapState = updateGhostsOnly(currentMapState)
        }

        const prevPlayer = previousMapState.playerPosition
        const currentPlayer = currentMapState.playerPosition
        const playerMoved = prevPlayer && currentPlayer
          ? prevPlayer.row !== currentPlayer.row || prevPlayer.col !== currentPlayer.col
          : true

        stagnantSteps = playerMoved ? 0 : stagnantSteps + 1

        if (stagnantSteps >= 10) {
          const errorMessage = 'GAMEPLAY_ERROR: PacMan has not moved for 10 consecutive steps'
          addError(errorMessage, currentCodeRef.current)
          setMovementActionCount(movementCount)
          setIsPlaying(false)
          return { success: false as const, error: errorMessage }
        }

        // Check for game over (collision)
        if (currentMapState.gameOver) {
          setCurrentMap({ ...currentMapState })
          setHighlightedLine(undefined)
          setMovementActionCount(movementCount)
          setIsPlaying(false)
          return { success: false as const, error: 'Game Over: Collision with ghost!' }
        }

        // Update UI
        setCurrentMap({ ...currentMapState })
        setHighlightedLine(undefined)

      
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'unexpected failure'
        const errorMessage = formatRuntimeError('runUntilMemWrite execution failed', detail)
        addError(errorMessage, currentCodeRef.current)
        setMovementActionCount(movementCount)
        setIsPlaying(false)
        return { success: false as const, error: errorMessage }
      }

      // After updating map state, write differences to memory and update panels, then auto-continue
      try {
        // Write diffs using the previous map snapshot
        await writeMapUpdatesToMemory(emulator, previousMapState, currentMapState)

        await updateSystemState()

        recordedMovementCount = movementCount

        // Advance previous snapshot
        previousMapState = { ...currentMapState }

        // Check victory condition after movement
        if (checkVictoryCondition(currentMapState)) {
          break
        }

        // Small delay between steps
        await new Promise(resolve => setTimeout(resolve, 125))
      } catch (e) {
        const detail = e instanceof Error ? e.message : undefined
        const errorMessage = formatMemoryError(
          'Post-move update failed while writing map diffs or refreshing state',
          detail
        )
        addError(errorMessage, currentCodeRef.current)
        setMovementActionCount(movementCount)
        setIsPlaying(false)
        return { success: false as const, error: errorMessage }
      }
    }

    // Clean up after execution
    setPreviousRegisters([])
    setCurrentRegisters([])
    currentRegistersRef.current = []
    setCurrentMemory({ codeMemory: [], stackMemory: [], dataMemory: [] })

    setMovementActionCount(recordedMovementCount)
    setHighlightedLine(undefined)
    setIsPlaying(false)

    return { success: true as const }
  }

  const stopPlay = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    setIsPlaying(false)
  }, [])

  const reset = useCallback(async () => {
    stopPlay()
    
    setMovementActionCount(0)
    setCurrentMap(null)
    setHighlightedLine(undefined)
    setPreviousRegisters([])
    setCurrentRegisters([])
    currentRegistersRef.current = []
    setCurrentMemory({ codeMemory: [], stackMemory: [], dataMemory: [] })
    setIsInitializing(false)
    
    try {
      await emulator.reset()
    } catch {}
  }, [emulator, stopPlay])

  const getCurrentState = () => {
    if (!currentMap) return null
    
    return {
      mapState: currentMap,
      highlightedLine,
      registers: currentRegisters,
      codeMemory: currentMemory.codeMemory,
      stackMemory: currentMemory.stackMemory,
      dataMemory: currentMemory.dataMemory,
      stepResult: null
    }
  }

  const getPreviousState = () => {
    if (!currentMap) return null
    
    return {
      mapState: currentMap,
      highlightedLine,
      registers: previousRegisters,
      codeMemory: currentMemory.codeMemory,
      stackMemory: currentMemory.stackMemory,
      dataMemory: currentMemory.dataMemory,
      stepResult: null
    }
  }

  return {
    isPlaying,
    isInitializing,
    currentMap,
    highlightedLine,
    movementActionCount,
    startPlay,
    stopPlay,
    reset,
    getCurrentState,
    getPreviousState
  }
}
