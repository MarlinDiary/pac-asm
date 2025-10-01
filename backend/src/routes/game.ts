import { Request, Response, Router } from 'express'

import { validateGame, GameValidationSummary } from '../game'
import { Architecture } from '../game/emulator/types'
import SubmissionModel, { SubmissionDocument } from '../models/submission'
import RunLogModel from '../models/run-log'

const router = Router()

interface ValidateGameBody {
  sourceCode?: string
  levelId?: string
  architecture?: Architecture
  attemptsOverride?: number | string
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

  const attemptsOverride = parseOptionalNumber(body.attemptsOverride)
  if (Number.isNaN(attemptsOverride)) {
    return res.status(400).json({ error: 'attemptsOverride must be a number' })
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
      attemptsOverride: attemptsOverride ?? undefined,
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
  const { sourceCode, levelId, architecture, user } = body

  if (!sourceCode || typeof sourceCode !== 'string') {
    return res.status(400).json({ error: 'sourceCode is required' })
  }
  if (!levelId || typeof levelId !== 'string' || !ALLOWED_LEVEL_IDS.has(levelId)) {
    return res.status(400).json({ error: 'levelId is required' })
  }
  if (!isArchitecture(architecture)) {
    return res.status(400).json({ error: "architecture must be 'ARM' or 'MIPS_R6'" })
  }
  if (!user || typeof user.id !== 'string' || typeof user.name !== 'string') {
    return res.status(400).json({ error: 'user information is required' })
  }

  try {
    let summary: GameValidationSummary
    let metrics: ReturnType<typeof extractMetrics>

    try {
      const validation = await validateGame({
        sourceCode,
        levelId,
        architecture
      })

      summary = validation.summary
      metrics = extractMetrics(levelId, summary)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      summary = {
        pass: false,
        reason: message,
        metrics: {}
      }
      metrics = extractMetrics(levelId, summary)
    }

    await SubmissionModel.deleteMany({ userId: user.id, levelId, architecture })

    const submissionPayload = {
      userId: user.id,
      userName: user.name,
      userAvatarUrl: user.avatarUrl,
      levelId,
      architecture,
      status: metrics.status,
      successRate: 'successRate' in metrics ? metrics.successRate : undefined,
      averageScore: 'averageScore' in metrics ? metrics.averageScore : undefined,
      cycleCount: 'cycleCount' in metrics ? metrics.cycleCount : undefined,
      summary
    }

    const submission = await SubmissionModel.create(submissionPayload)

    return res.status(200).json({
      submission: toRankingEntry(submission),
      summary
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

    const submissions = await SubmissionModel.find(query).sort(sort).limit(200).exec()
    const ranking = submissions.map(toRankingEntry)

    return res.status(200).json({ submissions: ranking })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return res.status(500).json({ error: message })
  }
})

export default router

function extractMetrics(levelId: string, summary: GameValidationSummary) {
  if (levelId === 'challenge') {
    const averageScore = Number(summary.metrics?.averageScore ?? 0)
    return { averageScore }
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
  return {
    id: doc.id,
    userId: doc.userId,
    userName: doc.userName,
    userAvatarUrl: doc.userAvatarUrl,
    levelId: doc.levelId,
    architecture: doc.architecture,
    status: doc.status,
    successRate: doc.successRate ?? 0,
    averageScore: doc.averageScore ?? 0,
    cycleCount: typeof doc.cycleCount === 'number' ? doc.cycleCount : undefined,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString()
  }
}

function buildRankingSort(levelId: string): Record<string, 1 | -1> {
  if (levelId === 'challenge') {
    return { averageScore: -1, createdAt: 1 }
  }

  return {
    status: 1,
    cycleCount: 1,
    createdAt: 1
  }
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
