'use client'

import React, { useEffect } from 'react'
import Confetti from 'react-confetti'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'
import Card from '@/components/Card'
import ExecutionBar from '@/components/bar/ExecutionBar'
import DebuggerBar from '@/components/bar/DebuggerBar'
import IconButton from '@/components/IconButton'
import MapRenderer from '@/components/MapRenderer'
import WaterRenderer from '@/components/WaterRenderer'
import CodeEditor from '@/components/CodeEditor'
import RegisterPanel from '@/components/panel/RegisterPanel'
import MemoryPanel from '@/components/panel/MemoryPanel'
import DiagnosticsPanel from '@/components/panel/DiagnosticsPanel'
import GuidePanel from '@/components/panel/GuidePanel'
import { MemoryRegion } from '@/components/MemoryFilter'
import SubBar from '@/components/bar/SubBar'
import QueryBar from '@/components/bar/QueryBar'
import { useEmulator } from '@/hooks/useEmulator'
import { useGameState } from '@/hooks/useGameState'
import { usePanelLayout } from '@/hooks/usePanelLayout'
import { useExecutionControl } from '@/hooks/useExecutionControl'
import { useDiagnosticsStore } from '@/stores/diagnosticsStore'
import { KeyboardControl } from '@/hooks/useKeyboardControl'
import { useChallengeScore } from '@/hooks/useChallengeScore'
import { Gamepad2, CodeXml, CircuitBoard, HardDrive, Settings2, ArrowLeft, Stethoscope, Maximize2, Minimize2, Book } from 'lucide-react'
import { GameMap } from '@/data/maps'
import SettingsPanel from '@/components/SettingsPanel'

interface GamePageProps {
  levelMap: GameMap
  levelId: string
  isChallenge?: boolean
}

