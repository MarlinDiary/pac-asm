import { Worker } from 'worker_threads'
import path from 'path'
import fs from 'fs'

import {
  Architecture,
  EmulatorResponse,
  EmulatorMessage,
  RegisterInfo
} from './types'
import {
  EMULATOR_MESSAGE_TIMEOUT_MS,
  EMULATOR_RUN_TIMEOUT_US,
  formatSystemError,
  formatTimeoutError
} from './errors'

interface RunMessagePayload {
  instructionCount?: number
  untilMemWriteAt?: number
  validValues?: number[]
  timeoutUs?: number
}

interface PendingMessage {
  resolve: (response: EmulatorResponse) => void
  reject: (error: Error) => void
  timeoutId: NodeJS.Timeout
}

export interface RunUntilMemWriteResult {
  message: string
  executedInstructions: number
  stopReason: 'mem-write' | 'end-of-code' | 'timeout' | 'unknown'
  memEvent?: { address: number; value: number }
}

export class NodeEmulator {
  private worker: Worker | null = null
  private terminatingWorker = false
  private lastWorkerError: Error | null = null
  private readonly baseDir: string
  private messageIdCounter = 0
  private readonly pendingMessages = new Map<string, PendingMessage>()
  private currentArch: Architecture | null = null

  public readonly state = {
    isInitialized: false
  }

  constructor(options?: { baseDir?: string }) {
    this.baseDir = options?.baseDir ?? path.resolve(process.cwd(), 'vendor/unicorn')
    this.startWorker()
  }

  private resolveWorkerScript(): { filename: string; execArgv: string[] } {
    const compiledPath = path.resolve(__dirname, 'node-worker.js')
    if (fs.existsSync(compiledPath)) {
      return { filename: compiledPath, execArgv: [] }
    }

    const sourcePath = path.resolve(__dirname, 'node-worker.ts')
    if (fs.existsSync(sourcePath)) {
      return { filename: sourcePath, execArgv: ['-r', 'ts-node/register'] }
    }

    throw new Error('Unable to locate node-worker entry script')
  }

  private startWorker(): void {
    if (this.worker) {
      return
    }

    const { filename, execArgv } = this.resolveWorkerScript()
    this.worker = new Worker(filename, {
      execArgv,
      workerData: { baseDir: this.baseDir }
    })

    this.worker.on('message', (response: EmulatorResponse | { type: 'debug'; message: string }) => {
      if ((response as { type: string }).type === 'debug') {
        return
      }
      const message = response as EmulatorResponse
      if (message.messageId && this.pendingMessages.has(message.messageId)) {
        const pending = this.pendingMessages.get(message.messageId)
        if (pending) {
          clearTimeout(pending.timeoutId)
          this.pendingMessages.delete(message.messageId)
          pending.resolve(message)
        }
      }
    })

    this.worker.on('error', (error) => {
      this.lastWorkerError = error
    })

    this.worker.on('exit', (code) => {
      const wasTerminating = this.terminatingWorker
      this.terminatingWorker = false
      this.worker = null

      if (wasTerminating) {
        return
      }

      const failureError = this.lastWorkerError ?? (code !== 0 ? new Error(`Worker exited with code ${code}`) : undefined)
      this.lastWorkerError = null

      this.handleWorkerFailure(failureError)
    })
  }

  private async terminateWorker(): Promise<void> {
    if (!this.worker) {
      return
    }

    const workerToClose = this.worker
    this.terminatingWorker = true
    this.worker = null
    this.lastWorkerError = null
    try {
      await workerToClose.terminate()
    } catch {
      // Ignore termination errors
    }
  }

  private flushPending(buildError: (messageId: string) => Error): void {
    this.pendingMessages.forEach(({ reject, timeoutId }, messageId) => {
      clearTimeout(timeoutId)
      try {
        reject(buildError(messageId))
      } catch {
        // Ignore rejection failures
      }
    })
    this.pendingMessages.clear()
  }

  private buildTimeoutError(context: string, detail?: string): Error {
    const message = formatTimeoutError(context, EMULATOR_MESSAGE_TIMEOUT_MS, detail)
    const error = new Error(message)
    error.name = 'TimeoutError'
    ;(error as Error & { code?: string }).code = 'timeout'
    return error
  }

  private handleWorkerFailure(error?: Error): void {
    const buildError = (messageId: string) => formatSystemError('Emulator worker terminated before response', messageId)
    this.pendingMessages.forEach(({ reject, timeoutId }, messageId) => {
      clearTimeout(timeoutId)
      reject(new Error(buildError(messageId)))
    })
    this.pendingMessages.clear()
    this.worker = null
    this.state.isInitialized = false
    if (error) {
      // eslint-disable-next-line no-console
      console.error('[NodeEmulator] Worker failure:', error)
    }
  }

