'use client'

import { GameMap } from '@/data/maps'

// Local copy of editor tool type to avoid circular imports
type ToolType = 'air' | 'grass' | 'dot' | 'pacman' | 'ghost'

interface MapGridOverlayProps {
  map: GameMap
  selectedTool?: ToolType
  onTileClick?: (row: number, col: number) => void
  onTileMouseDown: (row: number, col: number) => void
  onTileMouseEnter: (row: number, col: number) => void
  onTileMouseUp: () => void
}

export default function MapGridOverlay({ map, selectedTool, onTileMouseDown, onTileMouseEnter, onTileMouseUp }: MapGridOverlayProps) {
  const tileSize = map.tileSize || 64

  return (
    <div
      className="absolute pointer-events-none"
      style={{
        top: 0,
        left: 0,
        width: map.width * tileSize,
        height: map.height * tileSize,
        display: 'grid',
        gridTemplateColumns: `repeat(${map.width}, ${tileSize}px)`,
        gridTemplateRows: `repeat(${map.height}, ${tileSize}px)`,
      }}
      onMouseUp={onTileMouseUp}
      onMouseLeave={onTileMouseUp}
    >
      {Array.from({ length: map.height }, (_, rowIndex) =>
        Array.from({ length: map.width }, (_, colIndex) => {
          const tile = map.tiles[rowIndex][colIndex]
          const isActionTool = selectedTool === 'dot' || selectedTool === 'pacman' || selectedTool === 'ghost'
          // For action tools, allow on grass or dot (and entities on them)
          const isPlaceableSurface = tile === ' ' || tile === '.'
          const cursor = isActionTool ? (isPlaceableSurface ? 'pointer' : 'default') : 'pointer'

          return (
            <div
              key={`${rowIndex}-${colIndex}`}
              className="border-t border-l border-gray-400/[0.07] dark:border-gray-600/[0.07] hover:bg-white/10 dark:hover:bg-transparent pointer-events-auto transition-colors"
              style={{
                borderRightWidth: colIndex === map.width - 1 ? '1px' : '0',
                borderBottomWidth: rowIndex === map.height - 1 ? '1px' : '0',
                cursor,
              }}
              onMouseDown={(e) => {
                e.stopPropagation()
                onTileMouseDown(rowIndex, colIndex)
              }}
              onMouseEnter={(e) => {
                e.stopPropagation()
                onTileMouseEnter(rowIndex, colIndex)
              }}
            />
          )
        })
      ).flat()}
    </div>
  )
}
