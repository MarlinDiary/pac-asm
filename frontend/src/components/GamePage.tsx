'use client'

import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import Confetti from 'react-confetti'
import DeathOverlay from '@/components/DeathOverlay'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'
import Card from '@/components/Card'
import ExecutionBar from '@/components/bar/ExecutionBar'
import DebuggerBar from '@/components/bar/DebuggerBar'
import IconButton from '@/components/IconButton'
import MapRenderer from '@/components/MapRenderer'
import WaterRenderer from '@/components/WaterRenderer'
import SubmissionReplayModal from '@/components/SubmissionReplayModal'
import CodeEditor from '@/components/CodeEditor'
import RegisterPanel from '@/components/panel/RegisterPanel'
import MemoryPanel from '@/components/panel/MemoryPanel'
import DiagnosticsPanel from '@/components/panel/DiagnosticsPanel'
import GuidePanel from '@/components/panel/GuidePanel'
import HintPanel from '@/components/panel/HintPanel'
import RankingPanel from '@/components/panel/RankingPanel'
import type { RankingSubmitController } from '@/components/panel/RankingPanel'
import { MemoryRegion } from '@/components/MemoryFilter'
import SubBar from '@/components/bar/SubBar'
import QueryBar from '@/components/bar/QueryBar'
import { useEmulator } from '@/hooks/useEmulator'
import { useGameState } from '@/hooks/useGameState'
import { usePanelLayout } from '@/hooks/usePanelLayout'
import { useExecutionControl } from '@/hooks/useExecutionControl'
import type { RankingEntry } from '@/hooks/useExecutionControl'
import { useJsPlayRunner } from '@/hooks/useJsPlayRunner'
import { useDiagnosticsStore } from '@/stores/diagnosticsStore'
import { Gamepad2, CodeXml, CircuitBoard, HardDrive, Settings2, Stethoscope, Maximize2, Minimize2, Book, Trophy, ChevronLeft, ChevronRight, CircleUserRound, LogOut, Lightbulb } from 'lucide-react'
import { GameMap } from '@/data/maps'
import SettingsPanel from '@/components/SettingsPanel'
import { useSettings } from '@/hooks/useSettings'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { signIn, signOut, useSession } from 'next-auth/react'
import Image from 'next/image'

const AUTO_SAVE_DEBOUNCE_MS = 400

interface GamePageProps {
  levelMap: GameMap
  levelId: string
  isChallenge?: boolean
}

