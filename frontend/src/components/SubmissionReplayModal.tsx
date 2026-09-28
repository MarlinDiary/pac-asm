"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Confetti from 'react-confetti'
import { RotateCcw } from 'lucide-react'
import DeathOverlay from '@/components/DeathOverlay'
import MapRenderer from '@/components/MapRenderer'
import type { GameMap } from '@/data/maps'
import type { RankingEntry } from '@/hooks/useExecutionControl'
import {
  DEBUG_STEP_FRAME_DELAY_MS,
  checkVictoryCondition,
  cloneGameMap,
  createGhostAnimation,
  createPlayerAnimation
} from '@/lib/game-animation'

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:4000'
).replace(/\/$/, '')

interface ReplayFrame {
  step: number
  command: number
  score: number
  map: {
    tiles: GameMap['tiles']
    playerPosition: GameMap['playerPosition']
    ghostPositions: GameMap['ghostPositions']
    gameOver?: boolean
  }
}

interface SubmissionReplayPayload {
  attempt: number
  score: number
  steps: number
  failureReason?: string
  frames: ReplayFrame[]
}

interface SubmissionReplayResponse {
  replay: SubmissionReplayPayload
}

interface SubmissionReplayModalProps {
  entry: RankingEntry | null
  levelMap: GameMap
  onClose: () => void
}

interface OverlayTriggerState {
  gameOver: boolean
  objective: boolean
  victory: boolean
}

