export class QueueOverloadedError extends Error {
  readonly statusCode = 429
  readonly retryAfterSeconds: number

  constructor(message = 'Server busy', retryAfterSeconds = 15) {
    super(message)
    this.name = 'QueueOverloadedError'
    this.retryAfterSeconds = retryAfterSeconds
  }
}

type Task = {
  fn: () => Promise<unknown>
  resolve: (value: unknown) => void
  reject: (reason?: unknown) => void
}

export class AsyncTaskQueue {
  private readonly concurrency: number
  private readonly maxPending: number
  private readonly retryAfterSeconds: number
  private running = 0
  private readonly pending: Task[] = []

  constructor(options?: {
    concurrency?: number
    maxPending?: number
    retryAfterSeconds?: number
  }) {
    this.concurrency = Math.max(1, Math.floor(options?.concurrency ?? 1))
    this.maxPending = Math.max(0, Math.floor(options?.maxPending ?? 25))
    this.retryAfterSeconds = Math.max(1, Math.floor(options?.retryAfterSeconds ?? 15))
  }

  get pendingCount(): number {
    return this.pending.length
  }

  get runningCount(): number {
    return this.running
  }

  enqueue<T>(fn: () => Promise<T>): Promise<T> {
    if (this.maxPending > 0 && this.pending.length >= this.maxPending) {
      return Promise.reject(new QueueOverloadedError('Server busy, please retry', this.retryAfterSeconds))
    }

    return new Promise<T>((resolve, reject) => {
      this.pending.push({
        fn: fn as () => Promise<unknown>,
        resolve: resolve as (value: unknown) => void,
        reject
      })
      this.drain()
    })
  }

  // Best-effort work shares running slots but never joins or overtakes the FIFO.
  tryRun<T>(fn: () => Promise<T>): Promise<T> {
    if (this.running >= this.concurrency || this.pending.length > 0) {
      return Promise.reject(new QueueOverloadedError('Server busy, please retry', this.retryAfterSeconds))
    }

    // Reserve synchronously so simultaneous callers cannot claim the same slot.
    this.running += 1
    return Promise.resolve()
      .then(fn)
      .finally(() => {
        this.running -= 1
        this.drain()
      })
  }

  private drain() {
    while (this.running < this.concurrency && this.pending.length > 0) {
      const task = this.pending.shift()
      if (!task) {
        return
      }

      this.running += 1
      Promise.resolve()
        .then(task.fn)
        .then(task.resolve, task.reject)
        .finally(() => {
          this.running -= 1
          this.drain()
        })
    }
  }
}
