import { parentPort, workerData } from 'worker_threads'
import { EmulatorWorker } from './emulator-core'
import { WorkerSelf, EmulatorResponse, WorkerMessageEvent } from './types'

if (!parentPort) {
  throw new Error('Node emulator worker requires a parent port')
}

const port = parentPort

interface NodeWorkerData {
  baseDir?: string
}

const data = (workerData ?? {}) as NodeWorkerData

const workerSelf: WorkerSelf = {
  location: { origin: '' },
  postMessage: (message: EmulatorResponse) => {
    port.postMessage(message)
  },
  addEventListener: (type: string, listener: (event: WorkerMessageEvent) => void) => {
    if (type !== 'message') return
    port.on('message', (payload: unknown) => {
      listener({ data: payload })
    })
  }
}

const worker = new EmulatorWorker(workerSelf, { baseDir: data.baseDir })

port.on('message', (message) => {
  worker.handleMessage(message)
})
