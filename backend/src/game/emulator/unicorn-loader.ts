// Unicorn.js loader and initialization for Node environment

import path from 'path'
import vm from 'vm'
import { promises as fs } from 'fs'

import { WorkerSelf, UnicornGlobal, EmulatorResponse, Architecture } from './types'

interface UnicornLoaderOptions {
  baseDir?: string
}

export class UnicornLoader {
  private arch: Architecture = 'ARM'
  private baseDir: string

  constructor(private workerSelf: WorkerSelf, options: UnicornLoaderOptions = {}) {
    this.baseDir = options.baseDir ?? path.resolve(process.cwd(), 'vendor/unicorn')
  }

  setArchitecture(arch: Architecture) {
    this.arch = arch
  }

  async loadUnicornScript(): Promise<void> {
    try {
      const scriptName = this.arch === 'MIPS' ? 'unicorn-mips.min.js' : 'unicorn-arm.min.js'
      const scriptPath = path.resolve(this.baseDir, scriptName)
      const source = await fs.readFile(scriptPath, 'utf8')

      const sandbox: any = {
        Module: { ENVIRONMENT: 'NODE' },
        console,
        require,
        process,
        setTimeout,
        clearTimeout,
        performance: typeof performance !== 'undefined' ? performance : { now: () => Date.now() },
      }

      sandbox.global = sandbox
      sandbox.self = sandbox

      const context = vm.createContext(sandbox)
      vm.runInContext(source, context, { filename: scriptPath })

      const uc = sandbox.uc as UnicornGlobal | undefined
      if (!uc) {
        throw new Error('Unicorn global not initialized')
      }

      this.workerSelf.uc = uc
      this.postMessage({
        type: 'success',
        payload: `Unicorn.js loaded successfully (${this.arch})`
      })
    } catch (error) {
      this.postMessage({
        type: 'error',
        payload: 'LOAD_ERROR: Failed to Load Unicorn.js'
      })
      throw error
    }
  }

  getUnicorn(): UnicornGlobal {
    if (typeof this.workerSelf.uc === 'undefined') {
      throw new Error('Unicorn.js not loaded')
    }
    return this.workerSelf.uc
  }

  private postMessage(response: Pick<EmulatorResponse, 'type' | 'payload'>): void {
    this.workerSelf.postMessage(response)
  }
}
