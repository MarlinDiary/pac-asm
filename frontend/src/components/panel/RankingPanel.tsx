"use client"

import Image from 'next/image'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import SubBar from '@/components/bar/SubBar'
import type { RankingEntry } from '@/hooks/useExecutionControl'

interface RankingPanelProps {
  entries: RankingEntry[]
  isLoading: boolean
  levelId: string
}

export default function RankingPanel({ entries, isLoading, levelId }: RankingPanelProps) {
  const { theme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const currentTheme = mounted ? (theme === 'system' ? resolvedTheme : theme) : 'light'

  const thirdColumnTitle = levelId === 'challenge'
    ? 'Average Score'
    : levelId === 'level4'
      ? 'Success Rate'
      : 'Status'

  return (
    <div className="h-full flex flex-col">
      <SubBar>
        <div className="text-[#8a8a8e] dark:text-[#9FA0A2] text-sm pl-3" style={{ width: '25%' }}>Rank</div>
        <div className="text-[#8a8a8e] dark:text-[#9FA0A2] text-sm pl-2" style={{ width: '45%' }}>Name</div>
        <div className="text-[#8a8a8e] dark:text-[#9FA0A2] text-sm pl-2" style={{ width: '30%' }}>{thirdColumnTitle}</div>
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
                <div style={{ width: '25%' }} className="pl-3">
                  <div className="h-4 w-6 bg-[#f0f0f0] dark:bg-[#0f0f0f] rounded animate-pulse" />
                </div>
                {/* Name skeleton */}
                <div style={{ width: '45%' }} className="flex items-center gap-2 pl-2">
                  <div className="w-5 h-5 bg-[#f0f0f0] dark:bg-[#0f0f0f] rounded-full animate-pulse" />
                  <div className="h-4 w-24 bg-[#f0f0f0] dark:bg-[#0f0f0f] rounded animate-pulse" />
                </div>
                {/* Status/Score skeleton */}
                <div style={{ width: '30%' }} className="pl-2">
                  <div className="h-4 w-16 bg-[#f0f0f0] dark:bg-[#0f0f0f] rounded animate-pulse" />
                </div>
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
            const thirdColumnValue = formatRankingValue(entry, levelId)
            const isSuccessful = entry.status === 'Accepted'

            return (
              <div
                key={entry.id}
                className={`flex items-center h-12 ${
                  index % 2 === 0
                    ? 'bg-white dark:bg-[#262626]'
                    : 'bg-[#f7f7f8] dark:bg-[#353535]'
                }`}
              >
                <div style={{ width: '25%' }} className="text-sm text-[#1f1f1f] dark:text-[#f5f5f5] pl-3">
                  {index + 1}
                </div>
                <div style={{ width: '45%' }} className="flex items-center gap-2 pl-2">
                  <Avatar name={entry.userName} avatarUrl={entry.userAvatarUrl} />
                  <span className="text-sm text-[#1f1f1f] dark:text-[#f5f5f5] truncate">
                    {entry.userName}
                  </span>
                </div>
                <div style={{ width: '30%' }} className="text-sm pl-2">
                  <span
                    className={`font-medium ${
                      levelId === 'challenge'
                        ? 'text-[#1f1f1f] dark:text-[#f5f5f5]'
                        : levelId === 'level4'
                          ? 'text-[#1f1f1f] dark:text-[#f5f5f5]'
                          : isSuccessful
                            ? 'text-[#2CBC5D]'
                            : 'text-[#EF4843]'
                    }`}
                  >
                    {thirdColumnValue}
                  </span>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

function formatRankingValue(entry: RankingEntry, levelId: string): string {
  if (levelId === 'challenge') {
    return Math.round(entry.averageScore ?? 0).toString()
  }
  if (levelId === 'level4') {
    const percent = Math.round(((entry.successRate ?? 0) + Number.EPSILON) * 100)
    return `${percent}%`
  }
  return entry.status ?? 'Failed'
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
