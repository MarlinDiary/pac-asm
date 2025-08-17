import { useState, useRef, useCallback } from 'react'
import { useEmulator } from './useEmulator'
import { GameMap, getPlayerPosition } from '@/data/maps'
import { CodeHighlighter } from '@/lib/highlighter'
import { RegisterInfo } from '@/workers/emulator/types'
import { useDiagnosticsStore } from '@/stores/diagnosticsStore'
import { checkVictoryCondition } from '@/lib/game-logic'
import { updateMapAfterMovement, updateMapWithMovementAndGhosts, updateGhostsOnly } from '@/lib/game-animation'
import { 
  initializeEmulatorWithCode, 
  resetAndReloadCode, 
  assembleCode,
  getEmulatorMemoryState,
  MEMORY_CONFIG 
} from '@/lib/emulator-utils'
import { hasValidMovementCommand } from '@/lib/cycle-management'

interface MovementAction {
  instructionCount: number
  mapState: GameMap
  highlightedLine: number | undefined
}

export const usePlayRunner = () => {
  const emulator = useEmulator()
  const addError = useDiagnosticsStore((state) => state.addError)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentMap, setCurrentMap] = useState<GameMap | null>(null)
  const [highlightedLine, setHighlightedLine] = useState<number | undefined>(undefined)
  const [movementActions, setMovementActions] = useState<MovementAction[]>([])
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
    
    setMovementActions([])
    setCurrentMap(null) // Clear old map state immediately to prevent false victory detection
    setHighlightedLine(undefined)
    setIsPlaying(true)
    
    // Wait for teleport animation to complete
    await new Promise(resolve => setTimeout(resolve, 100))
    
    setCurrentMap(initialMap)
    
    try {
      if (abortController.signal.aborted) {
        setIsInitializing(false)
        return { success: false, error: null }
      }
      
      const { codeHighlighter } = await initializeEmulatorWithCode(emulator, sourceCode, initialMap, abortController)
      
      if (abortController.signal.aborted) {
        setIsPlaying(false)
        setIsInitializing(false)
        return { success: false, error: null }
      }
      
      await updateSystemState()
      await executeWithDelays(initialMap, codeHighlighter, abortController)
      
      setIsInitializing(false)
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

  const executeWithDelays = async (initialMap: GameMap, codeHighlighter: CodeHighlighter, abortController: AbortController) => {
    let currentMapState = { ...initialMap }
    let movementCount = 0
    const actions: MovementAction[] = []
    
    // Execute game loop - each iteration runs the complete user code to get next action
    while (movementCount < 300) {
      if (abortController.signal.aborted) {
        setIsPlaying(false)
        return
      }
      
      try {
        // Reset emulator state and load fresh code for each iteration
        const machineCode = await assembleCode(currentCodeRef.current)
        await resetAndReloadCode(emulator, machineCode)
        
        // Write current map state to memory after reset
        const { writeCompleteMapToMemory } = await import('@/lib/map-memory')
        await writeCompleteMapToMemory(emulator, currentMapState)
        
        // Run the complete user code with 3-second timeout
        const startTime = Date.now()
        const maxExecutionTime = 3000 // 3 seconds in milliseconds
        
        let nextAction = 0
        let executionCompleted = false
        
        // Execute the code completely to get the next action
        while (!executionCompleted && (Date.now() - startTime) < maxExecutionTime) {
          if (abortController.signal.aborted) {
            setIsPlaying(false)
            return
          }
          
          // Run a batch of instructions
          const runResult = await emulator.run(10000) // Run up to 10000 instructions at once
          if (!runResult || runResult.executedInstructions === 0) {
            executionCompleted = true
            break
          }
          
          // Check if we have an action in data memory
          const dataMemory = await emulator.getMemory(MEMORY_CONFIG.DATA_BASE, 1)
          if (dataMemory && hasValidMovementCommand(dataMemory.data)) {
            nextAction = dataMemory.data[0]
            executionCompleted = true
            break
          }
        }
        
        // Check for timeout
        if ((Date.now() - startTime) >= maxExecutionTime) {
          const errorMessage = 'Code execution timeout (3 seconds exceeded)'
          addError(errorMessage, currentCodeRef.current)
          setIsPlaying(false)
          return { success: false, error: errorMessage }
        }
        
        // Always move on each cycle - both player and ghosts
        movementCount++
        
        // Get register state before movement for debugging
        const memoryState = await getEmulatorMemoryState(emulator)
        
        if (nextAction >= 1 && nextAction <= 4) {
          // Valid player action - move both player and ghosts
          currentMapState = updateMapWithMovementAndGhosts(currentMapState, nextAction)
        } else {
          // No valid player action - only move ghosts
          currentMapState = updateGhostsOnly(currentMapState)
        }
        
        
        // Check for game over (collision)
        if (currentMapState.gameOver) {
          // Game over due to collision - stop execution
          setCurrentMap({ ...currentMapState })
          setHighlightedLine(undefined)
          setIsPlaying(false)
          return { success: false, error: 'Game Over: Collision with ghost!' }
        }
        
        // Update UI - no specific line highlighting for complete runs
        setCurrentMap({ ...currentMapState })
        setHighlightedLine(undefined)
        
        actions.push({
          instructionCount: movementCount,
          mapState: { ...currentMapState },
          highlightedLine: undefined
        })
        
        await updateSystemState()
        
        // Check victory condition after movement
        if (checkVictoryCondition(currentMapState)) {
          // Victory achieved! Stop the game loop
          break
        }
        
        // If no valid action for too many cycles, end the game
        if (nextAction < 1 || nextAction > 4) {
          // Still allow some cycles without player movement for ghosts to move
          // This could be expanded with a counter if needed
          break
        }
        
        // Wait 100ms before next iteration
        await new Promise(resolve => setTimeout(resolve, 100))
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Code execution failed'
        addError(errorMessage, currentCodeRef.current)
        setIsPlaying(false)
        return { success: false, error: errorMessage }
      }
    }
    
    // Clean up after execution
    setPreviousRegisters([])
    setCurrentRegisters([])
    currentRegistersRef.current = []
    setCurrentMemory({ codeMemory: [], stackMemory: [], dataMemory: [] })
    
    setMovementActions(actions)
    setHighlightedLine(undefined)
    setIsPlaying(false)
  }

  const calculateNewPosition = (mapState: GameMap, direction: number) => {
    const playerPos = getPlayerPosition(mapState)
    if (!playerPos) return { newRow: 0, newCol: 0 }
    
    const { row, col } = playerPos
    let newRow = row
    let newCol = col
    
    switch (direction) {
      case 1: newRow = Math.max(0, row - 1); break
      case 2: newRow = Math.min(mapState.height - 1, row + 1); break
      case 3: newCol = Math.max(0, col - 1); break
      case 4: newCol = Math.min(mapState.width - 1, col + 1); break
    }
    
    return { newRow, newCol }
  }


  const stopPlay = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    setIsPlaying(false)
  }, [])

  const reset = useCallback(async () => {
    stopPlay()
    
    setMovementActions([])
    setCurrentMap(null)
    setHighlightedLine(undefined)
    setPreviousRegisters([])
    setCurrentRegisters([])
    currentRegistersRef.current = []
    setCurrentMemory({ codeMemory: [], stackMemory: [], dataMemory: [] })
    setIsInitializing(false)
    
    try {
      await emulator.reset()
    } catch (error) {}
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
    movementActions,
    startPlay,
    stopPlay,
    reset,
    getCurrentState,
    getPreviousState
  }
}