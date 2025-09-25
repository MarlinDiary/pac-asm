'use client'

import React, { useEffect, useRef } from 'react'
import { Cog, CodeXml } from 'lucide-react'
import { useTheme } from 'next-themes'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useSettings } from '@/hooks/useSettings'

interface SettingsPanelProps {
  isOpen: boolean
  onClose: () => void
}

interface SidebarItem {
  id: string
  label: string | React.ReactNode
  icon: React.ReactNode
}

export default function SettingsPanel({ isOpen, onClose }: SettingsPanelProps) {
  const [selectedSection, setSelectedSection] = React.useState('general')

  const sidebarItems: SidebarItem[] = [
    { id: 'general', label: 'General', icon: <Cog className="w-4 h-4" style={{ width: '16px', height: '16px' }} /> },
    { id: 'editor', label: 'Editor', icon: <CodeXml className="w-4 h-4" style={{ width: '16px', height: '16px' }} /> },
  ]
  const { settings, updateSetting } = useSettings()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  // Avoid hydration mismatch
  React.useEffect(() => {
    setMounted(true)
  }, [])

  // Prevent body scroll when panel is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }

    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  // Handle escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
    }

    return () => {
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, onClose])

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-[#0f0f0f]/60 z-40 transition-opacity duration-150 cursor-pointer ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className={`fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[calc(100vh-100px)] max-h-[760px] w-full max-w-[696px] bg-white dark:bg-[#262626] rounded-md shadow-[0_0_20px_rgba(0,0,0,0.2)] border border-black/10 dark:border-white/10 z-50 flex transition-all duration-150 overflow-hidden ${
          isOpen
            ? 'opacity-100 scale-100'
            : 'opacity-0 scale-95 pointer-events-none'
        }`}
      >
        {/* Sidebar */}
        <div className="flex w-[216px] shrink-0 flex-col bg-[#FAFAFA] dark:bg-[#262626] border-r border-black/10 dark:border-white/10">
          <div className="flex-1 p-2">
            <nav className="space-y-1">
              {sidebarItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setSelectedSection(item.id)}
                  className={`box-border flex h-8 w-full items-center rounded-md px-2 shrink-0 gap-2 text-xs transition-colors cursor-pointer ${
                    selectedSection === item.id
                      ? 'bg-[#E7E7E7] dark:bg-[#0F0F0F] text-gray-900 dark:text-gray-100 font-semibold'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-[#F0F0F0] dark:hover:bg-[#222222]'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 relative overflow-y-auto">
          {selectedSection === 'general' && (
            <>
              <div className="py-3.5 px-6">
                <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">
                  General
                </h3>
              </div>
              <div className="border-t border-black/10 dark:border-white/10" />
              <div className="px-6 py-4">
                <div className="space-y-4">
                  <div className="flex items-center justify-between h-8">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Appearance
                    </label>
                    {mounted ? (
                      <Select value={theme || 'system'} onValueChange={setTheme}>
                        <SelectTrigger className="w-auto border-0 bg-transparent dark:bg-transparent p-0 h-auto cursor-pointer focus:ring-0 focus-visible:ring-0 shadow-none hover:bg-transparent dark:hover:bg-transparent">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="min-w-[180px] rounded-lg p-2 shadow-lg shadow-black/10 dark:shadow-black/20 bg-white dark:bg-[#303030] border border-[#F0F0F0] dark:border-[#3C3C3C]">
                          <SelectItem
                            value="system"
                            className="h-8 py-1.5 pl-2 pr-12 rounded hover:bg-[#f0f0f0] dark:hover:bg-[#2a2a2a] text-sm cursor-pointer focus:bg-[#f0f0f0] dark:focus:bg-[#2a2a2a] data-[state=checked]:text-[#262626] dark:data-[state=checked]:text-white data-[state=checked]:font-medium data-[state=unchecked]:text-[#5a5a5a] dark:data-[state=unchecked]:text-[#a0a0a0] data-[state=unchecked]:font-normal [&_svg]:text-[#01A2C3]"
                          >
                            Use system setting
                          </SelectItem>
                          <SelectItem
                            value="light"
                            className="h-8 py-1.5 pl-2 pr-12 rounded hover:bg-[#f0f0f0] dark:hover:bg-[#2a2a2a] text-sm cursor-pointer focus:bg-[#f0f0f0] dark:focus:bg-[#2a2a2a] data-[state=checked]:text-[#262626] dark:data-[state=checked]:text-white data-[state=checked]:font-medium data-[state=unchecked]:text-[#5a5a5a] dark:data-[state=unchecked]:text-[#a0a0a0] data-[state=unchecked]:font-normal [&_svg]:text-[#01A2C3]"
                          >
                            Light
                          </SelectItem>
                          <SelectItem
                            value="dark"
                            className="h-8 py-1.5 pl-2 pr-12 rounded hover:bg-[#f0f0f0] dark:hover:bg-[#2a2a2a] text-sm cursor-pointer focus:bg-[#f0f0f0] dark:focus:bg-[#2a2a2a] data-[state=checked]:text-[#262626] dark:data-[state=checked]:text-white data-[state=checked]:font-medium data-[state=unchecked]:text-[#5a5a5a] dark:data-[state=unchecked]:text-[#a0a0a0] data-[state=unchecked]:font-normal [&_svg]:text-[#01A2C3]"
                          >
                            Dark
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="h-5 w-24 bg-gray-200 dark:bg-gray-700 animate-pulse rounded" />
                    )}
                  </div>
                  <div className="flex items-center justify-between h-8">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      AI Diagnostics
                    </label>
                    <Switch
                      checked={settings.aiDiagnostics}
                      onCheckedChange={(checked) => updateSetting('aiDiagnostics', checked)}
                      aria-label="Toggle AI diagnostics"
                      className="data-[state=checked]:bg-[#2483E2] data-[state=unchecked]:bg-[#DBDAD7] dark:data-[state=unchecked]:bg-[#535454] [&>span]:bg-white [&>span]:dark:bg-white"
                    />
                  </div>
                </div>
              </div>
            </>
          )}

          {selectedSection === 'editor' && (
            <>
              <div className="py-3.5 px-6">
                <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">
                  Editor
                </h3>
              </div>
              <div className="border-t border-black/10 dark:border-white/10" />
              <div className="px-6 py-4">
                <div className="space-y-4">
                  <div className="flex items-center justify-between h-8">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Architecture
                    </label>
                    <Select value={settings.architecture} onValueChange={(value) => updateSetting('architecture', value as typeof settings.architecture)}>
                      <SelectTrigger className="w-auto border-0 bg-transparent dark:bg-transparent p-0 h-auto cursor-pointer focus:ring-0 focus-visible:ring-0 shadow-none hover:bg-transparent dark:hover:bg-transparent">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="min-w-[180px] rounded-lg p-2 shadow-lg shadow-black/10 dark:shadow-black/20 bg-white dark:bg-[#303030] border border-[#F0F0F0] dark:border-[#3C3C3C]">
                        <SelectItem
                          value="MIPS"
                          className="h-8 py-1.5 pl-2 pr-12 rounded hover:bg-[#f0f0f0] dark:hover:bg-[#2a2a2a] text-sm cursor-pointer focus:bg-[#f0f0f0] dark:focus:bg-[#2a2a2a] data-[state=checked]:text-[#262626] dark:data-[state=checked]:text-white data-[state=checked]:font-medium data-[state=unchecked]:text-[#5a5a5a] dark:data-[state=unchecked]:text-[#a0a0a0] data-[state=unchecked]:font-normal [&_svg]:text-[#01A2C3]"
                        >
                          MIPS
                        </SelectItem>
                        <SelectItem
                          value="MIPS_R6"
                          className="h-8 py-1.5 pl-2 pr-12 rounded hover:bg-[#f0f0f0] dark:hover:bg-[#2a2a2a] text-sm cursor-pointer focus:bg-[#f0f0f0] dark:focus:bg-[#2a2a2a] data-[state=checked]:text-[#262626] dark:data-[state=checked]:text-white data-[state=checked]:font-medium data-[state=unchecked]:text-[#5a5a5a] dark:data-[state=unchecked]:text-[#a0a0a0] data-[state=unchecked]:font-normal [&_svg]:text-[#01A2C3]"
                        >
                          MIPS R6
                        </SelectItem>
                        <SelectItem
                          value="ARM"
                          className="h-8 py-1.5 pl-2 pr-12 rounded hover:bg-[#f0f0f0] dark:hover:bg-[#2a2a2a] text-sm cursor-pointer focus:bg-[#f0f0f0] dark:focus:bg-[#2a2a2a] data-[state=checked]:text-[#262626] dark:data-[state=checked]:text-white data-[state=checked]:font-medium data-[state=unchecked]:text-[#5a5a5a] dark:data-[state=unchecked]:text-[#a0a0a0] data-[state=unchecked]:font-normal [&_svg]:text-[#01A2C3]"
                        >
                          ARM
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center justify-between h-8">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Font Size
                    </label>
                    <Select value={settings.fontSize.toString()} onValueChange={(value) => updateSetting('fontSize', parseInt(value))}>
                      <SelectTrigger className="w-auto border-0 bg-transparent dark:bg-transparent p-0 h-auto cursor-pointer focus:ring-0 focus-visible:ring-0 shadow-none hover:bg-transparent dark:hover:bg-transparent">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="min-w-[100px] rounded-lg p-2 shadow-lg shadow-black/10 dark:shadow-black/20 bg-white dark:bg-[#303030] border border-[#F0F0F0] dark:border-[#3C3C3C]">
                        <SelectItem value="12" className="h-8 py-1.5 pl-2 pr-12 rounded hover:bg-[#f0f0f0] dark:hover:bg-[#2a2a2a] text-sm cursor-pointer focus:bg-[#f0f0f0] dark:focus:bg-[#2a2a2a] data-[state=checked]:text-[#262626] dark:data-[state=checked]:text-white data-[state=checked]:font-medium data-[state=unchecked]:text-[#5a5a5a] dark:data-[state=unchecked]:text-[#a0a0a0] data-[state=unchecked]:font-normal [&_svg]:text-[#01A2C3]">
                          Small
                        </SelectItem>
                        <SelectItem value="14" className="h-8 py-1.5 pl-2 pr-12 rounded hover:bg-[#f0f0f0] dark:hover:bg-[#2a2a2a] text-sm cursor-pointer focus:bg-[#f0f0f0] dark:focus:bg-[#2a2a2a] data-[state=checked]:text-[#262626] dark:data-[state=checked]:text-white data-[state=checked]:font-medium data-[state=unchecked]:text-[#5a5a5a] dark:data-[state=unchecked]:text-[#a0a0a0] data-[state=unchecked]:font-normal [&_svg]:text-[#01A2C3]">
                          Default
                        </SelectItem>
                        <SelectItem value="16" className="h-8 py-1.5 pl-2 pr-12 rounded hover:bg-[#f0f0f0] dark:hover:bg-[#2a2a2a] text-sm cursor-pointer focus:bg-[#f0f0f0] dark:focus:bg-[#2a2a2a] data-[state=checked]:text-[#262626] dark:data-[state=checked]:text-white data-[state=checked]:font-medium data-[state=unchecked]:text-[#5a5a5a] dark:data-[state=unchecked]:text-[#a0a0a0] data-[state=unchecked]:font-normal [&_svg]:text-[#01A2C3]">
                          Comfortable
                        </SelectItem>
                        <SelectItem value="18" className="h-8 py-1.5 pl-2 pr-12 rounded hover:bg-[#f0f0f0] dark:hover:bg-[#2a2a2a] text-sm cursor-pointer focus:bg-[#f0f0f0] dark:focus:bg-[#2a2a2a] data-[state=checked]:text-[#262626] dark:data-[state=checked]:text-white data-[state=checked]:font-medium data-[state=unchecked]:text-[#5a5a5a] dark:data-[state=unchecked]:text-[#a0a0a0] data-[state=unchecked]:font-normal [&_svg]:text-[#01A2C3]">
                          Large
                        </SelectItem>
                        <SelectItem value="20" className="h-8 py-1.5 pl-2 pr-12 rounded hover:bg-[#f0f0f0] dark:hover:bg-[#2a2a2a] text-sm cursor-pointer focus:bg-[#f0f0f0] dark:focus:bg-[#2a2a2a] data-[state=checked]:text-[#262626] dark:data-[state=checked]:text-white data-[state=checked]:font-medium data-[state=unchecked]:text-[#5a5a5a] dark:data-[state=unchecked]:text-[#a0a0a0] data-[state=unchecked]:font-normal [&_svg]:text-[#01A2C3]">
                          Extra Large
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center justify-between h-8">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Code Completion
                    </label>
                    <Switch
                      checked={settings.codeCompletion}
                      onCheckedChange={(checked) => updateSetting('codeCompletion', checked)}
                      aria-label="Toggle code completion"
                      className="data-[state=checked]:bg-[#2483E2] data-[state=unchecked]:bg-[#DBDAD7] dark:data-[state=unchecked]:bg-[#535454] [&>span]:bg-white [&>span]:dark:bg-white"
                    />
                  </div>
                  <div className="flex items-center justify-between h-8">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Auto Save Code
                    </label>
                    <Switch
                      checked={settings.autoSaveCode}
                      onCheckedChange={(checked) => updateSetting('autoSaveCode', checked)}
                      aria-label="Toggle auto save code"
                      className="data-[state=checked]:bg-[#2483E2] data-[state=unchecked]:bg-[#DBDAD7] dark:data-[state=unchecked]:bg-[#535454] [&>span]:bg-white [&>span]:dark:bg-white"
                    />
                  </div>
                  <div className="flex items-center justify-between h-8">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Sticky Scroll
                    </label>
                    <Switch
                      checked={settings.stickyScroll}
                      onCheckedChange={(checked) => updateSetting('stickyScroll', checked)}
                      aria-label="Toggle sticky scroll"
                      className="data-[state=checked]:bg-[#2483E2] data-[state=unchecked]:bg-[#DBDAD7] dark:data-[state=unchecked]:bg-[#535454] [&>span]:bg-white [&>span]:dark:bg-white"
                    />
                  </div>
                </div>
              </div>
            </>
          )}

        </div>
      </div>
    </>
  )
}
