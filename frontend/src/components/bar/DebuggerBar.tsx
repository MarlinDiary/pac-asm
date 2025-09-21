import { Square, ArrowDownToDot, ArrowUpFromDot, RefreshCcw } from 'lucide-react'

interface DebuggerBarProps {
  onReturnClick?: () => void
  onStopClick?: () => void
  onStepDown?: () => void
  onStepUp?: () => void
  onReplay?: () => void
  canStepUp?: boolean
  canStepDown?: boolean
}

export default function DebuggerBar({ onReturnClick, onStopClick, onStepDown, onStepUp, onReplay, canStepUp = false, canStepDown = true }: DebuggerBarProps) {
  const handleStopClick = () => {
    onStopClick?.()
    onReturnClick?.()
  }

  return (
    <div className="flex items-center h-8">
      {/* Square button */}
      <button 
        onClick={handleStopClick}
        className="w-8 h-8 p-2 bg-[#e7e7e7] dark:bg-[#222222] hover:bg-[#e2e2e2] dark:hover:bg-[#2a2a2a] rounded-l-sm flex items-center justify-center cursor-pointer"
      >
        <Square size={16} color="#e34940" fill="#e34940" />
      </button>
      
      {/* Divider */}
      <div className="w-px h-8 bg-[#f0f0f0] dark:bg-[#0f0f0f]"></div>
      
      {/* Long bar with three buttons */}
      <div className="h-8 bg-[#e7e7e7] dark:bg-[#222222] rounded-r-sm flex">
        {/* Arrow down to dot button - Step Down */}
        <button 
          onClick={canStepDown ? onStepDown : undefined}
          className={`w-8 h-8 p-2 flex items-center justify-center ${
            canStepDown ? 'hover:bg-[#e2e2e2] dark:hover:bg-[#2a2a2a] cursor-pointer' : 'cursor-default'
          }`}
        >
          <ArrowDownToDot size={16} color={canStepDown ? "#3679f5" : "#a7a7a7"} />
        </button>
        
        {/* Arrow up from dot button - Step Up */}
        <button 
          onClick={canStepUp ? onStepUp : undefined}
          className={`w-8 h-8 p-2 flex items-center justify-center ${
            canStepUp ? 'hover:bg-[#e2e2e2] dark:hover:bg-[#2a2a2a] cursor-pointer' : 'cursor-default'
          }`}
        >
          <ArrowUpFromDot size={16} color={canStepUp ? "#3679f5" : "#a7a7a7"} />
        </button>
        
        {/* Refresh ccw button - Replay */}
        <button 
          onClick={onReplay}
          className="w-8 h-8 p-2 hover:bg-[#e2e2e2] dark:hover:bg-[#2a2a2a] rounded-r-sm flex items-center justify-center cursor-pointer"
        >
          <RefreshCcw size={16} color="#50b040" />
        </button>
      </div>
    </div>
  )
}