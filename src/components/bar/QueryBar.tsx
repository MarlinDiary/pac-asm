import { Search, Trash2, ListFilter } from 'lucide-react'
import { useState, useRef } from 'react'
import { MemoryRegion } from '@/components/MemoryFilter'

interface QueryBarProps {
  children?: React.ReactNode
  onSearch?: (query: string) => void
  onDelete?: () => void
  showDeleteButton?: boolean
  onFilterToggle?: (isActive: boolean) => void
  isFilterActive?: boolean
  selectedRegion?: MemoryRegion
}

export default function QueryBar({ children, onSearch, onDelete, showDeleteButton = false, onFilterToggle, isFilterActive = false, selectedRegion }: QueryBarProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value
    setSearchQuery(query)
    onSearch?.(query)
  }

  const handleDelete = () => {
    onDelete?.()
  }

  const handleFilterToggle = () => {
    const newState = !isFilterActive
    onFilterToggle?.(newState)
  }

  return (
    <div 
      className="w-full h-8 border-b border-[#f0f0f0] dark:border-[#3C3C3C]"
    >
      <div 
        className="w-full h-full flex items-center px-5 py-1"
      >
        <Search 
          size={16} 
          className="text-[#8A8A8E] dark:text-[#9FA0A2] flex-shrink-0"
          style={{ width: '16px', height: '16px' }}
          onClick={() => inputRef.current?.focus()}
        />
        <input
          ref={inputRef}
          type="text"
          placeholder="Search..."
          autoComplete="off"
          value={searchQuery}
          onChange={handleInputChange}
          className="w-full outline-none border-none bg-transparent focus:bg-transparent placeholder:text-[#c4c4c6] dark:placeholder:text-[#626265] placeholder:font-medium ml-1 text-sm text-[#5c5c5c] dark:text-[#BDBEC2]"
          style={{
            lineHeight: '1rem'
          }}
        />
        {showDeleteButton && (
          <Trash2
            size={16}
            className="cursor-pointer ml-1 text-[#8A8A8E] dark:text-[#9FA0A2] hover:text-[#262626] dark:hover:text-[#FFFFFF] flex-shrink-0"
            style={{ width: '16px', height: '16px' }}
            onClick={handleDelete}
          />
        )}
        {onFilterToggle && (
          <div 
            className="flex items-center group cursor-pointer ml-1"
            onClick={handleFilterToggle}
            data-filter-button="true"
          >
            <ListFilter
              size={16}
              className="flex-shrink-0 text-[#8A8A8E] dark:text-[#9FA0A2] group-hover:text-[#262626] dark:group-hover:text-[#FFFFFF] transition-colors"
              style={{ width: '16px', height: '16px' }}
            />
            {selectedRegion && (
              <span className="ml-1 text-sm text-[#8A8A8E] dark:text-[#9FA0A2] group-hover:text-[#262626] dark:group-hover:text-[#FFFFFF] flex-shrink-0 transition-colors">
                {selectedRegion === 'all' ? 'All' :
                 selectedRegion === 'code' ? 'Code' : 
                 selectedRegion === 'stack' ? 'Stack' : 
                 selectedRegion === 'game' ? 'Game' : 
                 selectedRegion === 'user' ? 'User' : ''}
              </span>
            )}
          </div>
        )}
      </div>
      {children}
    </div>
  )
}