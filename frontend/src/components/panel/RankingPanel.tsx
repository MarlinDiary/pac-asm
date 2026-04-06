"use client"

import Image from 'next/image'
import { useTheme } from 'next-themes'
import { useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import SubBar from '@/components/bar/SubBar'
import { LoaderCircle, Check, X } from 'lucide-react'
import { useDiagnosticsStore } from '@/stores/diagnosticsStore'
import type { RankingEntry, SubmissionResponse } from '@/hooks/useExecutionControl'
import type { Architecture } from '@/hooks/useSettings'

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:4000'
).replace(/\/$/, '')

function formatSubmitTime(createdAt: string): string {
  try {
    const date = new Date(createdAt)
    const now = new Date()
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

    if (diffInSeconds < 60) {
      return 'Just now'
    } else if (diffInSeconds < 3600) {
      const minutes = Math.floor(diffInSeconds / 60)
      return `${minutes}m ago`
    } else if (diffInSeconds < 86400) {
      const hours = Math.floor(diffInSeconds / 3600)
      return `${hours}h ago`
    } else if (diffInSeconds < 604800) {
      const days = Math.floor(diffInSeconds / 86400)
      return `${days}d ago`
    } else {
      // Format as MM/DD/YY for older dates
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      const year = String(date.getFullYear()).slice(-2)
      return `${month}/${day}/${year}`
    }
  } catch {
    return '-'
  }
}

interface SourceCodeSnapshot {
  trimmed?: string
  raw?: string
}

export interface RankingSubmitController {
  isSubmitting: boolean
  setIsSubmitting: (value: boolean) => void
  getSourceCode: () => SourceCodeSnapshot
  isCodeDisabled: boolean
  setIsCodeDisabled: (value: boolean) => void
  setRankingLoading: (value: boolean) => void
  applySubmissionResult: (submission: SubmissionResponse['submission']) => void
}

interface SubmitRankingArgs {
  levelId: string
  architecture: Architecture
  controller: RankingSubmitController
  user: {
    id?: string
    name?: string
    avatarUrl?: string
  }
  addTaggedError?: (tag: string, error: string, code: string) => void
}

interface RankingPanelProps {
  entries: RankingEntry[]
  isLoading: boolean
  levelId: string
  architecture: Architecture
  submitController?: RankingSubmitController
  isAuthenticated?: boolean
  onLogin?: () => void
  onSelectReplay?: (entry: RankingEntry) => void
}

