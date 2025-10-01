'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { useTheme } from 'next-themes'
import { usePathname } from 'next/navigation'
import { useSettings, type Architecture } from '@/hooks/useSettings'

interface HintData {
  title: string
  content: string[]
}

const hints: Record<Architecture, Record<string, HintData>> = {
  MIPS_R6: {
    '1': {
      title: 'Level 1 Hints',
      content: [
        'Write movement command (1=up, 2=down, 3=left, 4=right) to 0x30000 to move Pac-Man.',
        'You need to move right twice to collect the dot.'
      ]
    },
    '2': {
      title: 'Level 2 Hints',
      content: [
        'Use a counter and branch instruction to change direction after 4 moves.',
        'Move right 4 times, then move down once to reach the dot.'
      ]
    },
    '3': {
      title: 'Level 3 Hints',
      content: [
        'Read map data starting at 0x30010 to find Pac-Man\'s position (tile value = 3).',
        'Check adjacent tiles (up/down/left/right) for the dot (tile value = 2).'
      ]
    },
    '4': {
      title: 'Level 4 Hints',
      content: [
        'Scan the entire map to locate Pac-Man, the dot, and the ghost.',
        'Calculate safe moves by checking distance from ghost (stay at least 2 tiles away).'
      ]
    },
    'challenge': {
      title: 'Challenge Mode Hints',
      content: []
    }
  },
  ARM: {}
}

export default function HintPanel() {
  const { theme, resolvedTheme } = useTheme()
  const { settings } = useSettings()
  const [mounted, setMounted] = useState(false)
  const pathname = usePathname()

  useEffect(() => setMounted(true), [])

  const currentTheme = mounted ? (theme === 'system' ? resolvedTheme : theme) : 'light'
  const levelId = pathname?.includes('/challenge') ? 'challenge' : pathname?.match(/\/level\/(\d+)/)?.[1]
  const hintData = levelId ? hints[settings.architecture]?.[levelId] : null

  if (!hintData || hintData.content.length === 0) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-4">
        <Image
          src={currentTheme === 'dark' ? '/res/null-dark.png' : '/res/null.png'}
          alt="No hints"
          width={200}
          height={200}
          className="pointer-events-none select-none"
          priority={false}
        />
        <div className="text-[#c4c4c6] dark:text-[#626265] text-sm">
          No hints available
        </div>
      </div>
    )
  }

  return (
    <div
      className="w-full h-full overflow-y-auto px-4 py-3"
      style={{
        scrollbarWidth: 'none',
        msOverflowStyle: 'none'
      }}
    >
      <div className="max-w-4xl [&::-webkit-scrollbar]:hidden">
        <h1 className="text-xl font-bold mb-5 text-[#1f1f1f] dark:text-[#f5f5f5]">{hintData.title}</h1>
        <ul className="list-disc space-y-2.5 text-sm text-[#5a5a5a] dark:text-[#BDBEC2] pl-5">
          {hintData.content.map((hint, index) => (
            <li key={index} className="leading-relaxed pl-2">{hint}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}