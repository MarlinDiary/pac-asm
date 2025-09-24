"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { GameMap, getPlayerPosition } from '@/data/maps'
import { useDebugger } from './useDebugger'
import { usePlayRunner } from './usePlayRunner'
import { useGameState } from './useGameState'
import { ensurePlayerAnimation, checkVictoryCondition } from '@/lib/game-animation'
import { useDiagnosticsStore } from '@/stores/diagnosticsStore'
import type { Architecture } from '@/hooks/useSettings'

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
  averageScore?: number
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
    averageScore?: number
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

export const useExecutionControl = ({ gameState, levelMap, levelId, architecture }: UseExecutionControlProps) => {
  const { data: session } = useSession()
  const debugState = useDebugger()
  const playState = usePlayRunner()
  const errors = useDiagnosticsStore((state) => state.errors)
  const addTaggedError = useDiagnosticsStore((state) => state.addTaggedError)
  const errorCountRef = useRef(errors.length)
  const [rankingEntries, setRankingEntries] = useState<RankingEntry[]>([])
  const [isRankingLoading, setIsRankingLoading] = useState(true)
  const rankingFetchedRef = useRef(false)
  const rankingAbortRef = useRef<AbortController | null>(null)
  const [submitInFlight, setSubmitInFlight] = useState(false)
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const userInfo = useMemo(() => {
    const id = session?.user?.email ?? session?.user?.name ?? ''
    const name = session?.user?.name ?? session?.user?.email ?? ''
    const avatarUrl = session?.user?.image ?? undefined
    return { id, name, avatarUrl }
  }, [session])

  useEffect(() => {
    return () => {
      rankingAbortRef.current?.abort()
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    rankingAbortRef.current?.abort()
    rankingFetchedRef.current = false
    setRankingEntries([])
    setIsRankingLoading(true)
  }, [levelId, architecture])

  const {
    currentCode,
    setIsCodeDisabled,
    setIsDebugMode,
    setIsPlayMode,
    setPlayStatus,
    setHasWon,
    setCurrentPlayWon,
    setShouldShakePlayer,
    setHighlightedLine,
    setHighlightedLineSecondary,
    setCurrentMap,
    setLeftPanelTab,
    setCodeOverride,
    teleportPlayer,
    isPlayMode,
    isDebugMode
  } = gameState

  const loadRanking = useCallback(
    async (signal?: AbortSignal) => {
      if (architecture === 'MIPS_R6') {
        if (!signal?.aborted) {
          setRankingEntries([])
          setIsRankingLoading(false)
        }
        return
      }
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
    [levelId, architecture]
  )

  useEffect(() => {
    if (rankingFetchedRef.current) {
      return
    }

    rankingFetchedRef.current = true
    const controller = new AbortController()
    rankingAbortRef.current = controller

    loadRanking(controller.signal)

    return () => {
      controller.abort()
    }
  }, [loadRanking])

  const handlePlayClick = useCallback(async () => {
    if (submitInFlight) {
      return
    }

    // Use level map as-is (disable Level 4 dot randomization)
    const randomizedMap = levelMap

    // Reset map to initial state before starting play with teleport animation
    const currentPlayerPos = getPlayerPosition(gameState.currentMap)
    await teleportPlayer(randomizedMap, currentPlayerPos)
    setHighlightedLine(undefined)
    setHighlightedLineSecondary(undefined)
    setCurrentPlayWon(false) // Reset current play victory status
    setShouldShakePlayer(false) // Clear any shake animation
    // Don't clear hasWon - keep Next button permanently after first victory

    // Record error count at start of play
    errorCountRef.current = errors.length

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
  }, [submitInFlight, currentCode, levelMap, gameState.currentMap, teleportPlayer, setHighlightedLine, setHighlightedLineSecondary, setCurrentPlayWon, setShouldShakePlayer, setIsCodeDisabled, setIsPlayMode, setPlayStatus, setCodeOverride, playState, errors.length])

  const handleDebugClick = useCallback(async () => {
    if (submitInFlight) {
      return
    }

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
  }, [submitInFlight, currentCode, levelMap, gameState.currentMap, teleportPlayer, setHighlightedLine, setHighlightedLineSecondary, setIsDebugMode, setIsCodeDisabled, setCurrentMap, setCodeOverride, debugState])

  const handleSubmit = useCallback(async () => {
    if (submitInFlight) {
      return
    }

    const sourceCode = (gameState.codeOverride ?? currentCode)?.trim()
    if (!sourceCode) {
      addTaggedError?.('SUBMIT', 'Source code is empty', currentCode ?? '')
      return
    }

    if (!userInfo.id || !userInfo.name) {
      addTaggedError?.('SUBMIT', 'Missing user identity', currentCode ?? '')
      return
    }

    setSubmitInFlight(true)
    setIsCodeDisabled(true)
    setIsPlayMode(false)
    setIsDebugMode(false)
    setPlayStatus('pending')

    try {
      const response = await fetch(`${API_BASE_URL}/game/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceCode,
          levelId,
          architecture,
          user: {
            id: userInfo.id,
            name: userInfo.name,
            avatarUrl: userInfo.avatarUrl
          }
        })
      })

      const payload: SubmissionResponse | { error?: string } = await response.json().catch(() => ({}))

      if (!response.ok) {
        const message = typeof payload === 'object' && 'error' in payload && payload.error
          ? payload.error
          : 'Submit failed'
        throw new Error(message)
      }

      const { submission: submissionPayload } = payload as SubmissionResponse
      const mappedEntry = createRankingEntry(levelId, submissionPayload, { optimistic: true })

      rankingFetchedRef.current = true
      setRankingEntries((current) => {
        const filtered = current.filter((entry) => entry.userId !== mappedEntry.userId)
        return sortRankingEntries(levelId, [mappedEntry, ...filtered])
      })

      setIsRankingLoading(false)
      setLeftPanelTab(2)

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
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      addTaggedError?.('SUBMIT', message, currentCode ?? '')
    } finally {
      setSubmitInFlight(false)
      setPlayStatus(undefined)
      setIsCodeDisabled(false)
      setIsRankingLoading(false)
    }
  }, [
    submitInFlight,
    gameState.codeOverride,
    currentCode,
    addTaggedError,
    userInfo,
    levelId,
    architecture,
    setIsCodeDisabled,
    setIsPlayMode,
    setIsDebugMode,
    setPlayStatus,
    setRankingEntries,
    setIsRankingLoading,
    setLeftPanelTab
  ])

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

  const isBusy = submitInFlight || Boolean(gameState.playStatus)

  const filteredRankingEntries = useMemo(() => {
    return rankingEntries.filter((entry) => entry.architecture === architecture)
  }, [rankingEntries, architecture])

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
    handleReplay,
    handleSubmit,

    // Ranking
    rankingEntries,
    filteredRankingEntries,
    isRankingLoading,
    currentUserId: userInfo.id,

    // Status helpers
    statusMessage,
    isBusy,

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
    averageScore: typeof submission.averageScore === 'number' ? submission.averageScore : 0,
    createdAt: submission.createdAt,
    updatedAt: submission.updatedAt,
    isOptimistic: options.optimistic ?? false
  }
}

function sortRankingEntries(levelId: string, entries: RankingEntry[]): RankingEntry[] {
  const sorted = [...entries]

  if (levelId === 'challenge') {
    sorted.sort((a, b) => {
      const scoreDelta = (b.averageScore ?? 0) - (a.averageScore ?? 0)
      if (scoreDelta !== 0) return scoreDelta
      // For same scores, earlier submission comes first
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    })
    return sorted
  }

  if (levelId === 'level4') {
    sorted.sort((a, b) => {
      const rateDelta = (b.successRate ?? 0) - (a.successRate ?? 0)
      if (rateDelta !== 0) return rateDelta
      // For same success rates, earlier submission comes first
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    })
    return sorted
  }

  // For level1-3: Sort by acceptance status first (Accepted before Failed), then by time (earliest first)
  sorted.sort((a, b) => {
    const aAccepted = a.status === 'Accepted'
    const bAccepted = b.status === 'Accepted'

    // If one is accepted and the other isn't, accepted comes first
    if (aAccepted !== bAccepted) {
      return aAccepted ? -1 : 1
    }

    // If both have same status, sort by time (earliest first)
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  })
  return sorted
}

export type { RankingEntry }
