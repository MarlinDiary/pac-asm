import { Request, Response, Router } from 'express'

import { validateGame, GameValidationResult, GameValidationSummary } from '../game'
import { Architecture } from '../game/emulator/types'
import SubmissionModel, { SubmissionDocument } from '../models/submission'

const router = Router()

interface ValidateGameBody {
  sourceCode?: string
  levelId?: string
  architecture?: Architecture
  attemptsOverride?: number | string
  maxSteps?: number | string
  includeRegisters?: boolean | string
}

interface SubmitBody extends ValidateGameBody {
  user?: {
    id?: string
    name?: string
    avatarUrl?: string
  }
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

    const submissions = await SubmissionModel.find(query).sort(sort).limit(50).exec()
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
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString()
  }
}

function buildRankingSort(levelId: string): Record<string, 1 | -1> {
  if (levelId === 'challenge') {
    return { averageScore: -1, createdAt: -1 }
  }

  return { createdAt: -1 }
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
