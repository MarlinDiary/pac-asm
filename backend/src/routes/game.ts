import { Request, Response, Router } from 'express'

import { validateGame } from '../game'
import { Architecture } from '../game/emulator/types'

const router = Router()

interface ValidateGameBody {
  sourceCode?: string
  levelId?: string
  architecture?: Architecture
  attemptsOverride?: number | string
  maxSteps?: number | string
  includeRegisters?: boolean | string
}

const isArchitecture = (value: unknown): value is Architecture => value === 'ARM' || value === 'MIPS'

router.post('/validate', async (req: Request, res: Response) => {
  const body = req.body as ValidateGameBody
  const { sourceCode, levelId, architecture } = body

  if (!sourceCode || typeof sourceCode !== 'string') {
    return res.status(400).json({ error: 'sourceCode is required' })
  }
  if (!levelId || typeof levelId !== 'string') {
    return res.status(400).json({ error: 'levelId is required' })
  }
  if (!isArchitecture(architecture)) {
    return res.status(400).json({ error: "architecture must be 'ARM' or 'MIPS'" })
  }

  const attemptsOverride = typeof body.attemptsOverride === 'number'
    ? body.attemptsOverride
    : typeof body.attemptsOverride === 'string' && body.attemptsOverride.trim().length > 0
      ? Number(body.attemptsOverride)
      : undefined

  const maxSteps = typeof body.maxSteps === 'number'
    ? body.maxSteps
    : typeof body.maxSteps === 'string' && body.maxSteps.trim().length > 0
      ? Number(body.maxSteps)
      : undefined

  if (attemptsOverride !== undefined && Number.isNaN(attemptsOverride)) {
    return res.status(400).json({ error: 'attemptsOverride must be a number' })
  }
  if (maxSteps !== undefined && Number.isNaN(maxSteps)) {
    return res.status(400).json({ error: 'maxSteps must be a number' })
  }

  const includeRegisters = typeof body.includeRegisters === 'boolean'
    ? body.includeRegisters
    : typeof body.includeRegisters === 'string'
      ? body.includeRegisters.toLowerCase() === 'true'
      : false

  try {
    const result = await validateGame({
      sourceCode,
      levelId,
      architecture,
      attemptsOverride: attemptsOverride as number | undefined,
      maxSteps: maxSteps as number | undefined,
      includeRegisters
    })

    return res.status(200).json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return res.status(500).json({ error: message })
  }
})

export default router
