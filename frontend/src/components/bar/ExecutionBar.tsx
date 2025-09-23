import { Bug, Play, CloudUpload } from 'lucide-react'
import { useState, useEffect } from 'react'
import StatusBar from './StatusBar'

interface ExecutionBarProps {
  onDebugClick?: () => void
  onPlayClick?: () => void
  onSubmitClick?: () => void
  isDebugMode?: boolean
  statusMessage?: string
  isBusy?: boolean
  hasWon?: boolean
  currentLevel?: string
  isChallenge?: boolean
}

export default function ExecutionBar({
  onDebugClick,
  onPlayClick,
  onSubmitClick,
  isDebugMode,
  statusMessage,
  isBusy
}: ExecutionBarProps) {
  const [showStatusBar, setShowStatusBar] = useState(false)

  useEffect(() => {
    setShowStatusBar(Boolean(statusMessage))
  }, [statusMessage])

  const disabled = Boolean(isBusy || isDebugMode)
  const computedStatus = statusMessage ?? 'Running...'

  const handleDebugClick = () => {
    if (disabled) return
    onDebugClick?.()
  }

  const handlePlayClick = () => {
    if (disabled) return
    onPlayClick?.()
  }

  const handleSubmitClick = () => {
    if (disabled) return
    onSubmitClick?.()
  }

  return (
    <div className="relative">
      <div
        className={`absolute inset-0 transition-opacity duration-200 ${
          showStatusBar ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <StatusBar label={computedStatus} />
      </div>
      <div
        className={`flex items-center h-8 transition-all duration-200 ${
          showStatusBar || isDebugMode ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
      >
        <button
          onClick={handleDebugClick}
          className={`w-8 h-8 p-2 bg-[#e7e7e7] dark:bg-[#222222] rounded-l-sm flex items-center justify-center transition-colors ${
            disabled
              ? 'cursor-not-allowed opacity-60'
              : 'cursor-pointer hover:bg-[#e2e2e2] dark:hover:bg-[#2a2a2a]'
          }`}
          disabled={disabled}
        >
          <Bug size={16} color="#f2a53f" />
        </button>

        <div className="w-px h-8 bg-[#f0f0f0] dark:bg-[#0f0f0f]" />

        <button
          onClick={handlePlayClick}
          className={`w-8 h-8 p-2 bg-[#e7e7e7] dark:bg-[#222222] flex items-center justify-center transition-colors ${
            disabled
              ? 'cursor-not-allowed opacity-60'
              : 'cursor-pointer hover:bg-[#e2e2e2] dark:hover:bg-[#2a2a2a]'
          }`}
          disabled={disabled}
        >
          <Play size={16} className="text-[#686868] dark:text-[#a7a7a7] fill-[#686868] dark:fill-[#a7a7a7]" />
        </button>

        <div className="w-px h-8 bg-[#f0f0f0] dark:bg-[#0f0f0f]" />

        <button
          onClick={handleSubmitClick}
          className={`h-8 bg-[#e7e7e7] dark:bg-[#222222] rounded-r-sm flex items-center gap-1 transition-colors px-3 ${
            disabled
              ? 'cursor-not-allowed opacity-60'
              : 'cursor-pointer hover:bg-[#e2e2e2] dark:hover:bg-[#2a2a2a]'
          }`}
          disabled={disabled}
        >
          <CloudUpload size={16} color="#50b040" />
          <span className="text-sm font-medium" style={{ color: '#50b040' }}>
            Submit
          </span>
        </button>
      </div>
    </div>
  )
}
