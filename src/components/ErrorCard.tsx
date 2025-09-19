'use client'

import { useRef, useEffect, useState } from 'react'
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

export default function ErrorCard({ id, error, diagnosis, isLoading, hasDiagnosis, onDiagnoseClick }: ErrorCardProps) {
  const contentRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState<number | 'auto'>('auto')
  const [enableTransition, setEnableTransition] = useState(false)
  const prevLoadingRef = useRef(isLoading)
  const { settings } = useSettings()

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
      <div ref={contentRef} className="p-4">
        <div>
          <p 
            className={`text-sm font-semibold text-[#dd544b] dark:text-[#F8615C] ${isLoading && !hasDiagnosis ? 'animate-pulse' : ''}`} 
          >
            {error}
          </p>
        </div>

        {hasDiagnosis && (
          <div className="mt-2">
            <p className="text-sm text-[#e34940] dark:text-[#F8615C]">
              {diagnosis}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}