export default function GamePage({ levelMap, levelId, isChallenge = false }: GamePageProps) {
  // Initialize hooks
  const emulator = useEmulator()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { data: session, status } = useSession()
  const isAuthenticated = status === 'authenticated'
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)
  const userMenuRef = useRef<HTMLDivElement | null>(null)
  const [secretClickCount, setSecretClickCount] = useState(0)
  const secretClickTimer = useRef<NodeJS.Timeout | null>(null)

  // Get level display name
  const getLevelDisplayName = (id: string): string => {
    if (id === 'challenge') return 'Challenge'
    const levelNumber = id.replace('level', '')
    switch (levelNumber) {
      case '1': return 'Level One'
      case '2': return 'Level Two'
      case '3': return 'Level Three'
      case '4': return 'Level Four'
      default: return `Level ${levelNumber}`
    }
  }

  // Navigation handlers
  const handlePreviousLevel = () => {
    if (levelId === 'level1' || levelId === '1') return // Can't go back from level1

    if (levelId === 'challenge') {
      router.push('/level/4')
    } else {
      const currentLevel = parseInt(levelId.replace('level', ''))
      if (currentLevel > 1) {
        router.push(`/level/${currentLevel - 1}`)
      }
    }
  }

  const handleNextLevel = () => {
    if (levelId === 'challenge') return // Can't go forward from challenge

    const currentLevel = parseInt(levelId.replace('level', ''))
    if (currentLevel < 4) {
      router.push(`/level/${currentLevel + 1}`)
    } else if (currentLevel === 4) {
      router.push('/challenge')
    }
  }

  const handleLogin = useCallback(() => {
    const callbackUrl = typeof window !== 'undefined' ? window.location.href : pathname ?? '/'
    signIn('github', { callbackUrl })
  }, [pathname])

  const handleLogout = useCallback(() => {
    setIsUserMenuOpen(false)
    const callbackUrl = typeof window !== 'undefined' ? window.location.href : pathname ?? '/'
    signOut({ callbackUrl })
  }, [pathname])

  // Check if navigation is disabled
  const isPreviousDisabled = levelId === 'level1' || levelId === '1'
  const isNextDisabled = levelId === 'challenge'
  const errors = useDiagnosticsStore((state) => state.errors)
  const { settings } = useSettings()
  const { cleanup } = emulator
  const codeStorageKey = useMemo(
    () => `pacasm-code-${levelId}-${settings.architecture}`,
    [levelId, settings.architecture]
  )

  const defaultLevelCode = useMemo(() => {
    const code = levelMap.initialCode
    if (!code) return ''
    if (typeof code === 'string') return code
    return settings.architecture === 'ARM' ? code.ARM : code.MIPS_R6
  }, [levelMap.initialCode, settings.architecture])

  const getInitialCode = useCallback((): string => {
    if (typeof window !== 'undefined') {
      const stored = window.localStorage.getItem(codeStorageKey)
      if (stored !== null) {
        return stored
      }
    }
    return defaultLevelCode
  }, [codeStorageKey, defaultLevelCode])

  const initialCode = useMemo(
    () => getInitialCode(),
    [getInitialCode]
  )

  const normalizedLevelId = useMemo(() => {
    if (levelId === 'challenge' || levelId.startsWith('level')) {
      return levelId
    }
    return `level${levelId}`
  }, [levelId])

  useEffect(() => {
    if (!isUserMenuOpen) {
      return
    }

    const handleDocumentClick = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false)
      }
    }

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsUserMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleDocumentClick)
    document.addEventListener('keydown', handleKeydown)

    return () => {
      document.removeEventListener('mousedown', handleDocumentClick)
      document.removeEventListener('keydown', handleKeydown)
    }
  }, [isUserMenuOpen])

  useEffect(() => {
    if (!isAuthenticated) {
      setIsUserMenuOpen(false)
    }
  }, [isAuthenticated])

  const gameState = useGameState(levelMap, initialCode)
  const panelLayout = usePanelLayout()
  const jsPlayRunner = useJsPlayRunner()
  const executionControl = useExecutionControl({
    gameState,
    levelMap,
    levelId: normalizedLevelId,
    architecture: settings.architecture
  })
  const [selectedReplayEntry, setSelectedReplayEntry] = useState<RankingEntry | null>(null)
  const [isMemoryFilterOpen, setIsMemoryFilterOpen] = useState(false)
  const [selectedMemoryRegion, setSelectedMemoryRegion] = useState<MemoryRegion>('all')
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const { setCurrentCode, setRightPanelTab, setCodeOverride } = gameState
  const challengeScore = executionControl.formattedScore
  const submitController = useMemo<RankingSubmitController>(() => ({
    isSubmitting: executionControl.isSubmitting,
    setIsSubmitting: executionControl.setIsSubmitting,
    getSourceCode: () => {
      const raw = gameState.currentCode ?? ''
      const codeToSubmit = gameState.codeOverride ?? gameState.currentCode ?? ''
      return {
        trimmed: codeToSubmit.trim(),
        raw
      }
    },
    isCodeDisabled: gameState.isCodeDisabled,
    setIsCodeDisabled: gameState.setIsCodeDisabled,
    setRankingLoading: executionControl.setRankingLoading,
    applySubmissionResult: executionControl.applySubmissionResult
  }), [
    executionControl.isSubmitting,
    executionControl.setIsSubmitting,
    gameState.currentCode,
    gameState.codeOverride,
    gameState.isCodeDisabled,
    gameState.setIsCodeDisabled,
    executionControl.setRankingLoading,
    executionControl.applySubmissionResult
  ])

  // Handle tab parameter from URL (e.g., after login redirect)
  useEffect(() => {
    const tab = searchParams.get('tab')
    if (tab === 'ranking') {
      gameState.setLeftPanelTab(3) // Ranking tab is at index 3 (Game=0, Manual=1, Hint=2, Ranking=3)
      // Clean up the URL parameter
      const url = new URL(window.location.href)
      url.searchParams.delete('tab')
      window.history.replaceState({}, '', url.pathname)
    }
  }, [searchParams, gameState])

  // Reset code when architecture changes
  useEffect(() => {
    setCurrentCode(initialCode)
  }, [initialCode, setCurrentCode])

  useEffect(() => {
    setSelectedReplayEntry(null)
  }, [normalizedLevelId, settings.architecture])

  const handleResetCode = useCallback(() => {
    setCodeOverride(null)
    setCurrentCode(defaultLevelCode)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(codeStorageKey, defaultLevelCode)
    }
  }, [setCodeOverride, setCurrentCode, defaultLevelCode, codeStorageKey])

  // Handle JS random play for development testing
  const handleJsRandomPlay = useCallback(async () => {
    gameState.setLeftPanelTab(0)
    gameState.setCurrentPlayWon(false)
    gameState.setCurrentPlayGameOver(false)
    const result = await jsPlayRunner.startRandomPlay(levelMap)
    console.log('[JS Random Play] Result:', result)
    if (result.success) {
      gameState.setCurrentPlayWon(true)
      gameState.setHasWon(true)
    } else if (result.reason === 'game_over') {
      gameState.setCurrentPlayGameOver(true)
    }
  }, [jsPlayRunner, levelMap, gameState])

  // Secret: click level name 10 times to trigger random play
  const handleLevelNameClick = useCallback(() => {
    if (!isChallenge || executionControl.isBusy || selectedReplayEntry) return

    if (secretClickTimer.current) {
      clearTimeout(secretClickTimer.current)
    }

    const newCount = secretClickCount + 1
    setSecretClickCount(newCount)

    if (newCount >= 5) {
      setSecretClickCount(0)
      if (jsPlayRunner.isPlaying) {
        jsPlayRunner.stopPlay()
      } else {
        handleJsRandomPlay()
      }
    } else {
      // Reset counter after 2 seconds of no clicks
      secretClickTimer.current = setTimeout(() => {
        setSecretClickCount(0)
      }, 2000)
    }
  }, [isChallenge, executionControl.isBusy, selectedReplayEntry, secretClickCount, jsPlayRunner, handleJsRandomPlay])

  // Sync JS play runner map to game state
  useEffect(() => {
    if (jsPlayRunner.currentMap) {
      gameState.setCurrentMap(jsPlayRunner.currentMap)
    }
  }, [jsPlayRunner.currentMap, gameState])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const timeoutId = window.setTimeout(() => {
      window.localStorage.setItem(codeStorageKey, gameState.currentCode ?? '')
    }, AUTO_SAVE_DEBOUNCE_MS)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [codeStorageKey, gameState.currentCode])
  // Cleanup emulator on unmount
  useEffect(() => {
    return () => {
      cleanup()
    }
  }, [cleanup])
  
  // Switch to Diagnostics tab when new error appears
  useEffect(() => {
    if (errors.length > 0) {
      setRightPanelTab(2) // Switch to Diagnostics tab (index 2)
    }
  }, [errors.length, setRightPanelTab])

  return (
    <div className="h-screen w-full overflow-hidden bg-[#f0f0f0] dark:bg-[#0f0f0f]">
      <div className="p-2 h-full flex flex-col" style={{ zoom: settings.pageZoom === 110 ? 1.11 : settings.pageZoom / 100 }}>
        <div className="flex justify-center relative">
          <div className="absolute left-0 top-0 flex items-center h-10 gap-1">
            <IconButton
              icon={ChevronLeft}
              onClick={handlePreviousLevel}
              disabled={isPreviousDisabled}
            />
            <div
              className="h-8 px-3 flex items-center select-none"
              onClick={handleLevelNameClick}
            >
              <span className="text-[14px] font-medium text-[#1A1A1A] dark:text-[#F5F5F5]">
                {getLevelDisplayName(levelId)}
              </span>
            </div>
            <IconButton
              icon={ChevronRight}
              onClick={handleNextLevel}
              disabled={isNextDisabled}
            />
          </div>
          <div className="relative">
            <ExecutionBar
              onDebugClick={executionControl.handleDebugClick}
              onPlayClick={executionControl.handlePlayClick}
              isDebugMode={gameState.isDebugMode}
              statusMessage={executionControl.statusMessage}
              isBusy={executionControl.isBusy}
              hasWon={gameState.hasWon}
              currentLevel={normalizedLevelId}
              isChallenge={isChallenge}
            />
            <div
              className={`absolute inset-0 transition-opacity duration-200 ${
                gameState.isDebugMode && executionControl.isDebuggerBarVisible
                  ? 'opacity-100'
                  : 'opacity-0 pointer-events-none'
              }`}
            >
              {gameState.isDebugMode && executionControl.isDebuggerBarVisible ? (
                <DebuggerBar 
                  onReturnClick={() => gameState.setIsDebugMode(false)} 
                  onStopClick={executionControl.handleStopClick}
                  onStepDown={executionControl.handleStepDown}
                  onStepUp={executionControl.handleStepUp}
                  onReplay={executionControl.handleReplay}
                  canStepUp={executionControl.debugState.canStepUp}
                  canStepDown={executionControl.debugState.canStepDown}
                />
              ) : null}
            </div>
          </div>
          <div className="absolute right-0 top-0 flex items-center gap-2">
            <IconButton
              icon={gameState.isFullscreen ? Minimize2 : Maximize2}
              onClick={gameState.toggleFullscreen}
              size={15}
            />
            <IconButton icon={Settings2} onClick={() => setIsSettingsOpen(true)} />
            <div className="relative" ref={userMenuRef}>
              {isAuthenticated ? (
                <IconButton
                  icon={session?.user?.image ? undefined : CircleUserRound}
                  onClick={() => setIsUserMenuOpen((open) => !open)}
                  size={17}
                  customContent={session?.user?.image ? (
                    <Image
                      src={session.user.image}
                      alt={session.user.name ?? 'User avatar'}
                      width={17}
                      height={17}
                      className="rounded-full object-cover grayscale"
                    />
                  ) : undefined}
                />
              ) : (
                <IconButton
                  icon={CircleUserRound}
                  onClick={handleLogin}
                  size={17}
                />
              )}

              {isAuthenticated && (
                <div className={`absolute right-0 mt-1 w-36 rounded-lg p-2 overflow-auto focus:outline-none shadow-lg shadow-black/10 dark:shadow-black/20 bg-white dark:bg-[#303030] border border-[#F0F0F0] dark:border-[#3C3C3C] z-10 transition-all duration-200 origin-top-right ${
                  isUserMenuOpen
                    ? 'opacity-100 scale-100 translate-y-0 pointer-events-auto'
                    : 'opacity-0 scale-95 -translate-y-1 pointer-events-none'
                }`}>
                  <div
                    className="cursor-pointer select-none relative h-8 py-1.5 px-2 rounded hover:bg-[#f0f0f0] dark:hover:bg-[#2a2a2a] text-[#5a5a5a] dark:text-[#a0a0a0] font-normal"
                    role="menuitem"
                    onClick={handleLogout}
                  >
                    <div className="flex h-5 items-center gap-2">
                      <LogOut className="h-4 w-4" />
                      <div className="truncate text-sm">Log out</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
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
                  { icon: Book, text: "Manual", color: "#50AE40" },
                  { icon: Lightbulb, text: "Hint", color: "#A2470F", darkColor: "#FFAB70" },
                  { icon: Trophy, text: "Ranking", color: "#FFB700" }
                ]}
                selectedTab={gameState.leftPanelTab}
                onTabChange={gameState.setLeftPanelTab}
                tabContent={[
                  <div key="game" className="w-full h-full flex flex-col">
                    {isChallenge && (
                      <SubBar>
                        <div className="w-full flex items-center justify-center">
                          <span className="text-[#8a8a8e] dark:text-[#9FA0A2] text-sm">
                            Score: <span className="font-mono">{jsPlayRunner.isPlaying ? jsPlayRunner.formattedScore : challengeScore}</span>
                          </span>
                        </div>
                      </SubBar>
                    )}
                    <div className="flex-1 relative overflow-hidden">
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
                      <DeathOverlay
                        show={gameState.currentPlayGameOver}
                        onComplete={() => gameState.setCurrentPlayGameOver(false)}
                      />
                      <DeathOverlay
                        show={gameState.currentPlayObjectiveNotMet}
                        message="OBJECTIVE NOT MET"
                        fontSize="2rem"
                        onComplete={() => gameState.setCurrentPlayObjectiveNotMet(false)}
                      />
                      {levelMap.waterBackground && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="relative flex items-center justify-center">
                            <WaterRenderer
                              tilesX={levelMap.waterBackground.tilesX}
                              tilesY={levelMap.waterBackground.tilesY}
                              tileSize={levelMap.tileSize || 64}
                            />
                            <div className="absolute inset-0 flex items-center justify-center z-10">
                              <MapRenderer map={gameState.currentMap} shouldShakePlayer={gameState.shouldShakePlayer} />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>,
                  <GuidePanel key="guide" />,
                  <HintPanel key="hint" />,
                  <RankingPanel
                    key="ranking"
                    levelId={normalizedLevelId}
                    architecture={settings.architecture}
                    entries={executionControl.filteredRankingEntries}
                    isLoading={executionControl.isRankingLoading}
                    submitController={submitController}
                    isAuthenticated={isAuthenticated}
                    onSelectReplay={setSelectedReplayEntry}
                    onLogin={() => {
                      // Save current URL with ranking tab parameter
                      const callbackUrl = `${pathname}?tab=ranking`
                      signIn('github', { callbackUrl })
                    }}
                  />
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
              value={gameState.codeOverride ?? gameState.currentCode}
              onChange={(value) => {
                if (!gameState.codeOverride) {
                  gameState.setCurrentCode(value || '')
                }
              }}
              disabled={gameState.isCodeDisabled}
              highlightedLine={gameState.highlightedLine}
              highlightedLines={gameState.highlightedLines}
              highlightedLineSecondary={gameState.highlightedLineSecondary}
              breakpoints={gameState.breakpoints}
              onBreakpointsChange={gameState.setBreakpoints}
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
              { icon: Stethoscope, text: "Diagnostics", color: "#DF0D25", darkColor: "#FF6B6B" }
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
                    architecture={settings.architecture}
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
    <SettingsPanel
      isOpen={isSettingsOpen}
      onClose={() => setIsSettingsOpen(false)}
      isRunning={executionControl.isBusy}
      isDebugMode={gameState.isDebugMode}
      onResetCode={handleResetCode}
    />
    <SubmissionReplayModal
      entry={selectedReplayEntry}
      levelMap={levelMap}
      onClose={() => setSelectedReplayEntry(null)}
    />
  </div>
  )
}
