'use client'

import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@/components/ui/table"
import Image from 'next/image'
import { useTheme } from 'next-themes'
import { useEffect, useState, useRef, useCallback } from 'react'
import MemoryFilter, { MemoryRegion } from '@/components/MemoryFilter'

interface MemoryRow {
  address: string;
  hex: string;
  ascii: string;
}

const generateMemoryRows = (
  codeMemory?: number[], 
  stackMemory?: number[], 
  dataMemory?: number[]
): MemoryRow[] => {
  const rows: MemoryRow[] = []
  const memoryRegions = [
    { start: 0x10000, name: 'Code', data: codeMemory },
    { start: 0x20000, name: 'Stack', data: stackMemory },
    { start: 0x30000, name: 'Data', data: dataMemory }
  ]
  
  memoryRegions.forEach(region => {
    // Each region is 4KB (4096 bytes), showing 4 bytes per row = 1024 rows per region
    const rowsPerRegion = 1024 // 4096 bytes / 4 bytes per row
    for (let i = 0; i < rowsPerRegion; i++) {
      const address = region.start + (i * 4)
      const addressHex = `0x${address.toString(16).toUpperCase().padStart(8, '0')}`
      
      let hexBytes = '00 00 00 00'
      let asciiBytes = '. . . .'
      
      // Use actual memory data if available
      if (region.data) {
        const byteOffset = i * 4
        if (byteOffset < region.data.length) {
          // Read 4 bytes (or less if at end of data)
          const byte0 = region.data[byteOffset] || 0
          const byte1 = region.data[byteOffset + 1] || 0
          const byte2 = region.data[byteOffset + 2] || 0
          const byte3 = region.data[byteOffset + 3] || 0
          
          hexBytes = [byte0, byte1, byte2, byte3]
            .map(b => b.toString(16).toUpperCase().padStart(2, '0'))
            .join(' ')
          
          asciiBytes = [byte0, byte1, byte2, byte3]
            .map(b => (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.')
            .join(' ')
        }
      }
      
      rows.push({
        address: addressHex,
        hex: hexBytes,
        ascii: asciiBytes
      })
    }
  })
  
  return rows
}

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

const ROWS_PER_PAGE = 100 // Initial rows to display
const ROWS_TO_LOAD = 50 // Rows to load on each scroll

export default function MemoryPanel({ searchQuery = '', codeMemory, stackMemory, dataMemory, isFilterOpen = false, onFilterClose, selectedRegion: propSelectedRegion, onRegionChange }: MemoryPanelProps) {
  const { theme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [displayedRowCount, setDisplayedRowCount] = useState(ROWS_PER_PAGE)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const loadingRef = useRef(false)
  const [selectedRegion, setSelectedRegion] = useState<MemoryRegion>(propSelectedRegion || 'all')
  const [hideZeros, setHideZeros] = useState(false)
  
  const memoryRows = generateMemoryRows(codeMemory, stackMemory, dataMemory)
  
  useEffect(() => {
    setMounted(true)
  }, [])
  
  // Reset displayed count when search or filter changes
  useEffect(() => {
    setDisplayedRowCount(ROWS_PER_PAGE)
  }, [searchQuery, hideZeros, selectedRegion])
  
  const currentTheme = mounted ? (theme === 'system' ? resolvedTheme : theme) : 'light'
  
  const filteredRows = memoryRows.filter(row => {
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
        matchesRegion = address >= 0x30400 && address <= 0x30FFF
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
  })
  
  // Only show a subset of filtered rows
  const visibleRows = filteredRows.slice(0, displayedRowCount)
  const hasMoreRows = displayedRowCount < filteredRows.length
  
  // Handle scroll to load more
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (loadingRef.current || !hasMoreRows) return
    
    const element = e.currentTarget
    const scrollPosition = element.scrollTop + element.clientHeight
    const scrollHeight = element.scrollHeight
    
    // Load more when within 200px of bottom for smoother experience
    if (scrollHeight - scrollPosition < 200) {
      loadingRef.current = true
      setDisplayedRowCount(prev => Math.min(prev + ROWS_TO_LOAD, filteredRows.length))
      // Shorter delay for more responsive loading
      setTimeout(() => {
        loadingRef.current = false
      }, 50)
    }
  }, [hasMoreRows, filteredRows.length])
  
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
        onScroll={handleScroll}
        ref={scrollContainerRef}
      >
        <Table className="border-none">
          <TableBody>
            {visibleRows.map((row, index) => (
              <TableRow key={row.address} className={`h-12 border-none ${index % 2 === 0 ? 'bg-white hover:bg-white dark:bg-[#262626] dark:hover:bg-[#262626]' : 'bg-[#f7f7f8] hover:bg-[#f7f7f8] dark:bg-[#353535] dark:hover:bg-[#353535]'}`}>
                <TableCell className="h-12 w-1/3 text-left border-none font-mono text-xs pl-5 text-[#5a5a5a] dark:text-[#BDBEC2]">
                  {row.address}
                </TableCell>
                <TableCell className="font-mono h-12 w-1/3 text-center border-none text-xs text-[#5a5a5a] dark:text-[#BDBEC2]">
                  {row.hex}
                </TableCell>
                <TableCell className="font-mono h-12 w-1/3 text-right border-none text-xs pr-5 text-[#5a5a5a] dark:text-[#BDBEC2]">
                  {row.ascii}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
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