export default function RankingPanel({
  entries,
  isLoading,
  levelId,
  architecture,
  submitController,
  isAuthenticated = false,
  onLogin,
  onSelectReplay
}: RankingPanelProps) {
  const { theme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const { data: session } = useSession()
  const addTaggedError = useDiagnosticsStore((state) => state.addTaggedError)

  const userInfo = useMemo(() => {
    const id = session?.user?.email ?? session?.user?.name ?? ''
    const name = session?.user?.name ?? session?.user?.email ?? ''
    const avatarUrl = session?.user?.image ?? undefined
    return { id, name, avatarUrl }
  }, [session])

  const isSubmitting = submitController?.isSubmitting ?? false

  useEffect(() => {
    setMounted(true)
  }, [])

  const handleSubmit = () => {
    if (!isAuthenticated || isSubmitting || !submitController) {
      return
    }

    void submitRanking({
      levelId,
      architecture,
      controller: submitController,
      user: userInfo,
      addTaggedError
    })
  }

  const currentTheme = mounted ? (theme === 'system' ? resolvedTheme : theme) : 'light'
  const isChallenge = levelId === 'challenge'

  return (
    <div className="h-full flex flex-col">
      <SubBar>
        <div className="text-[#8a8a8e] dark:text-[#9FA0A2] text-sm pl-3" style={{ width: '6%' }}></div>
        <div className="text-[#8a8a8e] dark:text-[#9FA0A2] text-sm pl-2" style={{ width: isChallenge ? '26%' : '28%' }}>Name</div>
        {isChallenge ? (
          <>
            <div className="text-[#8a8a8e] dark:text-[#9FA0A2] text-sm pl-2" style={{ width: '22%' }}>Score</div>
            <div className="text-[#8a8a8e] dark:text-[#9FA0A2] text-sm pl-2" style={{ width: '18%' }}>Steps</div>
            <div className="text-[#8a8a8e] dark:text-[#9FA0A2] text-sm pl-2" style={{ width: '18%' }}>Time</div>
            <div className="text-[#8a8a8e] dark:text-[#9FA0A2] text-sm pl-2" style={{ width: '10%' }}></div>
          </>
        ) : (
          <>
            <div className="text-[#8a8a8e] dark:text-[#9FA0A2] text-sm pl-2" style={{ width: '16%' }}>Status</div>
            <div className="text-[#8a8a8e] dark:text-[#9FA0A2] text-sm pl-2" style={{ width: '25%' }}>Cycles</div>
            <div className="text-[#8a8a8e] dark:text-[#9FA0A2] text-sm pl-2" style={{ width: '25%' }}>Time</div>
          </>
        )}
      </SubBar>
      <div
        className="flex-1 overflow-y-auto"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {isLoading ? (
          <div className="w-full">
            {/* Skeleton loader for ranking entries */}
            {Array.from({ length: 10 }).map((_, index) => (
              <div
                key={`skeleton-${index}`}
                className={`flex items-center h-12 ${
                  index % 2 === 0
                    ? 'bg-white dark:bg-[#262626]'
                    : 'bg-[#f7f7f8] dark:bg-[#353535]'
                }`}
              >
                {/* Rank skeleton */}
                <div style={{ width: '6%' }} className="pl-3">
                  <div className="h-4 w-3 bg-[#f0f0f0] dark:bg-[#0f0f0f] rounded animate-pulse" />
                </div>
                {/* Name skeleton */}
                <div style={{ width: isChallenge ? '26%' : '28%' }} className="flex items-center gap-2 pl-2">
                  <div className="w-5 h-5 bg-[#f0f0f0] dark:bg-[#0f0f0f] rounded-full animate-pulse" />
                  <div className="h-4 w-24 bg-[#f0f0f0] dark:bg-[#0f0f0f] rounded animate-pulse" />
                </div>
                {isChallenge ? (
                  <>
                    {/* Score skeleton */}
                    <div style={{ width: '22%' }} className="pl-2">
                      <div className="h-4 w-16 bg-[#f0f0f0] dark:bg-[#0f0f0f] rounded animate-pulse" />
                    </div>
                    {/* Steps skeleton */}
                    <div style={{ width: '18%' }} className="pl-2">
                      <div className="h-4 w-16 bg-[#f0f0f0] dark:bg-[#0f0f0f] rounded animate-pulse" />
                    </div>
                    {/* Submit Time skeleton */}
                    <div style={{ width: '18%' }} className="pl-2">
                      <div className="h-4 w-16 bg-[#f0f0f0] dark:bg-[#0f0f0f] rounded animate-pulse" />
                    </div>
                    {/* Play skeleton */}
                    <div style={{ width: '10%' }} className="pl-2">
                      <div className="h-3.5 w-3.5 bg-[#f0f0f0] dark:bg-[#0f0f0f] rounded-full animate-pulse" />
                    </div>
                  </>
                ) : (
                  <>
                    {/* Status skeleton */}
                    <div style={{ width: '16%' }} className="pl-2 flex items-center">
                      <div className="h-4 w-4 bg-[#f0f0f0] dark:bg-[#0f0f0f] rounded animate-pulse" />
                    </div>
                    {/* Cycles skeleton */}
                    <div style={{ width: '25%' }} className="text-sm pl-2">
                      <div className="h-4 w-16 bg-[#f0f0f0] dark:bg-[#0f0f0f] rounded animate-pulse" />
                    </div>
                    {/* Submit Time skeleton */}
                    <div style={{ width: '25%' }} className="text-sm pl-2">
                      <div className="h-4 w-16 bg-[#f0f0f0] dark:bg-[#0f0f0f] rounded animate-pulse" />
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="w-full h-full flex flex-col items-center justify-center gap-4">
            <Image
              src={currentTheme === 'dark' ? '/res/null-dark.png' : '/res/null.png'}
              alt="No submissions"
              width={200}
              height={200}
              className="pointer-events-none select-none"
              priority={false}
            />
            <div className="text-[#c4c4c6] dark:text-[#626265] text-sm">
              No submissions
            </div>
          </div>
        ) : (
          entries.map((entry, index) => {
            const isSuccessful = entry.status === 'Accepted'
            const stepCount = typeof entry.steps === 'number' && Number.isFinite(entry.steps)
              ? Math.max(0, Math.round(entry.steps))
              : null
            const cycleCount = typeof entry.cycleCount === 'number' && Number.isFinite(entry.cycleCount)
              ? Math.max(0, Math.round(entry.cycleCount))
              : null

            return (
              <div
                key={entry.id}
                className={`flex items-center h-12 ${
                  index % 2 === 0
                    ? 'bg-white dark:bg-[#262626]'
                    : 'bg-[#f7f7f8] dark:bg-[#353535]'
                }`}
              >
                <div style={{ width: '6%' }} className="text-sm text-[#1f1f1f] dark:text-[#f5f5f5] pl-3">
                  {index + 1}
                </div>
                <div style={{ width: isChallenge ? '26%' : '28%' }} className="flex items-center gap-2 pl-2">
                  <Avatar name={entry.userName} avatarUrl={entry.userAvatarUrl} />
                  <span className="text-sm text-[#1f1f1f] dark:text-[#f5f5f5] truncate">
                    {entry.userName}
                  </span>
                </div>
                {isChallenge ? (
                  <>
                    <div style={{ width: '22%' }} className="text-sm pl-2">
                      <span className="text-[#1f1f1f] dark:text-[#f5f5f5]">
                        {Math.round(entry.score ?? entry.averageScore ?? 0).toString()}
                      </span>
                    </div>
                    <div style={{ width: '18%' }} className="text-sm pl-2">
                      <span className="text-[#1f1f1f] dark:text-[#f5f5f5]">
                        {stepCount !== null ? new Intl.NumberFormat().format(stepCount) : '-'}
                      </span>
                    </div>
                    <div style={{ width: '18%' }} className="text-sm pl-2">
                      <span className="text-[#1f1f1f] dark:text-[#f5f5f5]">
                        {formatSubmitTime(entry.updatedAt)}
                      </span>
                    </div>
                    <div style={{ width: '10%' }} className="flex items-center pl-2">
                      {entry.hasReplay ? (
                        <button
                          type="button"
                          onClick={() => onSelectReplay?.(entry)}
                          aria-label="Watch playback"
                          className="flex items-center justify-center cursor-pointer text-[#737373] dark:text-[#A8A8A8] hover:text-[#1a1a1a] dark:hover:text-[#f5f5f5] transition-colors"
                        >
                          <svg
                            aria-hidden="true"
                            focusable="false"
                            role="img"
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 512 512"
                            className="w-3.5 h-3.5"
                          >
                            <path
                              fill="currentColor"
                              d="M464 256A208 208 0 1 0 48 256a208 208 0 1 0 416 0zM0 256a256 256 0 1 1 512 0A256 256 0 1 1 0 256zM188.3 147.1c7.6-4.2 16.8-4.1 24.3 .5l144 88c7.1 4.4 11.5 12.1 11.5 20.5s-4.4 16.1-11.5 20.5l-144 88c-7.4 4.5-16.7 4.7-24.3 .5s-12.3-12.2-12.3-20.9V168c0-8.7 4.7-16.7 12.3-20.9z"
                            />
                          </svg>
                        </button>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ width: '16%' }} className="pl-2 flex items-center">
                      {isSuccessful ? (
                        <Check className="w-4 h-4 text-[#2CBC5D]" />
                      ) : (
                        <X className="w-4 h-4 text-[#EF4843]" />
                      )}
                    </div>
                    <div style={{ width: '25%' }} className="text-sm pl-2">
                      <span className="text-[#1f1f1f] dark:text-[#f5f5f5]">
                        {cycleCount !== null ? new Intl.NumberFormat().format(cycleCount) : '-'}
                      </span>
                    </div>
                    <div style={{ width: '25%' }} className="text-sm pl-2">
                      <span className="text-[#1f1f1f] dark:text-[#f5f5f5]">
                        {formatSubmitTime(entry.updatedAt)}
                      </span>
                    </div>
                  </>
                )}
              </div>
            )
          })
        )}
      </div>
      <div className="w-full h-9 border-t border-[#f0f0f0] dark:border-[#3C3C3C] flex items-center justify-between px-3">
        {!isAuthenticated ? (
          <span className="text-[#A8A8A8] dark:text-[#7D7D7D] text-sm">
            You need to log in to submit
          </span>
        ) : (
          <span className="text-[#A8A8A8] dark:text-[#7D7D7D] text-sm">
            Your code will be ranked
          </span>
        )}
        <button
          onClick={isAuthenticated ? handleSubmit : onLogin}
          disabled={isAuthenticated && isSubmitting}
          className={`h-7 px-4 bg-[#2DB65D] hover:bg-[#279A4F] dark:bg-[#2CBC5D] dark:hover:bg-[#4CC675] text-white text-sm font-medium rounded-md mr-[-8px] flex items-center gap-1.5 transition-all duration-300 ${
            isAuthenticated && isSubmitting ? 'opacity-70 cursor-default' : 'cursor-pointer'
          }`}>
          {!isAuthenticated ? (
            'Login'
          ) : isSubmitting ? (
            <>
              <LoaderCircle className="w-4 h-4 animate-spin" />
              <span>Submit</span>
            </>
          ) : (
            'Submit'
          )}
        </button>
      </div>
    </div>
  )
}

async function submitRanking({ levelId, architecture, controller, user, addTaggedError }: SubmitRankingArgs) {
  if (controller.isSubmitting) {
    return
  }

  const { trimmed: sourceCode, raw } = controller.getSourceCode()
  const fallbackSource = raw ?? ''

  if (!sourceCode) {
    addTaggedError?.('SUBMIT', 'Source code is empty', fallbackSource)
    return
  }

  if (!user.id || !user.name) {
    addTaggedError?.('SUBMIT', 'You need to log in to submit', fallbackSource)
    return
  }

  controller.setIsSubmitting(true)

  // Remember the original state of code editor
  const wasCodeDisabled = controller.isCodeDisabled
  // Only disable if not already disabled (e.g., not in debug/run mode)
  if (!wasCodeDisabled) {
    controller.setIsCodeDisabled(true)
  }

  try {
    const response = await fetch(`${API_BASE_URL}/game/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceCode,
        levelId,
        architecture,
        user: {
          id: user.id,
          name: user.name,
          avatarUrl: user.avatarUrl
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

    const { submission } = payload as SubmissionResponse
    controller.applySubmissionResult(submission)
    controller.setRankingLoading(false)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    addTaggedError?.('SUBMIT', message, fallbackSource)
  } finally {
    controller.setIsSubmitting(false)
    // Only restore if we disabled it (don't interfere with debug/run mode)
    if (!wasCodeDisabled) {
      controller.setIsCodeDisabled(false)
    }
    controller.setRankingLoading(false)
  }
}

interface AvatarProps {
  name: string
  avatarUrl?: string
}

function Avatar({ name, avatarUrl }: AvatarProps) {
  if (avatarUrl) {
    return (
      <Image
        src={avatarUrl}
        alt={name}
        width={20}
        height={20}
        className="rounded-full object-cover"
      />
    )
  }

  const initial = name.trim().charAt(0).toUpperCase() || 'U'
  return (
    <div className="w-5 h-5 rounded-full bg-[#3579f6]/20 text-[#3579f6] dark:bg-[#3579f6]/30 dark:text-[#9fbff9] flex items-center justify-center text-xs font-semibold">
      {initial}
    </div>
  )
}
