'use client'

import { useRef, useEffect, useState, useMemo } from 'react'
import { useSettings } from '@/hooks/useSettings'

interface ErrorCardProps {
  id: string
  error: string
  code: string
  timestamp: Date
  diagnosis: string
  isLoading: boolean
  hasDiagnosis: boolean
  onDiagnoseClick?: (id: string) => void
}

const CATEGORY_MAP: Record<string, 'Assemble' | 'Runtime' | 'Timeout' | 'Game' | 'Memory' | 'Debug'> = {
  'RUNTIME_ERROR': 'Runtime',
  'TIMEOUT_ERROR': 'Timeout',
  'GAMEPLAY_ERROR': 'Game',
  'MEMORY_ERROR': 'Memory',
  'DEBUG_ERROR': 'Debug',
  'LINK_ERROR': 'Assemble',
}

const detectCategory = (message: string) => {
  for (const prefix of Object.keys(CATEGORY_MAP)) {
    if (message.startsWith(`${prefix}:`)) {
      return {
        category: CATEGORY_MAP[prefix],
        cleanMessage: message.slice(prefix.length + 1).trimStart(),
      }
    }
  }

  if (message.startsWith('Game Over')) {
    return { category: 'Game', cleanMessage: message }
  }

  return { category: 'Assemble', cleanMessage: message }
}

export default function ErrorCard({ id, error, diagnosis, isLoading, hasDiagnosis, onDiagnoseClick }: ErrorCardProps) {
  const contentRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState<number | 'auto'>('auto')
  const [enableTransition, setEnableTransition] = useState(false)
  const prevLoadingRef = useRef(isLoading)
  const { settings } = useSettings()
  const { category, cleanMessage } = useMemo(() => detectCategory(error), [error])

  useEffect(() => {
    // Only enable transition when loading state changes
    if (prevLoadingRef.current !== isLoading) {
      setEnableTransition(true)
      prevLoadingRef.current = isLoading
      
      // Disable transition after animation completes
      const timer = setTimeout(() => {
        setEnableTransition(false)
      }, 400)
      
      return () => clearTimeout(timer)
    }
  }, [isLoading])

  useEffect(() => {
    if (contentRef.current) {
      const resizeObserver = new ResizeObserver(() => {
        if (contentRef.current) {
          setHeight(contentRef.current.scrollHeight)
        }
      })
      resizeObserver.observe(contentRef.current)
      return () => resizeObserver.disconnect()
    }
  }, [])

  const handleClick = () => {
    if (!hasDiagnosis && !isLoading && onDiagnoseClick && settings.aiDiagnostics) {
      onDiagnoseClick(id)
    }
  }

  return (
    <div
      className={`rounded-lg overflow-hidden bg-[#fdf1f0] dark:bg-[#372B2B] ${
        !hasDiagnosis && !isLoading && settings.aiDiagnostics ? 'cursor-pointer' : ''
      }`}
      style={{ 
        transition: enableTransition ? 'height 0.4s cubic-bezier(0.4, 0, 0.2, 1)' : 'none',
        height: height
      }}
      onClick={handleClick}
    >
      <div ref={contentRef} className="px-4 py-3">
        <div className="mb-2">
          <span className="inline-block rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white bg-[#DD544B] dark:bg-[#F8615C]">
            {category}
          </span>
        </div>
        <div>
          <p 
            className={`text-sm text-[#dd544b] dark:text-[#F8615C] whitespace-pre-wrap ${isLoading && !hasDiagnosis ? 'animate-pulse' : ''}`} 
          >
            {cleanMessage}
          </p>
        </div>

        {hasDiagnosis && (
          <div className="mt-2">
            <p className="text-sm text-[#e34940] dark:text-[#F8615C] whitespace-pre-wrap">
              {diagnosis}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
