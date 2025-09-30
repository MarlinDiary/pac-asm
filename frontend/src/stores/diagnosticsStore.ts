"use client"

import { create } from 'zustand'
import { trackDiagnosticError } from '@/components/providers/PostHogProvider'

export interface DiagnosticError {
  id: string
  error: string
  code: string
  timestamp: Date
  diagnosis: string
  isLoading: boolean
  hasDiagnosis: boolean
  tag?: string
}

interface DiagnosticsStore {
  errors: DiagnosticError[]
  addError: (error: string, code: string) => void
  addTaggedError: (tag: string, error: string, code: string) => void
  generateDiagnosis: (id: string) => void
  clearErrors: () => void
}

const CATEGORY_MAP: Record<string, 'Assemble' | 'Runtime' | 'Timeout' | 'Game' | 'Memory' | 'Debug'> = {
  timeout: 'Timeout',
  RUNTIME_ERROR: 'Runtime',
  TIMEOUT_ERROR: 'Timeout',
  GAMEPLAY_ERROR: 'Game',
  MEMORY_ERROR: 'Memory',
  DEBUG_ERROR: 'Debug',
  LINK_ERROR: 'Assemble'
}

function deriveEventTag(error: string, explicitTag?: string): string {
  if (explicitTag && explicitTag.trim().length > 0) {
    return explicitTag.trim().toUpperCase()
  }

  const trimmed = error.trim()
  for (const key of Object.keys(CATEGORY_MAP)) {
    if (trimmed.startsWith(`${key}:`)) {
      return CATEGORY_MAP[key as keyof typeof CATEGORY_MAP]
    }
  }

  if (trimmed.startsWith('Game Over')) {
    return 'Game'
  }

  return 'Assemble'
}

async function fetchDiagnosis(error: string, code: string): Promise<string> {
  try {
    const response = await fetch('/api/diagnose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error, code })
    })

    if (!response.ok) throw new Error('Failed to fetch diagnosis')

    // Wait for complete response instead of streaming
    const fullText = await response.text()
    
    return fullText
  } catch {
    // Silently handle diagnosis failure
    return 'SERVICE_ERROR: Unable to Generate Diagnosis'
  }
}

export const useDiagnosticsStore = create<DiagnosticsStore>((set, get) => ({
  errors: [],
  
  addError: (error, code) => {
    const id = `${Date.now()}_${Math.random()}`
    const eventTag = deriveEventTag(error)

    // Add error immediately without diagnosis
    set((state) => ({
      errors: [
        {
          id,
          error,
          code,
          timestamp: new Date(),
          diagnosis: '',
          isLoading: false,
          hasDiagnosis: false
        },
        ...state.errors
      ]
    }))

    trackDiagnosticError({
      error,
      tag: eventTag,
    })
  },

  addTaggedError: (tag, error, code) => {
    const id = `${Date.now()}_${Math.random()}`
    const eventTag = deriveEventTag(error, tag)

    set((state) => ({
      errors: [
        {
          id,
          error,
          code,
          tag,
          timestamp: new Date(),
          diagnosis: '',
          isLoading: false,
          hasDiagnosis: false
        },
        ...state.errors
      ]
    }))

    trackDiagnosticError({
      error,
      tag: eventTag,
    })
  },
  
  generateDiagnosis: async (id) => {
    // Set loading state
    set((state) => ({
      errors: state.errors.map(e => 
        e.id === id 
          ? { ...e, isLoading: true }
          : e
      )
    }))
    
    // Find the error to get its details
    const error = get().errors.find(e => e.id === id)
    if (!error) return
    
    // Fetch diagnosis asynchronously
    const diagnosis = await fetchDiagnosis(error.error, error.code)
    
    // Update the error with diagnosis
    set((state) => ({
      errors: state.errors.map(e => 
        e.id === id 
          ? { ...e, diagnosis, isLoading: false, hasDiagnosis: true }
          : e
      )
    }))
  },
  
  clearErrors: () => set({ errors: [] })
}))
