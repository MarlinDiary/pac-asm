import { randomUUID } from 'crypto'
import { Request, Response, Router } from 'express'

import { validateGame, GameValidationSummary } from '../game'
import { Architecture } from '../game/emulator/types'
import SubmissionModel, { SubmissionDocument } from '../models/submission'
import RunLogModel from '../models/run-log'
import { GitHubAuthError, requireVerifiedGitHubIdentity, syncVerifiedGitHubUser } from '../lib/github-auth'
import { heavyValidationQueue } from '../lib/game-validation-queue'
import { QueueOverloadedError } from '../lib/async-task-queue'

const router = Router()

type JobEntry =
  | { status: 'queued'; createdAt: number; ticket: number | null }
  | { status: 'processing'; createdAt: number }
  | { status: 'done'; createdAt: number; submission: ReturnType<typeof toRankingEntry>; summary: GameValidationSummary }
  | { status: 'failed'; createdAt: number; error: string }

const jobStore = new Map<string, JobEntry>()

// FIFO tickets for heavy jobs: a queued job's position is its ticket minus the
// number of heavy jobs that have already started, so it only ever decreases.
let heavyTicketCounter = 0
let heavyStartedCounter = 0

// Tickets are assigned after async auth, so arrival order is captured
// synchronously at request entry to know which of two same-user submits
// the student actually sent last.
let submitArrivalCounter = 0

// userId:levelId:architecture -> the user's latest queued heavy job
const activeQueuedJobByUser = new Map<string, { jobId: string; arrivalSeq: number }>()
const cancelledJobs = new Set<string>()

setInterval(() => {
  const cutoff = Date.now() - 2 * 3600_000
  for (const [id, job] of jobStore) {
    // Queued/processing jobs are kept alive no matter how old: during a
    // deadline backlog a job may legitimately wait hours for its turn.
    if ((job.status === 'done' || job.status === 'failed') && job.createdAt < cutoff) {
      jobStore.delete(id)
    }
  }
}, 3600_000).unref()

router.get('/queue', (_req: Request, res: Response) => {
  return res.json({
    pending: heavyValidationQueue.pendingCount,
    running: heavyValidationQueue.runningCount
  })
})

router.get('/job/:jobId', (req: Request, res: Response) => {
  const { jobId } = req.params
  const job = jobStore.get(jobId)
  if (!job) {
    return res.status(404).json({ error: 'Job not found or expired' })
  }
  if (job.status === 'queued') {
    const ahead = job.ticket === null ? 0 : Math.max(0, job.ticket - 1 - heavyStartedCounter)
    return res.json({ status: 'queued', pending: ahead })
  }
  if (job.status === 'processing') {
    return res.json({ status: 'processing' })
  }
  if (job.status === 'done') {
    return res.json({ status: 'done', submission: job.submission, summary: job.summary })
  }
  return res.json({ status: 'failed', error: job.error })
})

interface ValidateGameBody {
  sourceCode?: string
  levelId?: string
  architecture?: Architecture
  maxSteps?: number | string
  includeRegisters?: boolean | string
}

interface UserInfo {
  id?: string
  name?: string
  avatarUrl?: string
}

interface SubmitBody extends ValidateGameBody {
  user?: UserInfo
}

interface RunLogBody extends ValidateGameBody {
  runId?: string
}

const ALLOWED_LEVEL_IDS = new Set(['level1', 'level2', 'level3', 'level4', 'challenge'])

const isArchitecture = (value: unknown): value is Architecture => value === 'ARM' || value === 'MIPS_R6'

router.post('/validate', async (req: Request, res: Response) => {
  const body = req.body as ValidateGameBody
  const { sourceCode, levelId, architecture } = body

  if (!sourceCode || typeof sourceCode !== 'string') {
    return res.status(400).json({ error: 'sourceCode is required' })
  }
  if (!levelId || typeof levelId !== 'string' || !ALLOWED_LEVEL_IDS.has(levelId)) {
    return res.status(400).json({ error: 'levelId is required' })
  }
  if (!isArchitecture(architecture)) {
    return res.status(400).json({ error: "architecture must be 'ARM' or 'MIPS_R6'" })
  }

  const maxSteps = parseOptionalNumber(body.maxSteps)
  if (Number.isNaN(maxSteps)) {
    return res.status(400).json({ error: 'maxSteps must be a number' })
  }

  const includeRegisters = parseOptionalBoolean(body.includeRegisters) ?? false

  try {
    const result = await validateGame({
      sourceCode,
      levelId,
      architecture,
      maxSteps: maxSteps ?? undefined,
      includeRegisters
    })

    return res.status(200).json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return res.status(500).json({ error: message })
  }
})

