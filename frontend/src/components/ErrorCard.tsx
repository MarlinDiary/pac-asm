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
  tag?: string
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

const detectCategory = (message: string, tag?: string) => {
  if (tag) {
    return {
      category: tag.toUpperCase(),
      cleanMessage: message
    }
  }

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

export default function ErrorCard({ id, error, diagnosis, isLoading, hasDiagnosis, tag, onDiagnoseClick }: ErrorCardProps) {
  const contentRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState<number | 'auto'>('auto')
  const [enableTransition, setEnableTransition] = useState(false)
  const prevLoadingRef = useRef(isLoading)
  const { settings } = useSettings()
  const { category, cleanMessage } = useMemo(() => detectCategory(error, tag), [error, tag])

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
      className={`rounded-lg overflow-hidden ${
        category === 'Timeout'
          ? 'bg-[#FEF7EA] dark:bg-[#453A25]'
          : category === 'Game'
            ? 'bg-[#F5F0FF] dark:bg-[#3A2F4A]'
            : category === 'SUBMIT'
              ? 'bg-[#eef6ff] dark:bg-[#1f2933]'
              : 'bg-[#fdf1f0] dark:bg-[#372B2B]'
      } ${
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
          <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white ${
            category === 'Timeout'
              ? 'bg-[#FAB007] dark:bg-[#F5C000]'
              : category === 'Game'
                ? 'bg-[#8B5CF6] dark:bg-[#A78BFA]'
                : category === 'SUBMIT'
                  ? 'bg-[#1d4ed8] dark:bg-[#2563eb]'
                  : 'bg-[#DD544B] dark:bg-[#F8615C]'
          }`}>
            {category}
          </span>
        </div>
        <div>
          <p
            className={`text-sm whitespace-pre-wrap ${
              category === 'Timeout'
                ? 'text-[#FAB007] dark:text-[#F5C000]'
                : category === 'Game'
                  ? 'text-[#8B5CF6] dark:text-[#A78BFA]'
                  : category === 'SUBMIT'
                    ? 'text-[#1d4ed8] dark:text-[#60a5fa]'
                    : 'text-[#dd544b] dark:text-[#F8615C]'
            } ${isLoading && !hasDiagnosis ? 'animate-pulse' : ''}`}
          >
            {cleanMessage}
          </p>
        </div>

        {hasDiagnosis && (
          <div className="mt-2">
            <p className={`text-sm whitespace-pre-wrap ${
              category === 'Timeout'
                ? 'text-[#FAB007] dark:text-[#F5C000]'
                : category === 'Game'
                  ? 'text-[#8B5CF6] dark:text-[#A78BFA]'
                  : category === 'SUBMIT'
                    ? 'text-[#1d4ed8] dark:text-[#60a5fa]'
                    : 'text-[#e34940] dark:text-[#F8615C]'
            }`}>
              {diagnosis}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
