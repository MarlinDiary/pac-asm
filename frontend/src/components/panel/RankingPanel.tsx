import React from 'react'
import { usePathname } from 'next/navigation'
import SubBar from '@/components/bar/SubBar'

export default function RankingPanel() {
  const pathname = usePathname()

  // Determine the third column header based on route
  const getThirdColumnHeader = () => {
    if (pathname === '/challenge') {
      return 'Average Score'
    } else if (pathname === '/level/4') {
      return 'Success Rate'
    } else if (pathname?.startsWith('/level/')) {
      return 'Status'
    }
    return 'Status'
  }

  return (
    <div className="h-full flex flex-col">
      <SubBar>
        <div className="text-[#8a8a8e] dark:text-[#9FA0A2] text-sm pl-3" style={{ width: '25%' }}>Rank</div>
        <div className="text-[#8a8a8e] dark:text-[#9FA0A2] text-sm pl-2" style={{ width: '45%' }}>Name</div>
        <div className="text-[#8a8a8e] dark:text-[#9FA0A2] text-sm pl-2" style={{ width: '30%' }}>{getThirdColumnHeader()}</div>
      </SubBar>
      <div
        className="flex-1 overflow-y-auto"
        style={{
          scrollbarWidth: 'none',
          msOverflowStyle: 'none'
        }}
      >
        {/* Ranking content will go here */}
      </div>
    </div>
  )
}