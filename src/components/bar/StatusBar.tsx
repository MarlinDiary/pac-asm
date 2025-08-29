import { Hammer } from '../ui/hammer'
import { Star } from '../ui/star'

interface StatusBarProps {
  isChallenge?: boolean
  challengeScore?: string
}

export default function StatusBar({ isChallenge = false, challengeScore = '0000' }: StatusBarProps) {
  return (
    <div className="flex items-center h-8">
      {/* Status display */}
      <div className="h-8 px-3 bg-[#e7e7e7] dark:bg-[#222222] rounded-sm flex items-center justify-center gap-1 w-[129px]">
        {isChallenge ? (
          <>
            <Star size={16} className="text-[#e6a447]" />
            <span className="text-sm font-mono" style={{ color: '#e6a447' }}>
              {challengeScore}
            </span>
          </>
        ) : (
          <>
            <Hammer size={16} className="text-[#e6a447]" />
            <span className="text-sm font-medium" style={{ color: '#e6a447' }}>
              Running...
            </span>
          </>
        )}
      </div>
    </div>
  )
}