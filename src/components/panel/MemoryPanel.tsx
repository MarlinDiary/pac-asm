'use client'

import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@/components/ui/table"
import { useTheme } from 'next-themes'
import { useEffect, useState, useRef, useCallback } from 'react'

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
}

const ROWS_PER_PAGE = 100 // Initial rows to display
const ROWS_TO_LOAD = 50 // Rows to load on each scroll

export default function MemoryPanel({ searchQuery = '', hideZeroRows = false, codeMemory, stackMemory, dataMemory }: MemoryPanelProps) {
  const { theme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [displayedRowCount, setDisplayedRowCount] = useState(ROWS_PER_PAGE)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const loadingRef = useRef(false)
  
  const memoryRows = generateMemoryRows(codeMemory, stackMemory, dataMemory)
  
  useEffect(() => {
    setMounted(true)
  }, [])
  
  // Reset displayed count when search or filter changes
  useEffect(() => {
    setDisplayedRowCount(ROWS_PER_PAGE)
  }, [searchQuery, hideZeroRows])
  
  const currentTheme = mounted ? (theme === 'system' ? resolvedTheme : theme) : 'light'
  
  const filteredRows = memoryRows.filter(row => {
    // Search filter
    const matchesSearch = !searchQuery || 
      row.address.toLowerCase().includes(searchQuery.toLowerCase()) ||
      row.hex.toLowerCase().includes(searchQuery.toLowerCase()) ||
      row.ascii.toLowerCase().includes(searchQuery.toLowerCase())
    
    // Zero rows filter - check if all hex bytes are '00'
    const isAllZeros = hideZeroRows && row.hex === '00 00 00 00'
    
    return matchesSearch && !isAllZeros
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
  
  if (filteredRows.length === 0) {
    // Determine the appropriate message based on filters
    let message = "No memory data available"
    if (searchQuery) {
      message = "No results found for your search"
    } else if (hideZeroRows) {
      message = "No non-zero memory addresses found"
    }
    
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-4">
        <img 
          src={currentTheme === 'dark' ? '/res/null-dark.png' : '/res/null.png'} 
          alt="No results" 
          style={{ width: '200px', flexShrink: 0, pointerEvents: 'none', userSelect: 'none' }}
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