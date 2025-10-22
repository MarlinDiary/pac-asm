/// <reference types="node" />
import { promises as fs } from 'fs'
import path from 'path'

import { validateGame, GameValidationSummary, Architecture } from '../src/game'

const DEFAULT_LEVEL_ID = 'level4'
const DEFAULT_ARCHITECTURE: Architecture = 'MIPS_R6'
const DEFAULT_OUTPUT = 'batch-results.csv'
const ALLOWED_LEVEL_IDS = new Set(['level1', 'level2', 'level3', 'level4', 'challenge'])

interface CliOptions {
  submissionsDir: string
  levelId: string
  architecture: Architecture
  attemptsOverride?: number
  maxSteps?: number
  outputPath: string
  limit?: number
}

async function main() {
  const options = parseArgs(process.argv.slice(2))

  try {
    await fs.access(options.submissionsDir)
  } catch {
    throw new Error(`Submissions directory not found: ${options.submissionsDir}`)
  }

  const entries = await fs.readdir(options.submissionsDir)
  const results: Array<{ filename: string; pass: boolean; cycle?: number; error?: string }> = []

  let processed = 0
  for (const entry of entries) {
    if (typeof options.limit === 'number' && processed >= options.limit) {
      break
    }
    const entryPath = path.join(options.submissionsDir, entry)
    const stat = await fs.stat(entryPath).catch(() => null)
    if (!stat?.isFile()) {
      continue
    }

    let pass = false
    let cycle: number | undefined
    let error: string | undefined

    try {
      const sourceCode = await fs.readFile(entryPath, 'utf8')
      const validation = await validateGame({
        sourceCode,
        levelId: options.levelId,
        architecture: options.architecture,
        attemptsOverride: options.attemptsOverride,
        maxSteps: options.maxSteps,
        includeRegisters: false
      })

      pass = validation.summary.pass
      cycle = extractCycle(validation.summary, options.levelId)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      error = message
      pass = false
    }

    if (error) {
      console.warn(`Failed to grade ${entry}: ${error}`)
    } else {
      console.log(`Graded ${entry}: ${pass ? 'pass' : 'fail'}${typeof cycle === 'number' ? ` (cycle=${cycle})` : ''}`)
    }

    results.push({ filename: entry, pass, cycle, error })
    processed++
  }

  const csvLines = [
    'filename,pass,cycle',
    ...results.map(result => {
      const filename = toCsvCell(result.filename)
      const passCell = result.pass ? 'pass' : 'fail'
      const cycleCell = typeof result.cycle === 'number' && Number.isFinite(result.cycle)
        ? String(result.cycle)
        : ''
      return `${filename},${passCell},${cycleCell}`
    })
  ]

  const csvPath = path.resolve(options.outputPath)
  await fs.writeFile(csvPath, csvLines.join('\n'), 'utf8')
  console.log(`\nWrote ${results.length} results to ${csvPath}`)
}

function parseArgs(argv: string[]): CliOptions {
  const args = new Map<string, string>()
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg.startsWith('--')) {
      continue
    }
    const key = arg.slice(2)
    const value = argv[i + 1]
    if (value && !value.startsWith('--')) {
      args.set(key, value)
      i++
    } else {
      args.set(key, '')
    }
  }

  const submissionsDir = path.resolve(
    args.get('dir') ?? path.join(__dirname, '../../submissions')
  )

  const levelId = args.get('level') ?? DEFAULT_LEVEL_ID
  if (!ALLOWED_LEVEL_IDS.has(levelId)) {
    throw new Error(`Invalid level "${levelId}". Must be one of: ${Array.from(ALLOWED_LEVEL_IDS).join(', ')}`)
  }
  const architectureArg = (args.get('arch') ?? DEFAULT_ARCHITECTURE) as Architecture

  if (!isValidArchitecture(architectureArg)) {
    throw new Error(`Invalid architecture "${architectureArg}". Expected 'ARM' or 'MIPS_R6'.`)
  }

  const attemptsOverride = parseOptionalNumber(args.get('attempts'))
  const maxSteps = parseOptionalNumber(args.get('maxSteps'))
  const limit = parseOptionalNumber(args.get('limit'))
  const outputPath = path.resolve(args.get('out') ?? path.join(process.cwd(), DEFAULT_OUTPUT))

  return {
    submissionsDir,
    levelId,
    architecture: architectureArg,
    attemptsOverride: attemptsOverride ?? undefined,
    maxSteps: maxSteps ?? undefined,
    outputPath,
    limit: limit ?? undefined
  }
}

function parseOptionalNumber(value: string | undefined): number | undefined {
  if (typeof value !== 'string' || value.length === 0) {
    return undefined
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function isValidArchitecture(value: string): value is Architecture {
  return value === 'ARM' || value === 'MIPS_R6'
}

function extractCycle(summary: GameValidationSummary, levelId: string): number | undefined {
  const metrics = (summary.metrics ?? {}) as Record<string, unknown>

  const cycleCountsRaw = metrics.cycleCounts
  const validCycleCounts = Array.isArray(cycleCountsRaw)
    ? cycleCountsRaw.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    : []

  let cycleCount: number | undefined

  if (levelId === 'level4') {
    const median = metrics.medianCycleCount
    if (typeof median === 'number' && Number.isFinite(median)) {
      cycleCount = Number(median)
    } else if (validCycleCounts.length > 0) {
      const sorted = [...validCycleCounts].sort((a, b) => a - b)
      const middle = Math.floor(sorted.length / 2)
      cycleCount = sorted.length % 2 === 0
        ? (sorted[middle - 1] + sorted[middle]) / 2
        : sorted[middle]
    }
  }

  if (cycleCount === undefined) {
    if (typeof metrics.cycleCount === 'number') {
      cycleCount = Number(metrics.cycleCount)
    } else if (typeof metrics.averageCycleCount === 'number') {
      cycleCount = Number(metrics.averageCycleCount)
    } else if (validCycleCounts.length > 0) {
      cycleCount = validCycleCounts.reduce((min, value) => Math.min(min, value), validCycleCounts[0])
    }
  }

  if (typeof cycleCount === 'number' && Number.isFinite(cycleCount)) {
    return Math.max(0, Math.round(cycleCount))
  }

  return undefined
}

function toCsvCell(value: string): string {
  const needsQuotes = /[",\n]/.test(value)
  const sanitized = value.replace(/"/g, '""')
  return needsQuotes ? `"${sanitized}"` : sanitized
}

main().catch(error => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