export default function SubmissionReplayModal({
  entry,
  levelMap,
  onClose
}: SubmissionReplayModalProps) {
  const isOpen = entry !== null
  // Keep last entry rendered during the exit animation so content doesn't vanish mid-transition.
  const [displayEntry, setDisplayEntry] = useState<RankingEntry | null>(entry)
  const [replay, setReplay] = useState<SubmissionReplayPayload | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [showGameOver, setShowGameOver] = useState(false)
  const [showObjectiveNotMet, setShowObjectiveNotMet] = useState(false)
  const [showConfetti, setShowConfetti] = useState(false)
  const [shouldShakePlayer, setShouldShakePlayer] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const shakeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const overlayTriggersRef = useRef<OverlayTriggerState>({
    gameOver: false,
    objective: false,
    victory: false
  })

  useEffect(() => {
    if (entry) {
      setDisplayEntry(entry)
    }
  }, [entry])

  const clearShake = useCallback(() => {
    if (shakeTimeoutRef.current) {
      clearTimeout(shakeTimeoutRef.current)
      shakeTimeoutRef.current = null
    }
    setShouldShakePlayer(false)
  }, [])

  const resetTerminalEffects = useCallback(() => {
    overlayTriggersRef.current = {
      gameOver: false,
      objective: false,
      victory: false
    }
    setShowGameOver(false)
    setShowObjectiveNotMet(false)
    setShowConfetti(false)
    clearShake()
  }, [clearShake])

  const fallbackMap = useMemo(() => cloneGameMap(levelMap), [levelMap])

  const buildReplayMap = useCallback((frame: ReplayFrame, previousFrame?: ReplayFrame): GameMap => {
    const baseMap = cloneGameMap(levelMap)
    const playerPosition = frame.map.playerPosition
      ? { ...frame.map.playerPosition }
      : { ...baseMap.playerPosition }
    const previousPlayerPosition = previousFrame?.map.playerPosition
      ? { ...previousFrame.map.playerPosition }
      : undefined
    const tileSize = baseMap.tileSize || 20

    let playerAnimation = previousPlayerPosition
      ? createPlayerAnimation(frame.command, true)
      : {
          direction: playerPosition.direction,
          shouldAnimate: false
        }

    if (frame.map.gameOver && previousPlayerPosition) {
      const intendedPosition = {
        row: previousPlayerPosition.row,
        col: previousPlayerPosition.col
      }

      switch (frame.command) {
        case 1:
          intendedPosition.row = Math.max(0, previousPlayerPosition.row - 1)
          break
        case 2:
          intendedPosition.row = Math.min(baseMap.height - 1, previousPlayerPosition.row + 1)
          break
        case 3:
          intendedPosition.col = Math.max(0, previousPlayerPosition.col - 1)
          break
        case 4:
          intendedPosition.col = Math.min(baseMap.width - 1, previousPlayerPosition.col + 1)
          break
        default:
          break
      }

      const playerStayedInPlace = (
        previousPlayerPosition.row === playerPosition.row &&
        previousPlayerPosition.col === playerPosition.col
      )
      const previousTiles = previousFrame?.map.tiles ?? baseMap.tiles
      const targetIsWall = previousTiles[intendedPosition.row]?.[intendedPosition.col] === '%'

      if (playerStayedInPlace && !targetIsWall && frame.command >= 1 && frame.command <= 4) {
        playerAnimation = {
          direction: createPlayerAnimation(frame.command, true).direction,
          shouldAnimate: true,
          animationPosition: {
            x: (previousPlayerPosition.col + (intendedPosition.col - previousPlayerPosition.col) * 0.33) * tileSize,
            y: (previousPlayerPosition.row + (intendedPosition.row - previousPlayerPosition.row) * 0.33) * tileSize
          },
          teleportAnimation: 'fade-out'
        }
      } else {
        playerAnimation = {
          direction: frame.command >= 1 && frame.command <= 4
            ? createPlayerAnimation(frame.command, true).direction
            : playerPosition.direction,
          shouldAnimate: true,
          teleportAnimation: 'fade-out'
        }
      }
    } else if (frame.command < 1 || frame.command > 4) {
      playerAnimation = {
        direction: playerPosition.direction,
        shouldAnimate: false
      }
    }

    return {
      ...baseMap,
      tiles: frame.map.tiles.map((row) => [...row]),
      playerPosition,
      ghostPositions: frame.map.ghostPositions.map((ghost) => ({ ...ghost })),
      ghostPreviousPositions: previousFrame?.map.ghostPositions
        ? previousFrame.map.ghostPositions.map((ghost) => ({ ...ghost }))
        : frame.map.ghostPositions.map((ghost) => ({ ...ghost })),
      playerAnimation,
      ghostAnimations: frame.map.ghostPositions.map(() => createGhostAnimation()),
      dotAnimations: undefined,
      gameOver: frame.map.gameOver
    }
  }, [levelMap])

  const renderedFrames = useMemo(() => {
    if (!replay) {
      return []
    }
    return replay.frames.map((frame, index) => buildReplayMap(frame, index > 0 ? replay.frames[index - 1] : undefined))
  }, [buildReplayMap, replay])

  const currentFrame = replay?.frames[currentFrameIndex]
  const currentMap = renderedFrames[currentFrameIndex] ?? fallbackMap

  useEffect(() => {
    if (!entry) {
      abortRef.current?.abort()
      setReplay(null)
      setIsPlaying(false)
      setCurrentFrameIndex(0)
      setError(null)
      resetTerminalEffects()
      return
    }

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setReplay(null)
    setIsPlaying(false)
    setCurrentFrameIndex(0)
    setError(null)
    resetTerminalEffects()

    void fetch(`${API_BASE_URL}/game/submissions/${encodeURIComponent(entry.id)}/replay`, {
      method: 'GET',
      signal: controller.signal
    })
      .then(async (response) => {
        const payload: SubmissionReplayResponse | { error?: string } = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(typeof payload === 'object' && 'error' in payload && payload.error
            ? payload.error
            : 'Failed to load replay')
        }

        const body = payload as SubmissionReplayResponse
        if (!body.replay || !Array.isArray(body.replay.frames) || body.replay.frames.length === 0) {
          throw new Error('Replay not available for this submission')
        }

        if (controller.signal.aborted) {
          return
        }

        setReplay(body.replay)
        setIsPlaying(body.replay.frames.length > 1)
      })
      .catch((fetchError: unknown) => {
        if (controller.signal.aborted) {
          return
        }

        const message = fetchError instanceof Error ? fetchError.message : String(fetchError)
        setError(message)
      })

    return () => {
      controller.abort()
    }
  }, [entry, resetTerminalEffects])

  // Body scroll lock, matching SettingsPanel.
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) {
      return
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  useEffect(() => {
    if (!replay || !isPlaying) {
      return
    }

    if (currentFrameIndex >= replay.frames.length - 1) {
      setIsPlaying(false)
      return
    }

    const timeoutId = window.setTimeout(() => {
      setCurrentFrameIndex((current) => Math.min(current + 1, replay.frames.length - 1))
    }, DEBUG_STEP_FRAME_DELAY_MS)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [currentFrameIndex, isPlaying, replay])

  useEffect(() => {
    if (!replay || !currentFrame) {
      return
    }

    const victory = checkVictoryCondition(currentMap)
    const reachedEnd = currentFrameIndex >= replay.frames.length - 1

    if (victory && !overlayTriggersRef.current.victory) {
      overlayTriggersRef.current.victory = true
      setShowConfetti(true)
    }

    if (currentMap.gameOver && !overlayTriggersRef.current.gameOver) {
      overlayTriggersRef.current.gameOver = true
      setShowGameOver(true)
      clearShake()
      return
    }

    if (reachedEnd && !victory && !currentMap.gameOver && !overlayTriggersRef.current.objective) {
      overlayTriggersRef.current.objective = true
      setShowObjectiveNotMet(true)
      setShouldShakePlayer(true)
      shakeTimeoutRef.current = setTimeout(() => {
        setShouldShakePlayer(false)
        shakeTimeoutRef.current = null
      }, 500)
    }
  }, [clearShake, currentFrame, currentFrameIndex, currentMap, replay])

  useEffect(() => {
    return () => {
      clearShake()
    }
  }, [clearShake])

  const handleRestart = useCallback(() => {
    if (!replay) return
    setCurrentFrameIndex(0)
    resetTerminalEffects()
    setIsPlaying(replay.frames.length > 1)
  }, [replay, resetTerminalEffects])

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-[#0f0f0f]/60 z-40 transition-opacity duration-150 cursor-pointer ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={`fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-[#262626] rounded-md shadow-[0_0_20px_rgba(0,0,0,0.2)] border border-black/10 dark:border-white/10 z-50 overflow-hidden transition-all duration-150 ${
          isOpen ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'
        }`}
      >
        <div className="flex items-center justify-between px-4 py-2.5 gap-3">
          <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
            {displayEntry?.userName ?? 'Challenge Playback'}
          </div>
          <button
            onClick={handleRestart}
            disabled={!replay}
            aria-label="Restart replay"
            className="h-7 w-7 flex items-center justify-center text-[#737373] dark:text-[#A8A8A8] hover:text-[#1a1a1a] dark:hover:text-[#f5f5f5] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="border-t border-black/10 dark:border-white/10" />
        <div className="relative flex items-center justify-center bg-[#FAFAFA] dark:bg-[#1E1E1E] p-4 overflow-hidden">
          {error ? (
            <div className="max-w-md text-center px-6">
              <div className="text-sm font-medium text-[#A44A1A] dark:text-[#FFB27C]">
                Replay unavailable
              </div>
              <div className="mt-2 text-sm text-[#5a5a5a] dark:text-[#a0a0a0]">
                {error}
              </div>
            </div>
          ) : (
            <>
              {showConfetti ? (
                <div className="absolute inset-0 z-20 pointer-events-none">
                  <Confetti
                    recycle={false}
                    numberOfPieces={500}
                    wind={0.05}
                    gravity={0.25}
                  />
                </div>
              ) : null}
              <DeathOverlay
                show={showGameOver}
                onComplete={() => setShowGameOver(false)}
              />
              <DeathOverlay
                show={showObjectiveNotMet}
                message="OBJECTIVE NOT MET"
                fontSize="2rem"
                onComplete={() => setShowObjectiveNotMet(false)}
              />
              <MapRenderer map={currentMap} shouldShakePlayer={shouldShakePlayer} />
            </>
          )}
        </div>
      </div>
    </>
  )
}
