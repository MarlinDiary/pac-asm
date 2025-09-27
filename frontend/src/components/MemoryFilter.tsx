'use client'

import { useRef, useEffect } from 'react'
import { Check } from 'lucide-react'
import { Switch } from '@/components/ui/switch'

export type MemoryRegion = 'all' | 'code' | 'stack' | 'game' | 'user'

interface MemoryFilterDropdownProps {
  isOpen: boolean
  onClose: () => void
  selectedRegion: MemoryRegion
  onRegionChange: (region: MemoryRegion) => void
  hideZeros: boolean
  onHideZerosChange: (hide: boolean) => void
}

const regionOptions = [
  { value: 'all' as MemoryRegion, label: 'All' },
  { value: 'code' as MemoryRegion, label: 'Code' },
  { value: 'stack' as MemoryRegion, label: 'Stack' },
  { value: 'game' as MemoryRegion, label: 'Game Data' },
  { value: 'user' as MemoryRegion, label: 'User Data' },
]

export default function MemoryFilter({
  isOpen,
  onClose,
  selectedRegion,
  onRegionChange,
  hideZeros,
  onHideZerosChange
}: MemoryFilterDropdownProps) {
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element
      // Don't close if clicking the filter button (it has its own toggle)
      if (dropdownRef.current && !dropdownRef.current.contains(target)) {
        if (!target.closest('[data-filter-button]')) {
          onClose()
        }
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen, onClose])

  return (
    <div 
      ref={dropdownRef}
      className={`max-w-[240px] min-w-[180px] absolute z-dropdown mt-1 rounded-lg p-2 overflow-auto focus:outline-none shadow-lg shadow-black/10 dark:shadow-black/20 bg-white dark:bg-[#303030] border border-[#F0F0F0] dark:border-[#3C3C3C] right-0 transition-all duration-200 origin-top-right ${
        isOpen 
          ? 'opacity-100 scale-100 translate-y-0 pointer-events-auto' 
          : 'opacity-0 scale-95 -translate-y-1 pointer-events-none'
      }`}
      role="menu"
    >
      {regionOptions.map((option) => (
        <div
          key={option.value}
          className={`cursor-pointer select-none relative h-8 py-1.5 pl-2 pr-12 rounded hover:bg-[#f0f0f0] dark:hover:bg-[#2a2a2a] ${
            selectedRegion === option.value 
              ? 'text-[#262626] dark:text-white font-medium' 
              : 'text-[#5a5a5a] dark:text-[#a0a0a0] font-normal'
          }`}
          role="menuitem"
          onClick={() => {
            onRegionChange(option.value)
            onClose()
          }}
        >
          <div className="flex h-5 items-center">
            <div className="truncate text-sm">{option.label}</div>
          </div>
          {selectedRegion === option.value && (
            <span className="absolute inset-y-0 right-0 flex items-center pr-2 text-[#01A2C3]">
              <Check className="h-4 w-4" />
            </span>
          )}
        </div>
      ))}
      
      <div className="border-t border-[#F0F0F0] dark:border-[#3C3C3C] my-2" />
      
      <div
        className="select-none relative h-8 py-1.5 px-2 rounded hover:bg-[#f0f0f0] dark:hover:bg-[#2a2a2a] flex items-center justify-between"
        role="menuitem"
      >
        <label htmlFor="hide-zeros" className="text-sm text-[#5a5a5a] dark:text-[#a0a0a0] cursor-pointer flex-1">Hide Zero Rows</label>
        <Switch
          id="hide-zeros"
          checked={hideZeros}
          onCheckedChange={onHideZerosChange}
          className="data-[state=checked]:bg-[#01A2C3]"
        />
      </div>
    </div>
  )
}