  private sendMessage(message: EmulatorMessage): Promise<EmulatorResponse> {
    this.startWorker()
    if (!this.worker) {
      return Promise.reject(new Error('Emulator worker not available'))
    }

    const messageId = `msg_${this.messageIdCounter++}`
    message.messageId = messageId

    return new Promise<EmulatorResponse>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingMessages.delete(messageId)
        const timeoutError = this.buildTimeoutError('Message response', `messageId=${messageId}`)
        reject(timeoutError)
        this.flushPending((pendingId) => this.buildTimeoutError('Worker unresponsive', `messageId=${pendingId}`))
        void this.terminateWorker()
        this.state.isInitialized = false
      }, EMULATOR_MESSAGE_TIMEOUT_MS)

      this.pendingMessages.set(messageId, { resolve, reject, timeoutId })

      try {
        this.worker!.postMessage(message)
      } catch (error) {
        clearTimeout(timeoutId)
        this.pendingMessages.delete(messageId)
        reject(error as Error)
      }
    })
  }

  private ensureReady(): void {
    if (!this.state.isInitialized) {
      throw new Error('Emulator not initialized')
    }
  }

  async initializeEmulator(arch: Architecture): Promise<void> {
    this.currentArch = arch
    const response = await this.sendMessage({ type: 'init', payload: { arch } })
    if (response.type === 'error') {
      throw new Error(response.payload as string)
    }
    this.state.isInitialized = true
  }

  async reset(): Promise<void> {
    this.ensureReady()
    const response = await this.sendMessage({ type: 'reset' })
    if (response.type === 'error') {
      throw new Error(response.payload as string)
    }
  }

  async loadCode(machineCode: number[]): Promise<void> {
    this.ensureReady()
    const response = await this.sendMessage({ type: 'load-code', payload: machineCode })
    if (response.type === 'error') {
      throw new Error(response.payload as string)
    }
  }

  async writeMemory(address: number, data: number[]): Promise<boolean> {
    this.ensureReady()
    const response = await this.sendMessage({ type: 'write-memory', payload: { address, data } })
    if (response.type === 'error') {
      throw new Error(response.payload as string)
    }
    return response.type === 'success'
  }

  async getAllRegisters(): Promise<RegisterInfo[] | null> {
    this.ensureReady()
    const response = await this.sendMessage({ type: 'get-all-registers' })
    if (response.type === 'registers-data' && response.payload) {
      return response.payload as RegisterInfo[]
    }
    if (response.type === 'error') {
      throw new Error(response.payload as string)
    }
    return null
  }

  async getMemory(address: number, size: number): Promise<{ address: number; size: number; data: number[]; hex: string } | null> {
    this.ensureReady()
    const response = await this.sendMessage({ type: 'get-memory', payload: { address, size } })
    if (response.type === 'memory-data' && response.payload) {
      return response.payload as { address: number; size: number; data: number[]; hex: string }
    }
    if (response.type === 'error') {
      throw new Error(response.payload as string)
    }
    return null
  }

  async runUntilMemWrite(
    address: number,
    validValues?: number[],
    timeoutUs?: number
  ): Promise<RunUntilMemWriteResult> {
    this.ensureReady()
    const payload: RunMessagePayload = {
      untilMemWriteAt: address,
      validValues,
      timeoutUs: timeoutUs ?? EMULATOR_RUN_TIMEOUT_US
    }
    const response = await this.sendMessage({ type: 'run', payload })
    if (response.type === 'execution-complete' && response.payload) {
      const result = response.payload as RunUntilMemWriteResult
      return {
        message: result.message,
        executedInstructions: result.executedInstructions ?? 0,
        stopReason: result.stopReason ?? 'unknown',
        memEvent: result.memEvent
      }
    }
    if (response.type === 'error') {
      throw new Error(response.payload as string)
    }
    throw new Error('Unexpected response from emulator run')
  }

  async getCycleCount(): Promise<number | null> {
    this.ensureReady()
    const response = await this.sendMessage({ type: 'get-cycle-count' })
    if (response.type === 'cycle-count') {
      const rawPayload = response.payload as unknown
      if (typeof rawPayload === 'number') {
        return rawPayload
      }
      if (rawPayload && typeof rawPayload === 'object' && 'cycles' in rawPayload) {
        const cycles = (rawPayload as { cycles?: unknown }).cycles
        if (typeof cycles === 'number') {
          return cycles
        }
      }
    }
    if (response.type === 'error') {
      throw new Error(response.payload as string)
    }
    return null
  }

  async close(): Promise<void> {
    await this.terminateWorker()
    this.state.isInitialized = false
  }

  get architecture(): Architecture | null {
    return this.currentArch
  }
}
