import { useState, useRef, useCallback } from 'react'
import { useEmulator } from './useEmulator'
import { GameMap } from '@/data/maps'
import { CodeHighlighter, getHighlightFromStepResult } from '@/lib/highlighter'
import { RegisterInfo, StepResult } from '@/workers/emulator/types'
import { useDiagnosticsStore } from '@/stores/diagnosticsStore'
import { updateMapWithMovementAndGhosts, cloneGameMap, DEBUG_STEP_FRAME_DELAY_MS } from '@/lib/game-animation'
import { initializeEmulatorWithCode, getEmulatorMemoryState, MEMORY_CONFIG } from '@/lib/emulator-utils'
import { writeMapUpdatesToMemory } from '@/lib/map-memory'
import { formatRuntimeError, EMULATOR_RUN_TIMEOUT_US, normalizeWorkerErrorMessage } from '@/lib/emulator-errors'
import {
  createScoreTracker,
  computeScoreForMapTransition,
  formatScoreValue,
  ScoreTracker
} from '@/lib/score'

const isCodeExecutionComplete = (stepResult: { message?: string }): boolean => {
  const message = stepResult?.message?.toLowerCase() ?? ''
  if (!message) {
    return false
  }
  return (
    message.includes('execution completed') ||
    message.includes('reached end of code') ||
    message.includes('no more instructions') ||
    message.includes('end-of-code')
  )
}

export interface StepAnimationFrames {
  forward: GameMap[]
  reverse: GameMap[]
  frameDurationMs: number
}

export interface PlaybackState {
  mapState: GameMap
  highlightedLine: number | undefined
  highlightedLines?: number[]
  highlightedLineSecondary?: number | undefined
  registers: RegisterInfo[]
  codeMemory: number[]
  stackMemory: number[]
  dataMemory: number[]
  stepResult: StepResult | null
  score: number
  scoreTracker: ScoreTracker
  animationFrames?: StepAnimationFrames
  [key: string]: unknown
}

interface MemoryState {
  registers: RegisterInfo[]
  codeMemory: number[]
  stackMemory: number[]
  dataMemory: number[]
}

export interface DebugInitializationResult {
  success: boolean
  initialState?: PlaybackState
  error?: string | null
}

