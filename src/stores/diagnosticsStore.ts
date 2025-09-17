import { create } from 'zustand'

export interface DiagnosticError {
  id: string
  error: string
  code: string
  timestamp: Date
  diagnosis: string
  isLoading: boolean
  hasDiagnosis: boolean
}

interface DiagnosticsStore {
  errors: DiagnosticError[]
  addError: (error: string, code: string) => void
  generateDiagnosis: (id: string) => void
  clearErrors: () => void
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
