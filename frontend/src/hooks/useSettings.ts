import { useState, useEffect } from 'react'

export type Architecture = 'MIPS_R6' | 'ARM'

interface Settings {
  architecture: Architecture
  codeCompletion: boolean
  fontSize: number
  aiDiagnostics: boolean
  stickyScroll: boolean
  autoSaveCode: boolean
  pageZoom: number
}

const DEFAULT_SETTINGS: Settings = {
  architecture: 'MIPS_R6',
  codeCompletion: true,
  fontSize: 14,
  aiDiagnostics: false,
  stickyScroll: false,
  autoSaveCode: true,
  pageZoom: 110
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)

  // On mount, hydrate from localStorage to avoid SSR/client mismatch
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const savedSettings = localStorage.getItem('pacasm-settings')
      if (savedSettings) {
        const raw = JSON.parse(savedSettings) as Partial<Settings> & { architecture?: string }
        const parsed: Settings = {
          ...DEFAULT_SETTINGS,
          ...raw,
          architecture: raw.architecture === 'ARM' ? 'ARM' : 'MIPS_R6'
        }
        const changed = JSON.stringify(parsed) !== JSON.stringify(settings)
        if (changed) setSettings(parsed)
      }
    } catch (error) {
      console.error('Failed to load settings from localStorage:', error)
    }
    // run only once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep a global reference up to date for modules that need quick access
  useEffect(() => {
    try {
      setGlobalSettings({ settings, updateSetting } as unknown as ReturnType<typeof useSettings>)
    } catch {}
  }, [settings])

  // Save settings to localStorage whenever they change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('pacasm-settings', JSON.stringify(settings))
        // Broadcast settings change for other hooks/components
        window.dispatchEvent(new CustomEvent('pacasm-settings-changed', { detail: settings }))
      } catch (error) {
        console.error('Failed to save settings to localStorage:', error)
      }
    }
  }, [settings])

  // Listen for settings changes broadcasted from other hook instances (e.g., SettingsPanel)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as Partial<Settings> | undefined
      if (!detail) return
      const next = { ...settings, ...detail }
      if (JSON.stringify(next) !== JSON.stringify(settings)) {
        setSettings(next)
      }
    }
    window.addEventListener('pacasm-settings-changed', handler as EventListener)
    return () => window.removeEventListener('pacasm-settings-changed', handler as EventListener)
  }, [settings])

  const updateSetting = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings(prev => {
      const next = { ...prev, [key]: value } as Settings
      return next
    })
  }

  return {
    settings,
    updateSetting
  }
}

// Export a singleton instance for global access
let globalSettings: ReturnType<typeof useSettings> | null = null

export function getGlobalSettings() {
  if (!globalSettings) {
    console.warn('Global settings not initialized. Using default settings.')
    return {
      settings: DEFAULT_SETTINGS,
      updateSetting: () => {}
    }
  }
  return globalSettings
}

export function setGlobalSettings(settings: ReturnType<typeof useSettings>) {
  globalSettings = settings
}

// Ensure the first use of this hook registers a global reference
// We call setGlobalSettings within a layout effect-like timing using useEffect
// so that other modules can read current settings.
// Note: This helper is for convenience; SettingsPanel also updates via event.
