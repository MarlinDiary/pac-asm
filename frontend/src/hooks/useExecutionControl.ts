"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { GameMap, getPlayerPosition } from '@/data/maps'
import { useDebugger } from './useDebugger'
import type { PlaybackState } from './useDebugger'
import { usePlayRunner } from './usePlayRunner'
import { useGameState } from './useGameState'
import { ensurePlayerAnimation, checkVictoryCondition, DEBUG_STEP_FRAME_DELAY_MS, cloneGameMap } from '@/lib/game-animation'
import type { AnimatedGameState } from '@/lib/game-animation'
import { useDiagnosticsStore } from '@/stores/diagnosticsStore'
import type { Architecture } from '@/hooks/useSettings'
import { trackDebugClicked, trackRunClicked } from '@/components/providers/PostHogProvider'

interface UseExecutionControlProps {
  gameState: ReturnType<typeof useGameState>
  levelMap: GameMap
  levelId: string
  architecture: Architecture
}

interface RankingEntry {
  id: string
  userId: string
  userName: string
  userAvatarUrl?: string
  levelId: string
  architecture: Architecture
  status?: 'Accepted' | 'Failed'
  successRate?: number
  score?: number
  averageScore?: number
  steps?: number
  cycleCount?: number
  createdAt: string
  updatedAt: string
  isOptimistic?: boolean
}

type RankingResponse = {
  submissions: Array<{
    id: string
    userId: string
    userName: string
    userAvatarUrl?: string
    levelId: string
    architecture: Architecture
    status?: 'Accepted' | 'Failed'
    successRate?: number
    score?: number
    averageScore?: number
    steps?: number
    cycleCount?: number
    createdAt: string
    updatedAt: string
  }>
}

interface SubmissionResponse {
  submission: RankingResponse['submissions'][number]
  summary?: {
    pass: boolean
    reason?: string
    metrics?: Record<string, unknown>
  }
}

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  'http://localhost:4000'
).replace(/\/$/, '')

const SUBMISSION_POLL_INTERVAL_MS = 3000
const SUBMISSION_PENDING_TTL_MS = 10 * 60 * 1000