export default function GamePage({ levelMap, levelId, isChallenge = false }: GamePageProps) {
  // Initialize hooks
  const emulator = useEmulator()
  const errors = useDiagnosticsStore((state) => state.errors)
  const gameState = useGameState(levelMap, levelMap.initialCode || '')
  const panelLayout = usePanelLayout()
  const executionControl = useExecutionControl({ gameState, levelMap })
  const [isMemoryFilterOpen, setIsMemoryFilterOpen] = React.useState(false)
  const [selectedMemoryRegion, setSelectedMemoryRegion] = React.useState<MemoryRegion>('all')
  const [isSettingsOpen, setIsSettingsOpen] = React.useState(false)
  
  // Challenge mode scoring
  const { formattedScore } = useChallengeScore(isChallenge, gameState)

  // Cleanup emulator on unmount
  useEffect(() => {
    return () => {
      emulator.cleanup()
    }
  }, [emulator.cleanup])
  
  // Switch to Diagnostics tab when new error appears
  useEffect(() => {
    if (errors.length > 0) {
      gameState.setRightPanelTab(2) // Switch to Diagnostics tab (index 2)
    }
  }, [errors.length, gameState.setRightPanelTab])

  return (
    <KeyboardControl
      enabled={process.env.NODE_ENV === 'development' && !gameState.isPlayMode && !gameState.isDebugMode}
      currentMap={gameState.currentMap}
      onMapUpdate={gameState.setCurrentMap}
    >
      <div className="h-screen w-full overflow-hidden bg-[#f0f0f0] dark:bg-[#0f0f0f]">
      <div className="p-2 h-full flex flex-col">
        <div className="flex justify-center relative">
          <div className="absolute left-0 top-0">
            <IconButton icon={ArrowLeft} />
          </div>
          <div className="relative">
            <ExecutionBar 
              onDebugClick={executionControl.handleDebugClick}
              onPlayClick={executionControl.handlePlayClick}
              isDebugMode={gameState.isDebugMode}
              isPlayMode={gameState.isPlayMode}
              playStatus={gameState.playStatus}
              hasWon={gameState.hasWon}
              currentLevel={levelId}
              isChallenge={isChallenge}
              challengeScore={formattedScore}
            />
            <div className={`absolute inset-0 transition-opacity duration-200 ${gameState.isDebugMode ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
              <DebuggerBar 
                onReturnClick={() => gameState.setIsDebugMode(false)} 
                onStopClick={executionControl.handleStopClick}
                onStepDown={executionControl.handleStepDown}
                onStepUp={executionControl.handleStepUp}
                onReplay={executionControl.handleReplay}
                canStepUp={executionControl.debugState.canStepUp}
                canStepDown={executionControl.debugState.canStepDown}
              />
            </div>
          </div>
          <div className="absolute right-0 top-0 flex gap-2">
            <IconButton 
              icon={gameState.isFullscreen ? Minimize2 : Maximize2} 
              onClick={gameState.toggleFullscreen}
              size={15}
            />
            <IconButton icon={Settings2} onClick={() => setIsSettingsOpen(true)} />
          </div>
        </div>
        <div className="flex-1 pt-2 overflow-hidden">
        <ResizablePanelGroup direction="horizontal" className="h-full">
        {/* First column with two panels */}
        <ResizablePanel defaultSize={33} ref={panelLayout.firstColumnRef} minSize={10}>
          <ResizablePanelGroup direction="vertical" className="h-full">
            <ResizablePanel defaultSize={70} ref={panelLayout.panel1Ref} minSize={10}>
              <Card 
                tabs={[
                  { icon: Gamepad2, text: "Game", color: "#3579f6" },
                  { icon: Book, text: "Guide", color: "#FE5C02" }
                ]}
                selectedTab={gameState.leftPanelTab}
                onTabChange={gameState.setLeftPanelTab}
                tabContent={[
                  <div key="game" className="w-full h-full relative overflow-hidden">
                  {gameState.currentPlayWon && (
                    <div className="absolute inset-0 z-20">
                      <Confetti
                        recycle={false}
                        numberOfPieces={500}
                        wind={0.05}
                        gravity={0.25}
                      />
                    </div>
                  )}
                  {levelMap.waterBackground && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="relative flex items-center justify-center">
                        <WaterRenderer 
                          tilesX={levelMap.waterBackground.tilesX} 
                          tilesY={levelMap.waterBackground.tilesY}
                          tileSize={levelMap.tileSize || 64}
                        />
                        <div className="absolute inset-0 flex items-center justify-center z-10">
                          <MapRenderer map={gameState.currentMap} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>,
                  <GuidePanel key="guide" />
                ]}
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
        
        <ResizableHandle 
          style={{ width: '8px' }}
          onDoubleClick={panelLayout.resetHorizontalPanels}
        />
        
        {/* Second column */}
        <ResizablePanel defaultSize={34} ref={panelLayout.panel3Ref} minSize={10}>
          <Card tabs={[{ icon: CodeXml, text: "Code", color: "#4fae40" }]}>
            <CodeEditor 
              value={gameState.currentCode} 
              onChange={(value) => gameState.setCurrentCode(value || '')}
              disabled={gameState.isCodeDisabled}
              highlightedLine={gameState.highlightedLine}
            />
          </Card>
        </ResizablePanel>
        
        <ResizableHandle 
          style={{ width: '8px' }}
          onDoubleClick={panelLayout.resetHorizontalPanels}
        />
        
        {/* Third column */}
        <ResizablePanel defaultSize={33} ref={panelLayout.panel4Ref} minSize={10}>
          <Card 
            tabs={[
              { icon: CircuitBoard, text: "Register", color: "#9164EA" },
              { icon: HardDrive, text: "Memory", color: "#01A2C2" },
              { icon: Stethoscope, text: "Diagnostics", color: "#FF0033" }
            ]}
            selectedTab={gameState.rightPanelTab}
            onTabChange={gameState.setRightPanelTab}
            tabContent={[
              <div key="register" className="h-full flex flex-col">
                <SubBar>
                  <div className="w-1/4 text-center text-[#8a8a8e] dark:text-[#9FA0A2] text-sm">Reg</div>
                  <div className="w-1/2 text-center text-[#8a8a8e] dark:text-[#9FA0A2] text-sm">Hex</div>
                  <div className="w-1/4 text-center text-[#8a8a8e] dark:text-[#9FA0A2] text-sm">Dec</div>
                </SubBar>
                <div 
                  className="flex-1 overflow-y-auto"
                  style={{
                    scrollbarWidth: 'none',
                    msOverflowStyle: 'none'
                  }}
                >
                  <RegisterPanel 
                    registers={executionControl.currentDebugState?.registers} 
                    previousRegisters={executionControl.previousDebugState?.registers}
                  />
                </div>
              </div>,
              <div key="memory" className="h-full flex flex-col relative">
                <QueryBar 
                  onSearch={gameState.setMemorySearchQuery} 
                  onFilterToggle={() => setIsMemoryFilterOpen(prev => !prev)}
                  isFilterActive={isMemoryFilterOpen}
                  selectedRegion={selectedMemoryRegion}
                />
                <div 
                  className="flex-1 overflow-y-auto"
                  style={{
                    scrollbarWidth: 'none',
                    msOverflowStyle: 'none'
                  }}
                >
                  <MemoryPanel 
                    searchQuery={gameState.memorySearchQuery} 
                    hideZeroRows={gameState.hideZeroRows}
                    codeMemory={executionControl.currentDebugState?.codeMemory}
                    stackMemory={executionControl.currentDebugState?.stackMemory}
                    dataMemory={executionControl.currentDebugState?.dataMemory}
                    isFilterOpen={isMemoryFilterOpen}
                    onFilterClose={() => setIsMemoryFilterOpen(false)}
                    selectedRegion={selectedMemoryRegion}
                    onRegionChange={setSelectedMemoryRegion}
                  />
                </div>
              </div>,
              <div key="diagnostics" className="h-full">
                <DiagnosticsPanel />
              </div>
            ]}
          />
        </ResizablePanel>
        </ResizablePanelGroup>
        </div>
      </div>
      <SettingsPanel isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      </div>
    </KeyboardControl>
  )
}
