import { AsyncTaskQueue } from './async-task-queue'

const concurrency = Number(process.env.GAME_VALIDATION_CONCURRENCY ?? '3')
const maxPending = Number(process.env.GAME_VALIDATION_MAX_PENDING ?? '20')
const retryAfterSeconds = Number(process.env.GAME_VALIDATION_RETRY_AFTER ?? '15')

export const heavyValidationQueue = new AsyncTaskQueue({
  concurrency: Number.isFinite(concurrency) ? concurrency : 1,
  maxPending: Number.isFinite(maxPending) ? maxPending : 0,
  retryAfterSeconds: Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : 15
})
