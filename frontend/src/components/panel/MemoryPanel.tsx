'use client'

import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@/components/ui/table"
import Image from 'next/image'
import { useTheme } from 'next-themes'
import { memo, useEffect, useMemo, useState } from 'react'
import MemoryFilter, { MemoryRegion } from '@/components/MemoryFilter'

import { generateMemoryRows, type MemoryRow } from '@/lib/memory-rows'

interface MemoryPanelProps {
  searchQuery?: string
  hideZeroRows?: boolean
  codeMemory?: number[]
  stackMemory?: number[]
  dataMemory?: number[]
  isFilterOpen?: boolean
  onFilterClose?: () => void
  selectedRegion?: MemoryRegion
  onRegionChange?: (region: MemoryRegion) => void
}

export default function MemoryPanel({ searchQuery = '', codeMemory, stackMemory, dataMemory, isFilterOpen = false, onFilterClose, selectedRegion: propSelectedRegion, onRegionChange }: MemoryPanelProps) {
  const { theme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [selectedRegion, setSelectedRegion] = useState<MemoryRegion>(propSelectedRegion || 'all')
  const [hideZeros, setHideZeros] = useState(false)
  
  const memoryRows = useMemo(
    () => generateMemoryRows(codeMemory, stackMemory, dataMemory),
    [codeMemory, stackMemory, dataMemory]
  )
  
  useEffect(() => {
    setMounted(true)
  }, [])
  
  const currentTheme = mounted ? (theme === 'system' ? resolvedTheme : theme) : 'light'
  
  const filteredRows = useMemo(() => memoryRows.filter(row => {
    // Region filter
    const address = parseInt(row.address, 16)
    let matchesRegion = true
    
    switch (selectedRegion) {
      case 'code':
        matchesRegion = address >= 0x10000 && address <= 0x10FFF
        break
      case 'stack':
        matchesRegion = address >= 0x20000 && address <= 0x20FFF
        break
      case 'game':
        matchesRegion = address >= 0x30000 && address <= 0x303FF
        break
      case 'user':
        matchesRegion = address >= 0x30400 && address <= 0x31FFF
        break
      case 'all':
      default:
        matchesRegion = true
    }
    
    // Search filter
    const matchesSearch = !searchQuery || 
      row.address.toLowerCase().includes(searchQuery.toLowerCase()) ||
      row.hex.toLowerCase().includes(searchQuery.toLowerCase()) ||
      row.ascii.toLowerCase().includes(searchQuery.toLowerCase())
    
    // Zero rows filter - check if all hex bytes are '00'
    const isAllZeros = hideZeros && row.hex === '00 00 00 00'
    
    return matchesRegion && matchesSearch && !isAllZeros
  }), [memoryRows, selectedRegion, searchQuery, hideZeros])
  
  // Build content depending on whether there are rows
  const renderContent = () => {
    if (filteredRows.length === 0) {
      let message = "No memory data available"
      if (searchQuery) {
        message = "No results found for your search"
      } else if (hideZeros) {
        message = "No non-zero memory addresses found"
      } else if (selectedRegion !== 'all') {
        message = `No data found in ${selectedRegion === 'code' ? 'Code' : selectedRegion === 'stack' ? 'Stack' : selectedRegion === 'game' ? 'Game Data' : 'User Data'} region`
      }
      return (
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
            {message}
          </div>
        </div>
      )
    }
    return (
      <div 
        className="w-full h-full overflow-y-auto [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        <Table className="border-none block" role="table">
          <MemoryRows rows={filteredRows} />
        </Table>
      </div>
    )
  }

  return (
    <div className="relative w-full h-full">
      {onFilterClose && (
        <div className="absolute top-0 right-2 z-50">
          <MemoryFilter
            isOpen={isFilterOpen}
            onClose={onFilterClose}
            selectedRegion={selectedRegion}
            onRegionChange={(region) => {
              setSelectedRegion(region)
              onRegionChange?.(region)
            }}
            hideZeros={hideZeros}
            onHideZerosChange={setHideZeros}
          />
        </div>
      )}
      {renderContent()}
    </div>
  )
}

// Keep all bytes in one accessible table, including browser find/selection.
// Block row groups let the browser skip offscreen layout without JS scroll
// handlers or unmounting rows. Each row has the original 3rem height; the last
// group's placeholder must reflect its actual size after filtering.
const ROWS_PER_GROUP = 64
const MemoryRows = memo(function MemoryRows({ rows }: { rows: MemoryRow[] }) {
  return (
    <>
      {Array.from({ length: Math.ceil(rows.length / ROWS_PER_GROUP) }, (_, groupIndex) => {
        const start = groupIndex * ROWS_PER_GROUP
        const group = rows.slice(start, start + ROWS_PER_GROUP)
        return (
          <TableBody
            key={`${groupIndex}-${group.length}`}
            role="rowgroup"
            className="block"
            // Exact row-count sizing avoids stale intrinsic-size caches after
            // filtering or CSS page-zoom changes (including in Firefox).
            style={{ contentVisibility: 'auto', height: `${group.length * 3}rem` }}
          >
            {group.map((row, index) => (
              <MemoryRowView key={row.address} {...row} striped={(start + index) % 2 !== 0} />
            ))}
          </TableBody>
        )
      })}
    </>
  )
})

// Emulator snapshots are new arrays, but almost all displayed bytes are
// unchanged between steps. Compare scalar values instead of row identities.
const MemoryRowView = memo(function MemoryRowView({ address, hex, ascii, striped }: MemoryRow & { striped: boolean }) {
  return (
    <TableRow role="row" className={`table w-full h-12 border-none ${!striped ? 'bg-white hover:bg-white dark:bg-[#262626] dark:hover:bg-[#262626]' : 'bg-[#f7f7f8] hover:bg-[#f7f7f8] dark:bg-[#353535] dark:hover:bg-[#353535]'}`}>
      <TableCell role="cell" className="h-12 w-1/3 text-left border-none font-mono text-xs pl-5 text-[#5a5a5a] dark:text-[#BDBEC2]">
        {address}
      </TableCell>
      <TableCell role="cell" className="font-mono h-12 w-1/3 text-center border-none text-xs text-[#5a5a5a] dark:text-[#BDBEC2]">
        {hex}
      </TableCell>
      <TableCell role="cell" className="font-mono h-12 w-1/3 text-right border-none text-xs pr-5 text-[#5a5a5a] dark:text-[#BDBEC2]">
        {ascii}
      </TableCell>
    </TableRow>
  )
})
