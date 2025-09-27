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
      if (this.arch === 'MIPS_R6') {
        await this.loadWasmUnicorn()
      } else {
        await this.loadClassicUnicorn()
      }

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

  private createSandbox(initialScriptPath: string) {
    const sandbox: any = {
      Module: { ENVIRONMENT: 'NODE' },
      console,
      require,
      process,
      setTimeout,
      clearTimeout,
      performance: typeof performance !== 'undefined' ? performance : { now: () => Date.now() }
    }

    sandbox.global = sandbox
    sandbox.self = sandbox
    sandbox.__dirname = path.dirname(initialScriptPath)
    sandbox.__filename = initialScriptPath

    return sandbox
  }

  private async loadClassicUnicorn(): Promise<void> {
    const scriptPath = path.resolve(this.baseDir, 'unicorn-arm.min.js')
    const source = await fs.readFile(scriptPath, 'utf8')

    const sandbox = this.createSandbox(scriptPath)
    delete sandbox.uc

    const context = vm.createContext(sandbox)
    vm.runInContext(source, context, { filename: scriptPath })

    const uc = sandbox.uc as UnicornGlobal | undefined
    if (!uc) {
      throw new Error('Unicorn global not initialized')
    }

    this.workerSelf.uc = uc
  }

  private async loadWasmUnicorn(): Promise<void> {
    const wasmScriptPath = path.resolve(this.baseDir, 'unicorn_wasm_mips.js')
    const wrapperPath = path.resolve(this.baseDir, 'unicorn-wrapper.js')
    const [wasmSource, wrapperSource] = await Promise.all([
      fs.readFile(wasmScriptPath, 'utf8'),
      fs.readFile(wrapperPath, 'utf8')
    ])

    const sandbox = this.createSandbox(wasmScriptPath) as Record<string, unknown> & {
      uc?: UnicornGlobal
      MUnicorn?: (moduleArg?: Record<string, unknown>) => Promise<unknown>
      createUC?: (moduleInstance: unknown) => UnicornGlobal
    }

    delete sandbox.uc

    const context = vm.createContext(sandbox)
    vm.runInContext(wasmSource, context, { filename: wasmScriptPath })

    if (typeof sandbox.MUnicorn !== 'function') {
      throw new Error('MUnicorn factory not found after loading WASM build')
    }

    sandbox.__dirname = path.dirname(wrapperPath)
    sandbox.__filename = wrapperPath
    vm.runInContext(wrapperSource, context, { filename: wrapperPath })

    if (typeof sandbox.createUC !== 'function') {
      throw new Error('createUC wrapper not found after loading WASM build')
    }

    const moduleInstance = await sandbox.MUnicorn({
      locateFile: (relativePath: string) => {
        if (relativePath.endsWith('.wasm')) {
          return path.resolve(this.baseDir, 'unicorn_wasm_mips.wasm')
        }
        return path.resolve(this.baseDir, relativePath)
      }
    })

    const uc = sandbox.createUC(moduleInstance) as UnicornGlobal | undefined
    if (!uc) {
      throw new Error('Unicorn global not initialized')
    }

    this.workerSelf.uc = uc
  }
}
