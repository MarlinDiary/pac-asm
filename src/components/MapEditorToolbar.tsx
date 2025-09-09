'use client'

import { SquareDashed, Square, Circle, Ghost, User } from 'lucide-react'
import { ToolType } from '@/components/MapEditor'

interface MapEditorToolbarProps {
  selectedTool: ToolType
  onToolSelect: (tool: ToolType) => void
}

const tools = [
  {
    type: 'air' as ToolType,
    icon: SquareDashed,
    label: 'Air/Wall'
  },
  {
    type: 'grass' as ToolType,
    icon: Square,
    label: 'Grass'
  },
  {
    type: 'dot' as ToolType,
    icon: Circle,
    label: 'Dot'
  },
  {
    type: 'pacman' as ToolType,
    icon: User,
    label: 'Pacman'
  },
  {
    type: 'ghost' as ToolType,
    icon: Ghost,
    label: 'Ghost'
  }
]

export default function MapEditorToolbar({ selectedTool, onToolSelect }: MapEditorToolbarProps) {
  return (
    <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 h-12 px-3 flex items-center">
        <div className="flex gap-3">
          {tools.map((tool) => {
            const Icon = tool.icon
            const isSelected = selectedTool === tool.type
            
            return (
              <button
                key={tool.type}
                onClick={() => onToolSelect(tool.type)}
                className={`
                  flex items-center justify-center w-8 h-8 transition-all duration-200
                  ${isSelected 
                    ? 'text-[#D94B18]' 
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                  }
                `}
                title={tool.label}
              >
                <Icon 
                  size={20} 
                  strokeWidth={isSelected ? 3 : 2}
                />
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}