interface PendingSubmissionRecord {
  startedAt: string
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

const waitForAnimationWindow = async (duration: number) => {
  await new Promise<void>((resolve) => {
    if (typeof window === 'undefined') {
      setTimeout(resolve, duration)
      return
    }
    window.requestAnimationFrame(() => {
      setTimeout(resolve, duration)
    })
  })
}

export const useExecutionControl = ({ gameState, levelMap, levelId, architecture }: UseExecutionControlProps) => {
  const { data: session } = useSession()
  const debugState = useDebugger()
  const playState = usePlayRunner()
  const errors = useDiagnosticsStore((state) => state.errors)
  const errorCountRef = useRef(errors.length)
  const [rankingEntries, setRankingEntries] = useState<RankingEntry[]>([])
  const [isRankingLoading, setIsRankingLoading] = useState(true)
  const rankingAbortRef = useRef<AbortController | null>(null)
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [isStepTemporarilyDisabled, setIsStepTemporarilyDisabled] = useState(false)
  const stepLockTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stepLockCountRef = useRef(0)
  const [isDebuggerBarVisible, setIsDebuggerBarVisible] = useState(true)
  const [isSubmitting, setIsSubmittingState] = useState(false)
  const pendingSubmissionStartedAtRef = useRef<string | null>(null)
  const isPageUnloadingRef = useRef(false)
  const userInfo = useMemo(() => {
    const id = session?.user?.email ?? session?.user?.name ?? ''
    const name = session?.user?.name ?? session?.user?.email ?? ''
    const avatarUrl = session?.user?.image ?? undefined
    return { id, name, avatarUrl }
  }, [session])
  const pendingSubmissionStorageKey = useMemo(() => {
    if (!userInfo.id) {
      return null
    }

    return `pacasm-pending-submit-${encodeURIComponent(userInfo.id)}-${levelId}-${architecture}`
  }, [architecture, levelId, userInfo.id])

  const clearPendingSubmission = useCallback((options?: { preserveOnUnload?: boolean }) => {
    if (options?.preserveOnUnload && isPageUnloadingRef.current) {
      return
    }

    pendingSubmissionStartedAtRef.current = null
    setIsSubmittingState(false)

    if (typeof window !== 'undefined' && pendingSubmissionStorageKey) {
      window.localStorage.removeItem(pendingSubmissionStorageKey)
    }
  }, [pendingSubmissionStorageKey])

  const setIsSubmitting = useCallback((value: boolean) => {
    if (!value) {
      clearPendingSubmission({ preserveOnUnload: true })
      return
    }

    const startedAt = new Date().toISOString()
    pendingSubmissionStartedAtRef.current = startedAt
    setIsSubmittingState(true)

    if (typeof window !== 'undefined' && pendingSubmissionStorageKey) {
      const record: PendingSubmissionRecord = { startedAt }
      window.localStorage.setItem(pendingSubmissionStorageKey, JSON.stringify(record))
    }
  }, [clearPendingSubmission, pendingSubmissionStorageKey])

  useEffect(() => {
    return () => {
      rankingAbortRef.current?.abort()
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current)
      }
      if (stepLockTimeoutRef.current) {
        clearTimeout(stepLockTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const handlePageHide = () => {
      isPageUnloadingRef.current = true
    }

    window.addEventListener('beforeunload', handlePageHide)
    window.addEventListener('pagehide', handlePageHide)

    return () => {
      window.removeEventListener('beforeunload', handlePageHide)
      window.removeEventListener('pagehide', handlePageHide)
    }
  }, [])

  useEffect(() => {
    rankingAbortRef.current?.abort()
    setRankingEntries([])
    setIsRankingLoading(true)
  }, [levelId, architecture])

  useEffect(() => {
    isPageUnloadingRef.current = false
  }, [pendingSubmissionStorageKey])

  useEffect(() => {
    if (typeof window === 'undefined' || !pendingSubmissionStorageKey) {
      pendingSubmissionStartedAtRef.current = null
      setIsSubmittingState(false)
      return
    }

    const raw = window.localStorage.getItem(pendingSubmissionStorageKey)
    if (!raw) {
      pendingSubmissionStartedAtRef.current = null
      setIsSubmittingState(false)
      return
    }

    try {
      const pending = JSON.parse(raw) as PendingSubmissionRecord
      const startedAtMs = Date.parse(pending.startedAt)
      if (!Number.isFinite(startedAtMs) || Date.now() - startedAtMs > SUBMISSION_PENDING_TTL_MS) {
        window.localStorage.removeItem(pendingSubmissionStorageKey)
        pendingSubmissionStartedAtRef.current = null
        setIsSubmittingState(false)
        return
      }

      pendingSubmissionStartedAtRef.current = pending.startedAt
      setIsSubmittingState(true)
    } catch {
      window.localStorage.removeItem(pendingSubmissionStorageKey)
      pendingSubmissionStartedAtRef.current = null
      setIsSubmittingState(false)
    }
  }, [pendingSubmissionStorageKey])

  const resolvePendingSubmissionFromEntries = useCallback((entries: RankingEntry[]) => {
    const startedAt = pendingSubmissionStartedAtRef.current
    if (!startedAt || !userInfo.id) {
      return
    }

    const startedAtMs = Date.parse(startedAt)
    if (!Number.isFinite(startedAtMs) || Date.now() - startedAtMs > SUBMISSION_PENDING_TTL_MS) {
      clearPendingSubmission()
      return
    }

    const currentUserEntry = entries.find((entry) => entry.userId === userInfo.id)
    if (!currentUserEntry) {
      return
    }

    const updatedAtMs = Date.parse(currentUserEntry.updatedAt)
    if (Number.isFinite(updatedAtMs) && updatedAtMs >= startedAtMs - 1000) {
      clearPendingSubmission()
    }
  }, [clearPendingSubmission, userInfo.id])

  const {
    currentCode,
    setIsCodeDisabled,
    setIsDebugMode,
    setIsPlayMode,
    setPlayStatus,
    setHasWon,
    setCurrentPlayWon,
    setShouldShakePlayer,
    setCurrentPlayGameOver,
    setCurrentPlayObjectiveNotMet,
    setHighlightedLine,
    setHighlightedLineSecondary,
    breakpoints,
    setCurrentMap,
    setLeftPanelTab,
    setCodeOverride,
    teleportPlayer,
    currentMap,
    isPlayMode,
    isDebugMode
  } = gameState

  const loadRanking = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const response = await fetch(
          `${API_BASE_URL}/game/ranking?levelId=${encodeURIComponent(levelId)}&architecture=${encodeURIComponent(architecture)}`,
          {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            signal
          }
        )

        const payload: RankingResponse | { error?: string } = await response.json().catch(() => ({}))

        if (!response.ok) {
          throw new Error(typeof payload === 'object' && 'error' in payload && payload.error ? payload.error : 'Failed to load ranking')
        }

        const body = payload as RankingResponse
        if (!Array.isArray(body.submissions)) {
          setRankingEntries([])
          return
        }

        const mapped = mapRankingResponse(levelId, body)
        setRankingEntries(mapped)
        resolvePendingSubmissionFromEntries(mapped)
      } catch (error) {
        if (signal?.aborted) {
          return
        }

        console.warn('[Ranking] Failed to load ranking:', error)
      } finally {
        if (!signal?.aborted) {
          setIsRankingLoading(false)
        }
      }
    },
    [levelId, architecture, resolvePendingSubmissionFromEntries]
  )

  useEffect(() => {
    const controller = new AbortController()
    rankingAbortRef.current = controller

    void loadRanking(controller.signal)

    return () => {
      controller.abort()
    }
  }, [loadRanking])

  useEffect(() => {
    if (!isSubmitting) {
      return
    }

    let cancelled = false
    let activeController: AbortController | null = null

    const poll = async () => {
      while (!cancelled && pendingSubmissionStartedAtRef.current) {
        activeController = new AbortController()
        await loadRanking(activeController.signal)

        if (cancelled || !pendingSubmissionStartedAtRef.current) {
          break
        }

        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, SUBMISSION_POLL_INTERVAL_MS)
        })
      }
    }

    void poll()

    return () => {
      cancelled = true
      activeController?.abort()
    }
  }, [isSubmitting, loadRanking])

  const persistRunCode = useCallback(
    (runId: string | undefined, sourceCode: string) => {
      if (!runId) {
        return
      }

      const payload = {
        runId,
        sourceCode,
        levelId,
        architecture,
      }

      void fetch(`${API_BASE_URL}/game/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch((error) => {
        console.warn('[RunLog] Failed to persist run code', error)
      })
    },
    [architecture, levelId]
  )

  const handlePlayClick = useCallback(async () => {
    const runId = trackRunClicked({
      architecture,
    })

    persistRunCode(runId, currentCode)

    setLeftPanelTab(0)

    // Use level map as-is (disable Level 4 dot randomization)
    const randomizedMap = levelMap

    // Reset map to initial state before starting play with teleport animation
    const currentPlayerPos = getPlayerPosition(gameState.currentMap)
    await teleportPlayer(randomizedMap, currentPlayerPos)
    setHighlightedLine(undefined)
    setHighlightedLineSecondary(undefined)
    setCurrentPlayWon(false) // Reset current play victory status
    setCurrentPlayGameOver(false) // Reset game over status
    setCurrentPlayObjectiveNotMet(false) // Reset objective status
    setShouldShakePlayer(false) // Clear any shake animation
    // Don't clear hasWon - keep Next button permanently after first victory

    // Record error count at start of play
    errorCountRef.current = errors.length

    setCodeOverride(null)
    setIsCodeDisabled(true)
    setIsPlayMode(true)
    setPlayStatus('running') // Show "Running..." immediately
    
    const result = await playState.startPlay(currentCode, randomizedMap)

    if (!result.success) {
      if (result.error) {
        // Handle error - reset UI state
        setIsCodeDisabled(false)
        setIsPlayMode(false)
        setPlayStatus(undefined)
        // Check if it's a game over (collision with ghost)
        if ('gameOver' in result && result.gameOver) {
          setCurrentPlayGameOver(true)
        }
        // Play failure already handled by diagnostics
      } else {
        // User cancelled - reset UI state without error
        setIsCodeDisabled(false)
        setIsPlayMode(false)
        setPlayStatus(undefined)
      }
      return
    }

    if ('objectiveNotMet' in result && result.objectiveNotMet) {
      setCurrentPlayObjectiveNotMet(true)
    }
  }, [architecture, currentCode, errors.length, gameState.currentMap, levelId, levelMap, persistRunCode, playState, setCodeOverride, setCurrentPlayGameOver, setCurrentPlayObjectiveNotMet, setCurrentPlayWon, setHighlightedLine, setHighlightedLineSecondary, setIsCodeDisabled, setIsPlayMode, setLeftPanelTab, setPlayStatus, setShouldShakePlayer, teleportPlayer])

  const handleDebugClick = useCallback(async () => {
    trackDebugClicked({
      architecture,
    })

    setLeftPanelTab(0)
    setIsDebuggerBarVisible(true)

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
      setCodeOverride(null)
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
  }, [architecture, currentCode, debugState, gameState.currentMap, levelId, levelMap, setCodeOverride, setCurrentMap, setHighlightedLine, setHighlightedLineSecondary, setIsCodeDisabled, setIsDebugMode, setLeftPanelTab, teleportPlayer])

  const lockSteps = useCallback(() => {
    if (stepLockTimeoutRef.current) {
      clearTimeout(stepLockTimeoutRef.current)
      stepLockTimeoutRef.current = null
    }
    if (stepLockCountRef.current === 0) {
      setIsStepTemporarilyDisabled(true)
    }
    stepLockCountRef.current += 1
  }, [setIsStepTemporarilyDisabled])

  const unlockSteps = useCallback(() => {
    if (stepLockCountRef.current === 0) {
      return
    }
    stepLockCountRef.current -= 1
    if (stepLockCountRef.current === 0) {
      setIsStepTemporarilyDisabled(false)
    }
  }, [setIsStepTemporarilyDisabled])

  const runWithStepLock = useCallback(async (task: () => Promise<void> | void) => {
    lockSteps()
    try {
      await task()
    } finally {
      unlockSteps()
    }
  }, [lockSteps, unlockSteps])

  const playAnimationFrames = useCallback(async (
    frames: GameMap[] | undefined,
    frameDurationMs?: number
  ) => {
    if (!frames || frames.length === 0) {
      return
    }
    const duration = frameDurationMs && frameDurationMs > 0
      ? frameDurationMs
      : DEBUG_STEP_FRAME_DELAY_MS
    const framesToPlay = frames.map((frame) => cloneGameMap(frame))

    for (const frame of framesToPlay) {
      const animatedFrame = ensurePlayerAnimation({ mapState: frame } as AnimatedGameState)
      setCurrentMap(animatedFrame.mapState)
      await waitForAnimationWindow(duration)
    }
  }, [setCurrentMap])

  const applyFinalState = useCallback((state: PlaybackState) => {
    const stateWithAnimation = ensurePlayerAnimation(state)
    setCurrentMap(stateWithAnimation.mapState)
    setHighlightedLine(state.highlightedLine)
    setHighlightedLineSecondary(state.highlightedLineSecondary)
  }, [setCurrentMap, setHighlightedLine, setHighlightedLineSecondary])

  const handleStepDown = useCallback(() => {
    const activeBreakpoints = Array.from(new Set(breakpoints)).filter((line) => line > 0)

    if (activeBreakpoints.length === 0) {
      // No breakpoints - lock during entire execution
      void runWithStepLock(async () => {
        const nextState = await debugState.stepDownLazy()
        if (!nextState) {
          return
        }

        const animation = nextState.animationFrames
        if (animation?.forward?.length) {
          await playAnimationFrames(animation.forward, animation.frameDurationMs)
        }

        applyFinalState(nextState)
      })
      return
    }

    void runWithStepLock(async () => {
      setHighlightedLine(undefined)
      setHighlightedLineSecondary(undefined)

      let finalState: PlaybackState | null = null
      try {
        finalState = await debugState.runToBreakpoints(activeBreakpoints, {
          onIntermediate: async ({ mapState, animationFrames }) => {
            if (animationFrames?.forward?.length) {
              await playAnimationFrames(animationFrames.forward, animationFrames.frameDurationMs)
              return
            }

            const animated = ensurePlayerAnimation({ mapState } as AnimatedGameState)
            setCurrentMap(animated.mapState)
            await waitForAnimationWindow(animationFrames?.frameDurationMs ?? DEBUG_STEP_FRAME_DELAY_MS)
          }
        })
      } catch (error) {
        if (error instanceof Error && error.name === 'BreakpointRunError') {
          return
        }
        throw error
      }

      if (finalState) {
        applyFinalState(finalState)
        return
      }

      if (debugState.hasError) {
        return
      }

      const fallbackState = await debugState.stepDownLazy()
      if (!fallbackState) {
        return
      }

      const animation = fallbackState.animationFrames
      if (animation?.forward?.length) {
        await playAnimationFrames(animation.forward, animation.frameDurationMs)
      }
      applyFinalState(fallbackState)
    })
  }, [
    applyFinalState,
    breakpoints,
    debugState,
    playAnimationFrames,
    runWithStepLock,
    setCurrentMap,
    setHighlightedLine,
    setHighlightedLineSecondary
  ])

  const handleStepUp = useCallback(() => {
    const currentState = debugState.getCurrentState()

    // Always use lock for consistency
    void runWithStepLock(async () => {
      const prevState = debugState.stepUp()
      if (!prevState) {
        return
      }

      const reverseAnimation = currentState?.animationFrames
      if (reverseAnimation?.reverse?.length) {
        await playAnimationFrames(reverseAnimation.reverse, reverseAnimation.frameDurationMs)
      }

      applyFinalState(prevState)
    })
  }, [applyFinalState, debugState, playAnimationFrames, runWithStepLock])

  const handleStopClick = useCallback(async () => {
    setIsCodeDisabled(false)
    setIsDebugMode(false)
    setIsDebuggerBarVisible(true)
    setHighlightedLine(undefined)
    setHighlightedLineSecondary(undefined)
    setCodeOverride(null)
    setPlayStatus(undefined)
    if (stepLockTimeoutRef.current) {
      clearTimeout(stepLockTimeoutRef.current)
      stepLockTimeoutRef.current = null
    }
    stepLockCountRef.current = 0
    setIsStepTemporarilyDisabled(false)
    
    const currentPlayerPos = getPlayerPosition(currentMap)
    await teleportPlayer(levelMap, currentPlayerPos) // Reset map with teleport animation
    
    // Reset states to clear panels
    await Promise.all([
      debugState.reset(),
      playState.reset()
    ])
  }, [
    setIsCodeDisabled,
    setIsDebugMode,
    setIsDebuggerBarVisible,
    setHighlightedLine,
    setHighlightedLineSecondary,
    setCodeOverride,
    setPlayStatus,
    teleportPlayer,
    levelMap,
    currentMap,
    debugState,
    playState
  ])

  const handleReplay = useCallback(async () => {
    const firstState = debugState.replay()
    if (firstState) {
      const currentPlayerPos = getPlayerPosition(currentMap)
      await teleportPlayer(firstState.mapState, currentPlayerPos)
      setHighlightedLine(firstState.highlightedLine)
      setHighlightedLineSecondary(firstState.highlightedLineSecondary)
    }
  }, [debugState, teleportPlayer, currentMap, setHighlightedLine, setHighlightedLineSecondary])

  const applySubmissionResult = useCallback((submissionPayload: SubmissionResponse['submission']) => {
    if (!submissionPayload) {
      return
    }

    const mappedEntry = createRankingEntry(levelId, submissionPayload, { optimistic: true })

    setRankingEntries((current) => {
      const filtered = current.filter((entry) => entry.userId !== mappedEntry.userId)
      return sortRankingEntries(levelId, [mappedEntry, ...filtered])
    })

    setIsRankingLoading(false)

    if (highlightTimeoutRef.current) {
      clearTimeout(highlightTimeoutRef.current)
    }

    highlightTimeoutRef.current = setTimeout(() => {
      setRankingEntries((current) =>
        current.map((entry) =>
          entry.id === mappedEntry.id ? { ...entry, isOptimistic: false } : entry
        )
      )
    }, 3000)
  }, [levelId, setRankingEntries, setIsRankingLoading])

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

  const debugStateWithLock = useMemo(() => ({
    ...debugState,
    canStepDown: debugState.canStepDown && !isStepTemporarilyDisabled,
    canStepUp: debugState.canStepUp && !isStepTemporarilyDisabled
  }), [debugState, isStepTemporarilyDisabled])

  const shouldUsePlayScore = (
    isPlayMode ||
    playState.isPlaying ||
    (!isDebugMode && Boolean(playState.currentMap))
  )

  const activeScore = shouldUsePlayScore ? playState.score : debugState.score

  const activeFormattedScore = shouldUsePlayScore
    ? playState.formattedScore
    : debugState.formattedScore

  const statusMessage = useMemo(() => {
    if (gameState.playStatus === 'pending') {
      return 'Pending...'
    }
    if (gameState.playStatus === 'running') {
      return 'Running...'
    }
    return undefined
  }, [gameState.playStatus])

  const isBusy = Boolean(gameState.playStatus)

  const filteredRankingEntries = useMemo(() => {
    return rankingEntries.filter((entry) => entry.architecture === architecture)
  }, [rankingEntries, architecture])

  const setRankingLoading = useCallback((value: boolean) => {
    setIsRankingLoading(value)
  }, [setIsRankingLoading])

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
      // Play has finished - check if we should shake
      // Shake if: not victory AND no new errors occurred during play
      const hasNewErrors = errors.length > errorCountRef.current
      const shouldShake = !gameState.currentPlayWon && !hasNewErrors

      if (shouldShake) {
        setShouldShakePlayer(true)
        // Clear shake after animation completes
        setTimeout(() => setShouldShakePlayer(false), 500)
      }

      // Reset everything after a delay
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
  }, [playState.isPlaying, isPlayMode, setIsPlayMode, setIsCodeDisabled, setHighlightedLine, setHighlightedLineSecondary, setPlayStatus, setShouldShakePlayer, gameState.currentPlayWon, errors.length])

  // Auto-stop debug mode when error occurs
  useEffect(() => {
    if (debugState.hasError && isDebugMode) {
      handleStopClick()
    }
  }, [debugState.hasError, isDebugMode, handleStopClick])

  return {
    // Debug state
    debugState: debugStateWithLock,
    playState,
    currentDebugState,
    previousDebugState,
    
    // Handler functions
    handlePlayClick,
    handleDebugClick,
    handleStepDown,
    handleStepUp,
    handleStopClick,
    handleReplay,

    // Ranking
    rankingEntries,
    filteredRankingEntries,
    isRankingLoading,
    isSubmitting,
    setIsSubmitting,
    applySubmissionResult,
    setRankingLoading,
    currentUserId: userInfo.id,

    // Status helpers
    statusMessage,
    isBusy,
    isDebuggerBarVisible,

    // Score display helpers
    score: activeScore,
    formattedScore: activeFormattedScore
  }
}

function mapRankingResponse(levelId: string, data: RankingResponse): RankingEntry[] {
  const entries = data.submissions.map((submission) =>
    createRankingEntry(levelId, submission, { optimistic: false })
  )
  return sortRankingEntries(levelId, entries)
}

function createRankingEntry(
  levelId: string,
  submission: RankingResponse['submissions'][number],
  options: { optimistic?: boolean }
): RankingEntry {
  return {
    id: submission.id,
    userId: submission.userId,
    userName: submission.userName,
    userAvatarUrl: submission.userAvatarUrl,
    levelId,
    architecture: submission.architecture,
    status: submission.status,
    successRate: typeof submission.successRate === 'number' ? submission.successRate : 0,
    score: typeof submission.score === 'number'
      ? submission.score
      : (typeof submission.averageScore === 'number' ? submission.averageScore : 0),
    averageScore: typeof submission.averageScore === 'number'
      ? submission.averageScore
      : (typeof submission.score === 'number' ? submission.score : 0),
    steps: typeof submission.steps === 'number' ? submission.steps : undefined,
    cycleCount: typeof submission.cycleCount === 'number' ? submission.cycleCount : undefined,
    createdAt: submission.createdAt,
    updatedAt: submission.updatedAt,
    isOptimistic: options.optimistic ?? false
  }
}

function sortRankingEntries(levelId: string, entries: RankingEntry[]): RankingEntry[] {
  const sorted = [...entries]

  if (levelId === 'challenge') {
    sorted.sort((a, b) => {
      const scoreDelta = (b.score ?? b.averageScore ?? 0) - (a.score ?? a.averageScore ?? 0)
      if (scoreDelta !== 0) return scoreDelta
      const aSteps = typeof a.steps === 'number' && Number.isFinite(a.steps) ? a.steps : Number.POSITIVE_INFINITY
      const bSteps = typeof b.steps === 'number' && Number.isFinite(b.steps) ? b.steps : Number.POSITIVE_INFINITY
      const stepsDelta = aSteps - bSteps
      if (stepsDelta !== 0) return stepsDelta
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    })
    return sorted
  }

  // For standard levels (level1-4): Accepted first, then lower cycle counts, then earlier submissions
  sorted.sort((a, b) => {
    const aAccepted = a.status === 'Accepted'
    const bAccepted = b.status === 'Accepted'

    // If one is accepted and the other isn't, accepted comes first
    if (aAccepted !== bAccepted) {
      return aAccepted ? -1 : 1
    }

    const aCycle = typeof a.cycleCount === 'number' && Number.isFinite(a.cycleCount) ? a.cycleCount : Number.POSITIVE_INFINITY
    const bCycle = typeof b.cycleCount === 'number' && Number.isFinite(b.cycleCount) ? b.cycleCount : Number.POSITIVE_INFINITY
    const cycleDelta = aCycle - bCycle
    if (cycleDelta !== 0) {
      return cycleDelta
    }

    // If cycle count ties, earlier submission comes first
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  })
  return sorted
}

export type { RankingEntry, SubmissionResponse }
