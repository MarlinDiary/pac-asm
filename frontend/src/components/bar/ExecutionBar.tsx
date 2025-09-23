import { Bug, Play, Award } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import StatusBar from './StatusBar'

interface ExecutionBarProps {
  onDebugClick?: () => void
  onPlayClick?: () => void
  isDebugMode?: boolean
  playStatus?: 'running'
  hasWon?: boolean
  currentLevel?: string
  isChallenge?: boolean
}

export default function ExecutionBar({ onDebugClick, onPlayClick, isDebugMode, playStatus, hasWon, currentLevel, isChallenge = false }: ExecutionBarProps) {
  const router = useRouter()
  const [showStatusBar, setShowStatusBar] = useState(false)

  // Show status bar only when running
  useEffect(() => {
    setShowStatusBar(playStatus === 'running')
  }, [playStatus])

  const handlePlayClick = () => {
    onPlayClick?.()
  }

  const handleDebugClick = () => {
    onDebugClick?.()
  }

  const handleNextClick = () => {
    if (hasWon && currentLevel) {
      const nextLevel = parseInt(currentLevel) + 1
      router.push(`/level/${nextLevel}`)
    }
  }

  return (
    <div className="relative">
      <div className={`absolute inset-0 transition-opacity duration-200 ${showStatusBar ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <StatusBar />
      </div>
      <div className={`flex items-center h-8 transition-all duration-200 ${showStatusBar || isDebugMode ? 'opacity-0 pointer-events-none' : 'opacity-100'} ${showStatusBar || isDebugMode ? '' : ''}`}>
        {/* Debug button */}
        <button 
          onClick={handleDebugClick}
          className="w-8 h-8 p-2 bg-[#e7e7e7] dark:bg-[#222222] rounded-l-sm flex items-center justify-center hover:bg-[#e2e2e2] dark:hover:bg-[#2a2a2a] cursor-pointer"
        >
          <Bug size={16} color="#f2a53f" />
        </button>
        
        {/* First divider */}
        <div className="w-px h-8 bg-[#f0f0f0] dark:bg-[#0f0f0f]"></div>
        
        {/* Play button */}
        <button 
          onClick={handlePlayClick}
          className="w-8 h-8 p-2 bg-[#e7e7e7] dark:bg-[#222222] hover:bg-[#e2e2e2] dark:hover:bg-[#2a2a2a] flex items-center justify-center cursor-pointer"
        >
          <Play size={16} className="text-[#686868] dark:text-[#a7a7a7] fill-[#686868] dark:fill-[#a7a7a7]" />
        </button>
        
        {/* Second divider */}
        <div className="w-px h-8 bg-[#f0f0f0] dark:bg-[#0f0f0f]"></div>
        
        {/* Next button */}
        <div className="relative">
          <button
            className={`h-8 bg-[#e7e7e7] dark:bg-[#222222] rounded-r-sm flex items-center gap-1 transition-all duration-200 ${showStatusBar || isDebugMode ? 'px-2' : 'px-3'} ${hasWon && !isChallenge ? 'cursor-pointer hover:bg-[#e2e2e2] dark:hover:bg-[#2a2a2a]' : 'cursor-default'}`}
            onClick={hasWon && !isChallenge ? handleNextClick : undefined}
          >
            {hasWon ? (
              <Award size={16} color="#50b040" />
            ) : (
              <Award size={16} color="#a7a7a7" />
            )}
            <span className="text-sm font-medium" style={{ color: hasWon ? '#50b040' : '#a7a7a7' }}>
              Next
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}
