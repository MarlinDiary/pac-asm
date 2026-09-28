import type { AssemblerOptions } from './assembler'
import type { ManualAddressMappingInput } from './highlighter'

export interface CompiledProgram {
  machineCode: number[]
  mappings: ManualAddressMappingInput[]
}

// Loading/instantiating GAS and objdump is CPU-heavy even for a tiny program.
// Keep it off the UI thread; each request owns its worker and WASM memory.
export function compileProgram(
  sourceCode: string,
  options: AssemblerOptions,
  signal?: AbortSignal
): Promise<CompiledProgram> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Operation aborted'))
      return
    }

    const worker = new Worker(new URL('../workers/compiler.ts', import.meta.url))
    const cleanup = () => {
      signal?.removeEventListener('abort', abort)
      worker.terminate()
    }
    const abort = () => {
      cleanup()
      reject(new Error('Operation aborted'))
    }
    signal?.addEventListener('abort', abort, { once: true })
    worker.onmessage = (event: MessageEvent<CompiledProgram | { error: string }>) => {
      cleanup()
      if ('error' in event.data) reject(new Error(event.data.error))
      else resolve(event.data)
    }
    worker.onerror = () => {
      cleanup()
      reject(new Error('Assembler worker failed to load'))
    }
    worker.onmessageerror = () => {
      cleanup()
      reject(new Error('Assembler worker returned an invalid result'))
    }
    try {
      worker.postMessage({ sourceCode, options })
    } catch (error) {
      cleanup()
      reject(error)
    }
  })
}
