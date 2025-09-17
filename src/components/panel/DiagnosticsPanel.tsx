'use client'

import { useDiagnosticsStore } from '@/stores/diagnosticsStore'
import ErrorCard from '../ErrorCard'
import QueryBar from '../bar/QueryBar'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import Image from 'next/image'

// Props type will be added when needed
type DiagnosticsPanelProps = Record<string, never>

export default function DiagnosticsPanel({}: DiagnosticsPanelProps) {
  const { theme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const errors = useDiagnosticsStore((state) => state.errors)
  const clearErrors = useDiagnosticsStore((state) => state.clearErrors)
  const generateDiagnosis = useDiagnosticsStore((state) => state.generateDiagnosis)
  const hasData = errors.length > 0
  
  useEffect(() => {
    setMounted(true)
  }, [])
  
  const currentTheme = mounted ? (theme === 'system' ? resolvedTheme : theme) : 'light'
  
  // Filter errors based on search query
  const filteredErrors = errors.filter(error => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      error.error.toLowerCase().includes(query) ||
      error.code.toLowerCase().includes(query)
    )
  })
  
  const handleSearch = (query: string) => {
    setSearchQuery(query)
  }
  
  const handleDeleteAll = () => {
    clearErrors()
  }
  
  return (
    <div className="w-full h-full flex flex-col">
      <QueryBar 
        onSearch={handleSearch}
        onDelete={handleDeleteAll}
        showDeleteButton={hasData}
      />
      <div 
        className="flex-1 px-4 py-3 overflow-y-auto"
        style={{
          scrollbarWidth: 'none',
          msOverflowStyle: 'none'
        }}
      >
        {!hasData ? (
          <div className="w-full h-full flex flex-col items-center justify-center gap-4">
            <Image 
              src={currentTheme === 'dark' ? '/res/null-dark.png' : '/res/null.png'} 
              alt="No diagnostics" 
              width={200}
              height={200}
              className="pointer-events-none select-none"
              priority={false}
            />
            <div className="text-[#c4c4c6] dark:text-[#626265] text-sm">
              No diagnostics data available
            </div>
          </div>
        ) : (
          <>
            {filteredErrors.map((error, index) => (
              <div key={error.id} className={index < filteredErrors.length - 1 ? 'mb-3' : ''}>
                <ErrorCard
                  id={error.id}
                  error={error.error}
                  code={error.code}
                  timestamp={error.timestamp}
                  diagnosis={error.diagnosis}
                  isLoading={error.isLoading}
                  hasDiagnosis={error.hasDiagnosis}
                  onDiagnoseClick={generateDiagnosis}
                />
              </div>
            ))}
            {searchQuery && filteredErrors.length === 0 && (
              <div className="w-full h-full flex flex-col items-center justify-center gap-4">
                <Image 
                  src={currentTheme === 'dark' ? '/res/null-dark.png' : '/res/null.png'} 
                  alt="No results" 
                  width={200}
                  height={200}
                  className="pointer-events-none select-none"
                  priority={false}
                />
                <div className="text-[#c4c4c6] dark:text-[#626265] text-sm">
                  No diagnostics data found
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