export const useDebugger = () => {
  const emulator = useEmulator()
  const addError = useDiagnosticsStore((state) => state.addError)
  const [highlighter, setHighlighter] = useState<CodeHighlighter | null>(null)
  const [executionHistory, setExecutionHistory] = useState<PlaybackState[]>([])
  const [currentPlaybackIndex, setCurrentPlaybackIndex] = useState(-1)
  const abortControllerRef = useRef<AbortController | null>(null)
  const [isLazyMode, setIsLazyMode] = useState(false)
  const [, setHasReachedEnd] = useState(false)
  const [hasError, setHasError] = useState(false)
  const [isGameComplete, setIsGameComplete] = useState(false)
  const currentCodeRef = useRef<string>('')
  const [isInitializing, setIsInitializing] = useState(false)
  const [score, setScore] = useState(0)
  const scoreTrackerRef = useRef<ScoreTracker>(createScoreTracker())
  const executionHistoryRef = useRef<PlaybackState[]>([])
  const currentPlaybackIndexRef = useRef(-1)
  const isGameCompleteRef = useRef(false)
  const highlighterRef = useRef<CodeHighlighter | null>(null)
  const stepQueueRef = useRef<Promise<void>>(Promise.resolve())


  const getMemoryState = useCallback(async (): Promise<MemoryState | null> => {
    return await getEmulatorMemoryState(emulator)
  }, [emulator])

  const startDebugLazy = async (sourceCode: string, currentMap: GameMap): Promise<DebugInitializationResult> => {
    return await initializeDebugger(sourceCode, currentMap, true)
  }

  const initializeDebugger = async (sourceCode: string, currentMap: GameMap, lazy: boolean): Promise<DebugInitializationResult> => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    setExecutionHistory([])
    executionHistoryRef.current = []
    setCurrentPlaybackIndex(-1)
    currentPlaybackIndexRef.current = -1
    setHighlighter(null)
    highlighterRef.current = null
    setIsLazyMode(lazy)
    setHasReachedEnd(false)
    setHasError(false)
    setIsGameComplete(false)
    isGameCompleteRef.current = false
    setIsInitializing(true)
    setScore(0)
    scoreTrackerRef.current = createScoreTracker()
    stepQueueRef.current = Promise.resolve()

    currentCodeRef.current = sourceCode

    const abortController = new AbortController()
    abortControllerRef.current = abortController
    
    try {
      const { codeHighlighter } = await initializeEmulatorWithCode(emulator, sourceCode, currentMap, abortController)
      
      const initialMemory = await getMemoryState()

      if (!initialMemory) {
        throw new Error('Failed to get initial memory state')
      }

      const initialState: PlaybackState = {
        mapState: { 
          ...currentMap,
          ghostAnimations: currentMap.ghostAnimations || currentMap.ghostPositions?.map(() => ({ shouldAnimate: true })) || []
        },
        highlightedLine: undefined,
        highlightedLineSecondary: undefined,
        ...initialMemory,
        stepResult: null,
        score: 0,
        scoreTracker: createScoreTracker()
      }

      if (abortController.signal.aborted) {
        setIsInitializing(false)
        return { success: false, error: null }
      }

      setHighlighter(codeHighlighter)
      highlighterRef.current = codeHighlighter

      if (lazy) {
        setExecutionHistory([initialState])
        executionHistoryRef.current = [initialState]
        setCurrentPlaybackIndex(0)
        currentPlaybackIndexRef.current = 0
        setScore(0)
        setIsInitializing(false)
        return { success: true, initialState }
      } else {
        const fullHistory = await executeAllSteps(codeHighlighter, initialState, abortController)
        if (abortController.signal.aborted) {
          setIsInitializing(false)
          return { success: false, error: null }
        }
        setExecutionHistory(fullHistory)
        executionHistoryRef.current = fullHistory
        setCurrentPlaybackIndex(0)
        currentPlaybackIndexRef.current = 0
        if (fullHistory.length > 0) {
          scoreTrackerRef.current = { ...fullHistory[0].scoreTracker }
        }
        setScore(fullHistory[0]?.score ?? 0)
        setIsInitializing(false)
        return { success: true, initialState: fullHistory[0] }
      }
    } catch (error) {
      setIsInitializing(false)
      const errorMessage = error instanceof Error ? error.message : String(error)

      if (errorMessage.includes('Operation aborted') || errorMessage.includes('aborted')) {
        return { success: false, error: null }
      }

      addError(errorMessage, currentCodeRef.current)
      return { success: false, error: errorMessage }
    }
  }

  const executeAllSteps = async (codeHighlighter: CodeHighlighter, initialState: PlaybackState, abortController: AbortController): Promise<PlaybackState[]> => {
    let scoreTracker = createScoreTracker()
    const history: PlaybackState[] = [{ ...initialState, scoreTracker: { ...scoreTracker } }]
    let currentMapState = { ...initialState.mapState }
    let previousMapState = { ...initialState.mapState }

    let reachedCompletion = false

    while (true) {
      if (abortController.signal.aborted) break

      const stepResult = await emulator.step()
      if (!stepResult || !stepResult.success) break

      let highlightInfo = getHighlightFromStepResult(stepResult, codeHighlighter)
      const memoryState = await getMemoryState()
      if (!memoryState) continue

      const ev = stepResult.memWriteEvent
      if (ev && ev.address === 0x30000 && ev.value >= 1 && ev.value <= 4) {
        currentMapState = updateMapWithMovementAndGhosts(currentMapState, ev.value)
        await writeMapUpdatesToMemory(emulator, previousMapState, currentMapState)
        previousMapState = { ...currentMapState }
        const scoreResult = computeScoreForMapTransition(scoreTracker, history[history.length - 1].mapState, currentMapState)
        scoreTracker = scoreResult.tracker
        if (scoreResult.victoryAchieved) {
          reachedCompletion = true
        }
      }

      const currentScore = scoreTracker.score

      if (isCodeExecutionComplete(stepResult)) {
        highlightInfo = null
        reachedCompletion = true
      }

      history.push({
        mapState: { ...currentMapState },
        highlightedLines: highlightInfo?.lineNumbers ?? [],
        highlightedLine: highlightInfo?.lineNumbers?.[0],
        highlightedLineSecondary: highlightInfo?.lineNumbers?.[1],
        ...memoryState,
        stepResult,
        score: currentScore,
        scoreTracker: { ...scoreTracker }
      })

      if (reachedCompletion) break
    }

    return history
  }

  const ensureAnimationState = (state: PlaybackState): PlaybackState => {
    return {
      ...state,
      mapState: {
        ...state.mapState,
        playerAnimation: {
          ...state.mapState.playerAnimation,
          direction: state.mapState.playerAnimation?.direction || 'right',
          shouldAnimate: true
        }
      }
    }
  }

  const performLazyStep = async (): Promise<PlaybackState | null> => {
    try {
      const stepResult = await emulator.step()
      if (!stepResult || !stepResult.success) {
        setHasError(true)
        const hasResultMessage = Boolean(stepResult?.message)
        const normalizedDetail = stepResult?.message
          ? normalizeWorkerErrorMessage(stepResult.message) ?? stepResult.message
          : undefined
        const errorMessage = formatRuntimeError(
          hasResultMessage ? 'step-debug execution failed' : 'step-debug returned no result',
          normalizedDetail
        )
        addError(errorMessage, currentCodeRef.current)
        return null
      }

      const history = executionHistoryRef.current
      const playbackIndex = currentPlaybackIndexRef.current
      const currentState = history[playbackIndex]

      if (!currentState) {
        setHasError(true)
        addError(formatRuntimeError('Debugger state unavailable during step'), currentCodeRef.current)
        return null
      }

      const previousMapSnapshot = cloneGameMap(currentState.mapState)
      let nextMapState = cloneGameMap(currentState.mapState)
      const forwardFrames: GameMap[] = []
      const reverseFrames: GameMap[] = []
      let currentHighlight: number | undefined
      let currentHighlightSecondary: number | undefined

      const ev = stepResult.memWriteEvent
      if (ev && ev.address === 0x30000 && ev.value >= 1 && ev.value <= 4) {
        const updatedMap = updateMapWithMovementAndGhosts(previousMapSnapshot, ev.value)
        const updatedSnapshot = cloneGameMap(updatedMap)
        await writeMapUpdatesToMemory(emulator, previousMapSnapshot, updatedSnapshot)
        const result = computeScoreForMapTransition(scoreTrackerRef.current, currentState.mapState, updatedSnapshot)
        scoreTrackerRef.current = { ...result.tracker }
        setScore(result.tracker.score)
        forwardFrames.push(cloneGameMap(updatedSnapshot))
        reverseFrames.unshift(cloneGameMap(previousMapSnapshot))
        nextMapState = updatedSnapshot
        if (result.victoryAchieved && !isGameCompleteRef.current) {
          setIsGameComplete(true)
          isGameCompleteRef.current = true
        }
      } else {
        setScore(scoreTrackerRef.current.score)
      }

      const highlighterInstance = highlighterRef.current
      const highlight = highlighterInstance ? getHighlightFromStepResult(stepResult, highlighterInstance) : null
      if (!isCodeExecutionComplete(stepResult) && highlight) {
        currentHighlight = highlight.lineNumbers?.[0]
        currentHighlightSecondary = highlight.lineNumbers?.[1]
      } else {
        currentHighlight = undefined
        currentHighlightSecondary = undefined
      }

      const memoryState = await getMemoryState()
      if (!memoryState) return null

      const finalMapState = cloneGameMap(nextMapState)
      const animationFrames = forwardFrames.length > 0
        ? {
            forward: forwardFrames.map((frame) => cloneGameMap(frame)),
            reverse: reverseFrames.map((frame) => cloneGameMap(frame)),
            frameDurationMs: DEBUG_STEP_FRAME_DELAY_MS
          }
        : undefined

      const newState: PlaybackState = {
        mapState: finalMapState,
        highlightedLines: !isCodeExecutionComplete(stepResult) ? highlight?.lineNumbers ?? [] : [],
        highlightedLine: currentHighlight,
        highlightedLineSecondary: currentHighlightSecondary,
        ...memoryState,
        stepResult,
        score: scoreTrackerRef.current.score,
        scoreTracker: { ...scoreTrackerRef.current },
        animationFrames
      }

      const updatedHistory = [...history, newState]
      executionHistoryRef.current = updatedHistory
      setExecutionHistory(updatedHistory)

      const nextIndex = playbackIndex + 1
      currentPlaybackIndexRef.current = nextIndex
      setCurrentPlaybackIndex(nextIndex)

      if (isCodeExecutionComplete(stepResult)) {
        setHasReachedEnd(true)
        setIsGameComplete(true)
        isGameCompleteRef.current = true
      }

      return newState
    } catch (error) {
      setHasError(true)
      const errorMessage = error instanceof Error ? error.message : String(error)

      if (errorMessage.includes('Operation aborted') || errorMessage.includes('aborted')) {
        return null
      }

      addError(errorMessage, currentCodeRef.current)
      return null
    }
  }

  const stepDownLazy = async (): Promise<PlaybackState | null> => {
    if (isInitializing) {
      return null
    }

    const history = executionHistoryRef.current
    const playbackIndex = currentPlaybackIndexRef.current
    const currentState = history[playbackIndex]

    if (currentState && currentState.mapState.gameOver) {
      return null
    }

    if (playbackIndex < history.length - 1) {
      const nextIndex = playbackIndex + 1
      const nextState = history[nextIndex]
      if (!nextState) {
        return null
      }

      currentPlaybackIndexRef.current = nextIndex
      setCurrentPlaybackIndex(nextIndex)
      scoreTrackerRef.current = { ...nextState.scoreTracker }
      setScore(nextState.score)
      const isComplete = isGameCompleteRef.current || Boolean(
        nextState.mapState.gameOver || (nextState.stepResult ? isCodeExecutionComplete(nextState.stepResult) : false)
      )
      setIsGameComplete(isComplete)
      setHasReachedEnd(isComplete)
      if (isComplete) {
        isGameCompleteRef.current = true
      }
      return nextState
    }

    if (isGameCompleteRef.current) {
      return null
    }

    const highlighterInstance = highlighterRef.current
    if (!highlighterInstance || history.length === 0 || playbackIndex < 0) {
      const reasons: string[] = []
      if (!highlighterInstance) reasons.push('highlighter not initialized')
      if (history.length === 0) reasons.push('no execution history')
      if (playbackIndex < 0) reasons.push('invalid playback index')
      const errorMessage = `DEBUG_ERROR: Debugger not ready for step (${reasons.join(', ') || 'unknown reason'})`
      addError(errorMessage, currentCodeRef.current)
      return null
    }

    const resultPromise = stepQueueRef.current.then(() => performLazyStep())
    stepQueueRef.current = resultPromise.then(
      () => undefined,
      () => undefined
    )
    return resultPromise
  }

  const runToBreakpoints = useCallback(
    (lineNumbers: number[], options?: { onIntermediate?: (payload: { mapState: GameMap; memEvent?: { address: number; value: number }; animationFrames?: StepAnimationFrames }) => void | Promise<void> }): Promise<PlaybackState | null> => {
      const runTask = async (): Promise<PlaybackState | null> => {
        if (isInitializing) {
          return null
        }

        const emitBreakpointError = (message: string): never => {
          setHasError(true)
          addError(message, currentCodeRef.current)
          const error = new Error(message)
          error.name = 'BreakpointRunError'
          throw error
        }

        const highlighterInstance = highlighterRef.current
        if (!highlighterInstance) {
          emitBreakpointError(formatRuntimeError('Debugger not ready for breakpoint run'))
        }
        const activeHighlighter = highlighterInstance

        const history = executionHistoryRef.current
        const playbackIndex = currentPlaybackIndexRef.current

        if (playbackIndex < history.length - 1) {
          const nextIndex = playbackIndex + 1
          const nextState = history[nextIndex]
          if (!nextState) {
            return null
          }

          currentPlaybackIndexRef.current = nextIndex
          setCurrentPlaybackIndex(nextIndex)
          scoreTrackerRef.current = { ...nextState.scoreTracker }
          setScore(nextState.score)
          const isComplete = isGameCompleteRef.current || Boolean(
            nextState.mapState.gameOver || (nextState.stepResult ? isCodeExecutionComplete(nextState.stepResult) : false)
          )
          setIsGameComplete(isComplete)
          if (isComplete) {
            isGameCompleteRef.current = true
          }
          setHasReachedEnd(isComplete)

          if (options?.onIntermediate) {
            const storedFrames = nextState.animationFrames
            await options.onIntermediate({
              mapState: cloneGameMap(nextState.mapState),
              memEvent: nextState.stepResult?.memWriteEvent,
              animationFrames: storedFrames
                ? {
                    forward: storedFrames.forward.map((frame) => cloneGameMap(frame)),
                    reverse: storedFrames.reverse.map((frame) => cloneGameMap(frame)),
                    frameDurationMs: storedFrames.frameDurationMs
                  }
                : undefined
            })
          }

          return ensureAnimationState(nextState)
        }

        const startState = history[playbackIndex]

        if (!startState) {
          emitBreakpointError(formatRuntimeError('Debugger state unavailable during breakpoint run'))
        }

        if (startState.mapState.gameOver || isGameCompleteRef.current) {
          return null
        }

        const uniqueLines = Array.from(new Set(lineNumbers.filter((line) => line > 0)))
        if (uniqueLines.length === 0) {
          return null
        }

        const breakpointAddresses = Array.from(new Set(
          activeHighlighter!
            .getAddressesForLines(uniqueLines)
            .map((addr) => addr >>> 0)
        ))

        if (breakpointAddresses.length === 0) {
          return null
        }

        let currentMapState: GameMap = cloneGameMap(startState.mapState)
        const forwardFrames: GameMap[] = []
        const reverseFrames: GameMap[] = []
        let lastMemEvent: { address: number; value: number; size: number } | undefined
        let finalResult: {
          message: string
          stopReason?: 'mem-write' | 'end-of-code' | 'timeout' | 'unknown' | 'breakpoint'
          memEvent?: { address: number; value: number }
          pc?: number
        } | null = null

        while (true) {
          let result: Awaited<ReturnType<typeof emulator.runUntilMemWrite>> = null
          try {
            result = await emulator.runUntilMemWrite(
              MEMORY_CONFIG.DATA_BASE,
              [1, 2, 3, 4],
              EMULATOR_RUN_TIMEOUT_US,
              breakpointAddresses
            )
          } catch (error) {
            const detail = error instanceof Error ? error.message : String(error)
            emitBreakpointError(formatRuntimeError('Breakpoint run failed', normalizeWorkerErrorMessage(detail) ?? detail))
          }

          if (!result) {
            const workerError = normalizeWorkerErrorMessage(emulator.state.error) ?? emulator.state.error
            const errorMessage = formatRuntimeError('Breakpoint run failed', workerError)
            emitBreakpointError(errorMessage)
          }

          finalResult = result

          if (result && result.memEvent && result.memEvent.address === MEMORY_CONFIG.DATA_BASE) {
            const command = result.memEvent.value
            if (command >= 1 && command <= 4) {
              const previousSnapshot = cloneGameMap(currentMapState)
              const nextMapState = updateMapWithMovementAndGhosts(currentMapState, command)
              const nextSnapshot = cloneGameMap(nextMapState)
              await writeMapUpdatesToMemory(emulator, currentMapState, nextSnapshot)

              const scoreUpdate = computeScoreForMapTransition(scoreTrackerRef.current, previousSnapshot, nextSnapshot)
              scoreTrackerRef.current = { ...scoreUpdate.tracker }
              setScore(scoreUpdate.tracker.score)

              currentMapState = nextSnapshot
              lastMemEvent = { address: MEMORY_CONFIG.DATA_BASE, value: command, size: 1 }

              forwardFrames.push(cloneGameMap(nextSnapshot))
              reverseFrames.unshift(previousSnapshot)

              const intermediateFrames: StepAnimationFrames = {
                forward: [cloneGameMap(nextSnapshot)],
                reverse: [cloneGameMap(previousSnapshot)],
                frameDurationMs: DEBUG_STEP_FRAME_DELAY_MS
              }

              if (options?.onIntermediate) {
                await options.onIntermediate({
                  mapState: cloneGameMap(nextSnapshot),
                  memEvent: lastMemEvent,
                  animationFrames: intermediateFrames
                })
              } else {
                await new Promise<void>((resolve) => setTimeout(resolve, DEBUG_STEP_FRAME_DELAY_MS))
              }

              if (scoreUpdate.victoryAchieved) {
                setIsGameComplete(true)
                isGameCompleteRef.current = true
              }
            }
          }

          if (currentMapState.gameOver || isGameCompleteRef.current) {
            break
          }

          const reason = result?.stopReason ?? 'unknown'
          if (reason === 'breakpoint' || reason === 'end-of-code' || reason === 'timeout' || reason === 'unknown') {
            break
          }
        }

        if (!finalResult) {
          return null
        }

        const memoryState = await getMemoryState()
        if (!memoryState) {
          return null
        }


        const breakpointAddress = (finalResult as { breakpoint?: { address: number } }).breakpoint?.address

        const executedAddress = breakpointAddress ?? (() => {
          if (finalResult.pc !== undefined) {
            return finalResult.pc >>> 0
          }
          const pcRegister = memoryState.registers.find((reg) => reg.register.toUpperCase() === 'PC')
          return pcRegister ? (pcRegister.value >>> 0) : MEMORY_CONFIG.CODE_BASE
        })()

        const finalPc = finalResult.pc ?? ((executedAddress + 4) >>> 0)

        const highlightInfo = activeHighlighter!.getHighlightLine(executedAddress)
        let highlightedLine = highlightInfo?.lineNumbers?.[0]
        let highlightedLineSecondary = highlightInfo?.lineNumbers?.[1]

        const codeOffset = executedAddress - MEMORY_CONFIG.CODE_BASE
        const instructionBytes = codeOffset >= 0 && codeOffset + 4 <= memoryState.codeMemory.length
          ? memoryState.codeMemory.slice(codeOffset, codeOffset + 4)
          : []
        const instructionHex = instructionBytes.length > 0
          ? instructionBytes.map((byte) => byte.toString(16).padStart(2, '0')).join(' ')
          : ''

        const stopReason = finalResult.stopReason ?? 'unknown'

        if (stopReason !== 'breakpoint') {
          highlightedLine = undefined
          highlightedLineSecondary = undefined
        }

        const finalMapSnapshot = cloneGameMap(currentMapState)
        const animationFrames = forwardFrames.length > 0
          ? {
              forward: forwardFrames.map((frame) => cloneGameMap(frame)),
              reverse: reverseFrames.map((frame) => cloneGameMap(frame)),
              frameDurationMs: DEBUG_STEP_FRAME_DELAY_MS
            }
          : undefined

        const finalState: PlaybackState = {
          mapState: finalMapSnapshot,
          highlightedLines: stopReason === 'breakpoint' ? highlightInfo?.lineNumbers ?? [] : [],
          highlightedLine,
          highlightedLineSecondary,
          ...memoryState,
          stepResult: {
            success: stopReason !== 'timeout' && stopReason !== 'unknown',
            message: finalResult.message,
            pc: finalPc,
            instruction: {
              address: executedAddress,
              bytes: instructionBytes,
              hex: instructionHex.toUpperCase()
            },
            executedAddresses: highlightInfo?.addresses ?? [executedAddress],
            memWriteEvent: lastMemEvent
          },
          score: scoreTrackerRef.current.score,
          scoreTracker: { ...scoreTrackerRef.current },
          animationFrames
        }

        const newHistory = playbackIndex >= 0
          ? [...history.slice(0, playbackIndex + 1), finalState]
          : [finalState]

        executionHistoryRef.current = newHistory
        setExecutionHistory(newHistory)
        currentPlaybackIndexRef.current = newHistory.length - 1
        setCurrentPlaybackIndex(newHistory.length - 1)

        if (stopReason === 'end-of-code') {
          setHasReachedEnd(true)
          setIsGameComplete(true)
          isGameCompleteRef.current = true
        }

        return finalState
      }

      const resultPromise = stepQueueRef.current.then(runTask)
      stepQueueRef.current = resultPromise.then(
        () => undefined,
        () => undefined
      )
      return resultPromise
    }, [
      isInitializing,
      addError,
      emulator,
      getMemoryState,
      setExecutionHistory,
      setCurrentPlaybackIndex,
      setScore,
      setHasReachedEnd,
      setIsGameComplete
    ])

  const stepDown = () => {
    const history = executionHistoryRef.current
    const playbackIndex = currentPlaybackIndexRef.current
    if (playbackIndex < history.length - 1) {
      const nextIndex = playbackIndex + 1
      const nextState = history[nextIndex]
      if (!nextState) {
        return null
      }

      currentPlaybackIndexRef.current = nextIndex
      setCurrentPlaybackIndex(nextIndex)
      scoreTrackerRef.current = { ...nextState.scoreTracker }
      setScore(nextState.score)
      const isComplete = isGameCompleteRef.current || Boolean(
        nextState.mapState.gameOver || (nextState.stepResult ? isCodeExecutionComplete(nextState.stepResult) : false)
      )
      setIsGameComplete(isComplete)
      setHasReachedEnd(isComplete)
      if (isComplete) {
        isGameCompleteRef.current = true
      }
      return ensureAnimationState(nextState)
    }
    return null
  }

  const stepUp = () => {
    const history = executionHistoryRef.current
    const playbackIndex = currentPlaybackIndexRef.current
    if (playbackIndex > 0) {
      const prevIndex = playbackIndex - 1
      const prevState = history[prevIndex]
      if (!prevState) {
        return null
      }

      currentPlaybackIndexRef.current = prevIndex
      setCurrentPlaybackIndex(prevIndex)
      if (isGameCompleteRef.current) {
        const prevStateComplete = Boolean(
          prevState.mapState.gameOver || (prevState.stepResult ? isCodeExecutionComplete(prevState.stepResult) : false)
        )
        setIsGameComplete(prevStateComplete)
        if (!prevStateComplete) {
          setHasReachedEnd(false)
        }
      }
      if (hasError) {
        setHasError(false)
      }
      scoreTrackerRef.current = { ...prevState.scoreTracker }
      setScore(prevState.score)
      return ensureAnimationState(prevState)
    }
    return null
  }

  const replay = () => {
    const history = executionHistoryRef.current
    if (history.length > 0) {
      currentPlaybackIndexRef.current = 0
      setCurrentPlaybackIndex(0)
      scoreTrackerRef.current = { ...history[0].scoreTracker }
      setScore(history[0].score)
      return history[0]
    }
    return null
  }

  const reset = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setCurrentPlaybackIndex(-1)
    currentPlaybackIndexRef.current = -1
    setExecutionHistory([])
    executionHistoryRef.current = []
    setHighlighter(null)
    highlighterRef.current = null
    setIsLazyMode(false)
    setHasReachedEnd(false)
    setHasError(false)
    setIsGameComplete(false)
    isGameCompleteRef.current = false
    setIsInitializing(false)
    setScore(0)
    scoreTrackerRef.current = createScoreTracker()
    stepQueueRef.current = Promise.resolve()
    
    try {
      await emulator.reset()
    } catch {
      return
    }
  }, [emulator])

  const getCurrentState = () => {
    if (executionHistory.length === 0 || currentPlaybackIndex < 0 || currentPlaybackIndex >= executionHistory.length) {
      return null
    }
    return executionHistory[currentPlaybackIndex]
  }

  const getPreviousState = () => {
    if (executionHistory.length === 0 || currentPlaybackIndex <= 0) {
      return null
    }
    return executionHistory[currentPlaybackIndex - 1]
  }

  const currentState = getCurrentState()
  const isGameOver = currentState && currentState.mapState.gameOver
  
  return {
    highlighter,
    executionHistory,
    currentPlaybackIndex,
    hasError,
    isInitializing,
    score,
    formattedScore: formatScoreValue(score),
    canStepUp: currentPlaybackIndex > 0 && !isInitializing,
    canStepDown: !isInitializing && emulator.state.isInitialized && !hasError && !isGameOver && (
      isLazyMode ? 
        (currentPlaybackIndex < executionHistory.length - 1 || !isGameComplete) :
        (!isGameComplete && currentPlaybackIndex < executionHistory.length - 1)
    ),
    startDebugLazy,
    stepDown,
    stepDownLazy,
    runToBreakpoints,
    stepUp,
    replay,
    reset,
    getCurrentState,
    getPreviousState
  }
}
