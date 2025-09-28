'use client'

import React, { useState, useEffect } from 'react'
import Image from 'next/image'
import { useTheme } from 'next-themes'

export default function HintPanel() {
  const { theme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const currentTheme = mounted ? (theme === 'system' ? resolvedTheme : theme) : 'light'

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