router.post('/runs', async (req: Request, res: Response) => {
  const body = req.body as RunLogBody
  const { runId, sourceCode, levelId, architecture } = body

  if (!runId || typeof runId !== 'string') {
    return res.status(400).json({ error: 'runId is required' })
  }
  if (!sourceCode || typeof sourceCode !== 'string') {
    return res.status(400).json({ error: 'sourceCode is required' })
  }
  if (!levelId || typeof levelId !== 'string' || !ALLOWED_LEVEL_IDS.has(levelId)) {
    return res.status(400).json({ error: 'levelId is required' })
  }
  if (!isArchitecture(architecture)) {
    return res.status(400).json({ error: "architecture must be 'ARM' or 'MIPS_R6'" })
  }

  const update: Record<string, unknown> = {
    runId,
    sourceCode,
    levelId,
    architecture,
  }

  try {
    await RunLogModel.findOneAndUpdate(
      { runId },
      update,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )
    return res.status(204).end()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return res.status(500).json({ error: message })
  }
})

router.post('/submit', async (req: Request, res: Response) => {
  const body = req.body as SubmitBody
  const { sourceCode, levelId, architecture } = body

  if (!sourceCode || typeof sourceCode !== 'string') {
    return res.status(400).json({ error: 'sourceCode is required' })
  }
  if (!levelId || typeof levelId !== 'string' || !ALLOWED_LEVEL_IDS.has(levelId)) {
    return res.status(400).json({ error: 'levelId is required' })
  }
  if (!isArchitecture(architecture)) {
    return res.status(400).json({ error: "architecture must be 'ARM' or 'MIPS_R6'" })
  }

  const arrivalSeq = ++submitArrivalCounter

  try {
    const identity = await requireVerifiedGitHubIdentity(req)
    const syncedUser = await syncVerifiedGitHubUser(identity)

    const jobId = randomUUID()
    const now = Date.now()
    const isHeavy = levelId === 'level4' || levelId === 'challenge'
    const ticket = isHeavy ? ++heavyTicketCounter : null
    jobStore.set(jobId, { status: 'queued', createdAt: now, ticket })

    const userKey = `${syncedUser.submissionUserId}:${levelId}:${architecture}`
    if (isHeavy) {
      // A newer submission from the same user replaces their still-queued one,
      // so one student cannot occupy multiple queue slots. Auth can finish out
      // of order, so the arrival sequence decides which submit is the newest.
      const previous = activeQueuedJobByUser.get(userKey)
      if (previous && jobStore.get(previous.jobId)?.status === 'queued') {
        if (previous.arrivalSeq < arrivalSeq) {
          cancelledJobs.add(previous.jobId)
          activeQueuedJobByUser.set(userKey, { jobId, arrivalSeq })
        } else {
          cancelledJobs.add(jobId)
        }
      } else {
        activeQueuedJobByUser.set(userKey, { jobId, arrivalSeq })
      }
    }

    void (async () => {
      let summary: GameValidationSummary
      let metrics: ReturnType<typeof extractMetrics>
      let replay: SubmissionDocument['replay'] | undefined

      try {
        const run = async () => {
          if (isHeavy) {
            heavyStartedCounter += 1
            if (activeQueuedJobByUser.get(userKey)?.jobId === jobId) {
              activeQueuedJobByUser.delete(userKey)
            }
            if (cancelledJobs.has(jobId)) {
              cancelledJobs.delete(jobId)
              throw new Error('Replaced by a newer submission')
            }
          }
          jobStore.set(jobId, { status: 'processing', createdAt: now })
          return validateGame({
            sourceCode,
            levelId,
            architecture,
            recordReplay: levelId === 'challenge'
          })
        }

        const validation = isHeavy
          ? await heavyValidationQueue.enqueue(run).catch((error: unknown) => {
              if (error instanceof QueueOverloadedError) {
                // The ticket will never start; keep position math and the
                // per-user bookkeeping consistent.
                heavyStartedCounter += 1
                if (activeQueuedJobByUser.get(userKey)?.jobId === jobId) {
                  activeQueuedJobByUser.delete(userKey)
                }
                cancelledJobs.delete(jobId)
              }
              throw error
            })
          : await run()

        summary = validation.summary
        metrics = extractMetrics(levelId, summary)
        replay = validation.replayAttempt
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        // Terminal entries live 2h from completion, not from submission.
        jobStore.set(jobId, { status: 'failed', createdAt: Date.now(), error: message })
        return
      }

      const score = 'score' in metrics ? metrics.score : undefined
      const averageScore = 'averageScore' in metrics
        ? metrics.averageScore
        : (typeof score === 'number' ? score : undefined)

      try {
        const submission = await SubmissionModel.create({
          userId: syncedUser.submissionUserId,
          userName: syncedUser.submissionUserName,
          userAvatarUrl: syncedUser.submissionAvatarUrl,
          levelId,
          architecture,
          status: metrics.status,
          successRate: 'successRate' in metrics ? metrics.successRate : undefined,
          score,
          averageScore,
          steps: 'steps' in metrics ? metrics.steps : undefined,
          cycleCount: 'cycleCount' in metrics ? metrics.cycleCount : undefined,
          hasReplay: Boolean(replay && Array.isArray(replay.frames) && replay.frames.length > 0),
          summary,
          replay
        })
        jobStore.set(jobId, {
          status: 'done',
          createdAt: Date.now(),
          submission: toRankingEntry(submission),
          summary
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        jobStore.set(jobId, { status: 'failed', createdAt: Date.now(), error: message })
      }
    })()

    return res.status(202).json({ jobId })

  } catch (error) {
    if (error instanceof GitHubAuthError) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    const message = error instanceof Error ? error.message : String(error)
    return res.status(500).json({ error: message })
  }
})

router.get('/submissions/:submissionId/replay', async (req: Request, res: Response) => {
  const { submissionId } = req.params

  if (!submissionId || typeof submissionId !== 'string') {
    return res.status(400).json({ error: 'submissionId is required' })
  }

  try {
    const submission = await SubmissionModel.findById(submissionId).exec()
    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' })
    }

    const replay = submission.replay
    if (!replay || !Array.isArray(replay.frames) || replay.frames.length === 0) {
      return res.status(404).json({ error: 'Replay not available for this submission' })
    }

    return res.status(200).json({
      submission: toRankingEntry(submission),
      replay
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return res.status(500).json({ error: message })
  }
})

router.get('/ranking', async (req: Request, res: Response) => {
  const { levelId, architecture } = req.query

  if (typeof levelId !== 'string' || !ALLOWED_LEVEL_IDS.has(levelId)) {
    return res.status(400).json({ error: 'levelId query parameter is required' })
  }

  if (typeof architecture !== 'undefined') {
    if (typeof architecture !== 'string' || !isArchitecture(architecture)) {
      return res.status(400).json({ error: "architecture must be 'ARM' or 'MIPS_R6'" })
    }
  }

  try {
    const sort = buildRankingSort(levelId)
    const query: Record<string, unknown> = { levelId }
    if (typeof architecture === 'string' && isArchitecture(architecture)) {
      query.architecture = architecture
    }

    const submissions = await SubmissionModel.aggregate<RankingRecord>([
      { $match: query },
      { $sort: { userId: 1, createdAt: -1, _id: -1 } },
      {
        $group: {
          _id: '$userId',
          submission: { $first: '$$ROOT' }
        }
      },
      { $replaceRoot: { newRoot: '$submission' } },
      { $project: { replay: 0 } },
      { $sort: sort },
      { $limit: 200 }
    ])
      .exec()
    const ranking = submissions.map(toRankingEntryRecord)

    return res.status(200).json({ submissions: ranking })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return res.status(500).json({ error: message })
  }
})

export default router

function extractMetrics(levelId: string, summary: GameValidationSummary) {
  if (levelId === 'challenge') {
    const score = Number(summary.metrics?.score ?? summary.metrics?.lowestScore ?? summary.metrics?.averageScore ?? 0)
    const steps = Number(summary.metrics?.steps ?? summary.metrics?.lowestScoreSteps ?? 0)
    return {
      score: Number.isFinite(score) ? score : 0,
      steps: Number.isFinite(steps) ? Math.max(0, Math.round(steps)) : 0
    }
  }

  const status = summary.pass ? 'Accepted' as const : 'Failed' as const
  const summaryMetrics = (summary.metrics ?? {}) as Record<string, unknown>
  const cycleCountsRaw = summaryMetrics.cycleCounts
  const validCycleCounts = Array.isArray(cycleCountsRaw)
    ? cycleCountsRaw.filter((value: unknown): value is number => typeof value === 'number' && Number.isFinite(value))
    : []
  let cycleCount: number | undefined

  if (levelId === 'level4') {
    if (typeof summaryMetrics.medianCycleCount === 'number' && Number.isFinite(summaryMetrics.medianCycleCount)) {
      cycleCount = Number(summaryMetrics.medianCycleCount)
    } else if (validCycleCounts.length > 0) {
      const sortedCounts = [...validCycleCounts].sort((a, b) => a - b)
      const middle = Math.floor(sortedCounts.length / 2)
      cycleCount = sortedCounts.length % 2 === 0
        ? (sortedCounts[middle - 1] + sortedCounts[middle]) / 2
        : sortedCounts[middle]
    }
  }

  if (cycleCount === undefined) {
    if (typeof summaryMetrics.cycleCount === 'number') {
      cycleCount = Number(summaryMetrics.cycleCount)
    } else if (typeof summaryMetrics.averageCycleCount === 'number') {
      cycleCount = Number(summaryMetrics.averageCycleCount)
    } else if (validCycleCounts.length > 0) {
      cycleCount = validCycleCounts.reduce((min, value) => Math.min(min, value), validCycleCounts[0])
    }
  }

  if (typeof cycleCount === 'number' && Number.isFinite(cycleCount)) {
    return { status, cycleCount: Math.max(0, Math.round(cycleCount)) }
  }

  return { status }
}

function toRankingEntry(doc: SubmissionDocument) {
  const score = typeof doc.score === 'number'
    ? doc.score
    : (typeof doc.averageScore === 'number' ? doc.averageScore : 0)
  const summaryMetrics = (doc.summary?.metrics ?? {}) as Record<string, unknown>
  const steps = typeof doc.steps === 'number'
    ? doc.steps
    : (typeof summaryMetrics.steps === 'number'
        ? Math.max(0, Math.round(summaryMetrics.steps))
        : undefined)

  return {
    id: doc.id,
    userId: doc.userId,
    userName: doc.userName,
    userAvatarUrl: doc.userAvatarUrl,
    levelId: doc.levelId,
    architecture: doc.architecture,
    status: doc.status,
    successRate: doc.successRate ?? 0,
    score,
    averageScore: doc.averageScore ?? score,
    steps,
    cycleCount: typeof doc.cycleCount === 'number' ? doc.cycleCount : undefined,
    hasReplay: doc.hasReplay ?? Boolean(doc.replay && Array.isArray(doc.replay.frames) && doc.replay.frames.length > 0),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString()
  }
}

interface RankingRecord {
  _id: unknown
  userId: string
  userName: string
  userAvatarUrl?: string
  levelId: string
  architecture: Architecture
  status?: 'Accepted' | 'Failed'
  successRate?: number
  score?: number
  averageScore?: number
  steps?: number
  cycleCount?: number
  hasReplay?: boolean
  summary?: GameValidationSummary
  replay?: SubmissionDocument['replay']
  createdAt: Date | string
  updatedAt: Date | string
}

function toRankingEntryRecord(doc: RankingRecord) {
  const score = typeof doc.score === 'number'
    ? doc.score
    : (typeof doc.averageScore === 'number' ? doc.averageScore : 0)
  const summaryMetrics = (doc.summary?.metrics ?? {}) as Record<string, unknown>
  const steps = typeof doc.steps === 'number'
    ? doc.steps
    : (typeof summaryMetrics.steps === 'number'
        ? Math.max(0, Math.round(summaryMetrics.steps))
        : undefined)

  return {
    id: String(doc._id),
    userId: doc.userId,
    userName: doc.userName,
    userAvatarUrl: doc.userAvatarUrl,
    levelId: doc.levelId,
    architecture: doc.architecture,
    status: doc.status,
    successRate: doc.successRate ?? 0,
    score,
    averageScore: doc.averageScore ?? score,
    steps,
    cycleCount: typeof doc.cycleCount === 'number' ? doc.cycleCount : undefined,
    hasReplay: doc.hasReplay ?? Boolean(doc.replay && Array.isArray(doc.replay.frames) && doc.replay.frames.length > 0),
    createdAt: toIsoString(doc.createdAt),
    updatedAt: toIsoString(doc.updatedAt)
  }
}

function buildRankingSort(levelId: string): Record<string, 1 | -1> {
  if (levelId === 'challenge') {
    return { score: -1, steps: 1, createdAt: 1 }
  }

  return {
    status: 1,
    cycleCount: 1,
    createdAt: 1
  }
}

function toIsoString(value: Date | string): string {
  if (value instanceof Date) {
    return value.toISOString()
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? new Date(0).toISOString() : parsed.toISOString()
}

function parseOptionalNumber(value: unknown): number | undefined | typeof Number.NaN {
  if (typeof value === 'number') {
    return value
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    return Number.isNaN(parsed) ? Number.NaN : parsed
  }

  return undefined
}

function parseOptionalBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'string') {
    const normalized = value.toLowerCase().trim()
    if (normalized === 'true') return true
    if (normalized === 'false') return false
  }

  return undefined
}
