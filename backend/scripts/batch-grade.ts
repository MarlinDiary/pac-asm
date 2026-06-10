/// <reference types="node" />
import { promises as fs } from 'fs'
import path from 'path'

import { validateGame } from '../src/game'
import type { Architecture, GameAttemptResult, GameValidationResult } from '../src/game'

const DEFAULT_LEVEL_ID = 'challenge'
const DEFAULT_ARCHITECTURE: Architecture = 'ARM'
const DEFAULT_BATCHES = 20
const DEFAULT_BATCH_SIZE = 100
const DEFAULT_INPUT_PATH = path.resolve(__dirname, '../../submissions')
const DEFAULT_OUTPUT_PATH = path.resolve(__dirname, '../../challenge-arm-results.csv')
const DEFAULT_EXTENSIONS = ['.txt', '.asm', '.s']

interface CliOptions {
  inputPath: string
  outputPath: string
  levelId: string
  architecture: Architecture
  batches: number
  batchSize: number
  maxSteps?: number
  extensions: Set<string>
  quiet: boolean
  help: boolean
}

interface SourceInput {
  label: string
  sourceCode: string
}

interface GradeRow {
  file: string
  status: 'ok' | 'error'
  pass: boolean
  finalScore?: number
  bestBatch?: number
  bestBatchLowestSteps?: number
  bestBatchLowestAttempt?: number
  worstBatchScore?: number
  averageBatchScore?: number
  batches?: number
  batchSize?: number
  totalAttempts?: number
  batchScores?: number[]
  reason?: string
  durationMs: number
}

interface BatchMetrics {
  batch: number
  pass: boolean
  lowestScore: number
  lowestScoreSteps: number
  lowestScoreAttempt: number
  averageScore?: number
  reason?: string
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    process.stdout.write(helpText())
    return
  }

  const inputs = await readInputs(options)
  if (inputs.length === 0) {
    throw new Error(`No source files found in ${options.inputPath}`)
  }

  const rows: GradeRow[] = []
  for (let index = 0; index < inputs.length; index++) {
    const input = inputs[index]
    if (!options.quiet) {
      console.error(
        `Grading ${index + 1}/${inputs.length}: ${input.label} ` +
        `(${options.levelId}/${options.architecture}, batches=${options.batches}, batchSize=${options.batchSize})`
      )
    }

    rows.push(await gradeInput(input, options))
  }

  const csv = toCsv(rows)
  if (options.outputPath === '-') {
    process.stdout.write(csv)
    return
  }

  await fs.mkdir(path.dirname(options.outputPath), { recursive: true })
  await fs.writeFile(options.outputPath, csv, 'utf8')
  if (!options.quiet) {
    console.error(`Wrote ${rows.length} result(s) to ${options.outputPath}`)
  }
}

async function gradeInput(input: SourceInput, options: CliOptions): Promise<GradeRow> {
  const start = process.hrtime.bigint()

  try {
    const batchMetrics: BatchMetrics[] = []
    for (let batchIndex = 0; batchIndex < options.batches; batchIndex++) {
      const validation = await validateGame({
        sourceCode: input.sourceCode,
        levelId: options.levelId,
        architecture: options.architecture,
        attempts: options.batchSize,
        maxSteps: options.maxSteps
      })
      const metrics = extractChallengeMetrics(validation)
      const batch = batchIndex + 1
      batchMetrics.push({
        batch,
        pass: validation.summary.pass,
        lowestScore: metrics.lowestScore ?? 0,
        lowestScoreSteps: metrics.lowestScoreSteps ?? 0,
        lowestScoreAttempt: metrics.lowestScoreAttempt ?? 0,
        averageScore: metrics.averageScore,
        reason: validation.summary.reason
      })

      if (!options.quiet) {
        console.error(
          `  batch ${batch}/${options.batches}: lowest=${formatOptionalNumber(metrics.lowestScore)} ` +
          `steps=${formatOptionalNumber(metrics.lowestScoreSteps)}`
        )
      }
    }

    const durationMs = elapsedMs(start)
    const bestBatch = selectBestBatch(batchMetrics)
    const batchScores = batchMetrics.map(batch => batch.lowestScore)
    const worstBatchScore = batchScores.reduce((min, score) => Math.min(min, score), batchScores[0] ?? 0)
    const averageBatchScore = batchScores.length === 0
      ? 0
      : batchScores.reduce((sum, score) => sum + score, 0) / batchScores.length
    const failedBatch = batchMetrics.find(batch => !batch.pass)

    return {
      file: input.label,
      status: 'ok',
      pass: !failedBatch,
      finalScore: bestBatch?.lowestScore,
      bestBatch: bestBatch?.batch,
      bestBatchLowestSteps: bestBatch?.lowestScoreSteps,
      bestBatchLowestAttempt: bestBatch?.lowestScoreAttempt,
      worstBatchScore,
      averageBatchScore,
      batches: options.batches,
      batchSize: options.batchSize,
      totalAttempts: options.batches * options.batchSize,
      batchScores,
      reason: failedBatch?.reason,
      durationMs
    }
  } catch (error) {
    return {
      file: input.label,
      status: 'error',
      pass: false,
      reason: error instanceof Error ? error.message : String(error),
      durationMs: elapsedMs(start)
    }
  }
}

function extractChallengeMetrics(validation: GameValidationResult) {
  const metrics = (validation.summary.metrics ?? {}) as Record<string, unknown>
  const attempts = validation.attempts
  const lowestAttempt = attempts.reduce<GameAttemptResult | null>((selected, attempt) => {
    if (!selected) return attempt
    if (attempt.score < selected.score) return attempt
    if (attempt.score > selected.score) return selected
    return attempt.steps < selected.steps ? attempt : selected
  }, null)
  const wins = attempts.filter(attempt => attempt.success).length
  const failures = attempts.length - wins

  return {
    lowestScore: getNumberMetric(metrics, 'lowestScore', 'score') ?? lowestAttempt?.score,
    lowestScoreSteps: getNumberMetric(metrics, 'lowestScoreSteps', 'steps') ?? lowestAttempt?.steps,
    lowestScoreAttempt: lowestAttempt?.attempt,
    averageScore: getNumberMetric(metrics, 'averageScore'),
    attempts: getNumberMetric(metrics, 'attempts') ?? attempts.length,
    wins,
    failures
  }
}

function selectBestBatch(batchMetrics: BatchMetrics[]): BatchMetrics | undefined {
  return batchMetrics.reduce<BatchMetrics | undefined>((selected, batch) => {
    if (!selected) return batch
    if (batch.lowestScore > selected.lowestScore) return batch
    if (batch.lowestScore < selected.lowestScore) return selected
    if (batch.lowestScoreSteps < selected.lowestScoreSteps) return batch
    if (batch.lowestScoreSteps > selected.lowestScoreSteps) return selected
    return batch.batch < selected.batch ? batch : selected
  }, undefined)
}

async function readInputs(options: CliOptions): Promise<SourceInput[]> {
  if (options.inputPath === '-') {
    return [{
      label: 'stdin',
      sourceCode: await readStdin()
    }]
  }

  const inputPath = path.resolve(options.inputPath)
  const stat = await fs.stat(inputPath)
  if (stat.isFile()) {
    return [{
      label: path.basename(inputPath),
      sourceCode: await fs.readFile(inputPath, 'utf8')
    }]
  }

  if (!stat.isDirectory()) {
    throw new Error(`Input path is neither a file nor a directory: ${inputPath}`)
  }

  const files = await collectSourceFiles(inputPath, options.extensions)
  const inputs: SourceInput[] = []
  for (const filePath of files) {
    inputs.push({
      label: path.relative(inputPath, filePath),
      sourceCode: await fs.readFile(filePath, 'utf8')
    })
  }
  return inputs
}

async function collectSourceFiles(root: string, extensions: Set<string>): Promise<string[]> {
  const files: string[] = []
  const entries = await fs.readdir(root, { withFileTypes: true })
  for (const entry of entries) {
    const entryPath = path.join(root, entry.name)
    if (entry.isDirectory()) {
      files.push(...await collectSourceFiles(entryPath, extensions))
      continue
    }
    if (!entry.isFile()) {
      continue
    }
    if (extensions.has(path.extname(entry.name).toLowerCase())) {
      files.push(entryPath)
    }
  }
  return files.sort((a, b) => a.localeCompare(b))
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)))
  }
  return Buffer.concat(chunks).toString('utf8')
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    inputPath: DEFAULT_INPUT_PATH,
    outputPath: DEFAULT_OUTPUT_PATH,
    levelId: DEFAULT_LEVEL_ID,
    architecture: DEFAULT_ARCHITECTURE,
    batches: DEFAULT_BATCHES,
    batchSize: DEFAULT_BATCH_SIZE,
    extensions: new Set(DEFAULT_EXTENSIONS),
    quiet: false,
    help: false
  }

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]

    switch (arg) {
      case '--help':
      case '-h':
        options.help = true
        break
      case '--input':
      case '--file':
      case '--dir':
      case '-i':
        options.inputPath = requireValue(argv, ++index, arg)
        break
      case '--output':
      case '-o':
        options.outputPath = requireValue(argv, ++index, arg)
        break
      case '--level':
        options.levelId = requireValue(argv, ++index, arg)
        break
      case '--arch':
      case '--architecture':
        options.architecture = parseArchitecture(requireValue(argv, ++index, arg))
        break
      case '--attempts':
      case '--repeats':
      case '--batch-size':
      case '--runs-per-batch':
        options.batchSize = parsePositiveInteger(requireValue(argv, ++index, arg), arg)
        break
      case '--batches':
      case '--batch-count':
        options.batches = parsePositiveInteger(requireValue(argv, ++index, arg), arg)
        break
      case '--max-steps':
        options.maxSteps = parsePositiveInteger(requireValue(argv, ++index, arg), arg)
        break
      case '--ext':
      case '--extensions':
        options.extensions = parseExtensions(requireValue(argv, ++index, arg))
        break
      case '--quiet':
        options.quiet = true
        break
      default:
        if (arg.startsWith('-')) {
          throw new Error(`Unknown option: ${arg}`)
        }
        options.inputPath = arg
        break
    }
  }

  return options
}

function parseArchitecture(value: string): Architecture {
  if (value === 'ARM' || value === 'MIPS_R6') {
    return value
  }
  throw new Error(`Architecture must be ARM or MIPS_R6, got: ${value}`)
}

function parsePositiveInteger(value: string, optionName: string): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${optionName} must be a positive integer, got: ${value}`)
  }
  return parsed
}

function parseExtensions(value: string): Set<string> {
  const extensions = value
    .split(',')
    .map(item => item.trim().toLowerCase())
    .filter(Boolean)
    .map(item => item.startsWith('.') ? item : `.${item}`)

  if (extensions.length === 0) {
    throw new Error('--extensions must contain at least one extension')
  }
  return new Set(extensions)
}

function requireValue(argv: string[], index: number, optionName: string): string {
  const value = argv[index]
  if (!value || (value.startsWith('-') && value !== '-')) {
    throw new Error(`${optionName} requires a value`)
  }
  return value
}

function getNumberMetric(metrics: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = metrics[key]
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }
  }
  return undefined
}

function elapsedMs(start: bigint): number {
  return Math.round(Number(process.hrtime.bigint() - start) / 1_000_000)
}

function toCsv(rows: GradeRow[]): string {
  const header = [
    'file',
    'status',
    'pass',
    'final_score',
    'best_batch',
    'best_batch_lowest_steps',
    'best_batch_lowest_attempt',
    'worst_batch_score',
    'average_batch_score',
    'batches',
    'batch_size',
    'total_attempts',
    'batch_scores',
    'reason',
    'duration_ms'
  ]
  const lines = [header.join(',')]

  for (const row of rows) {
    lines.push([
      row.file,
      row.status,
      row.pass ? 'true' : 'false',
      formatOptionalNumber(row.finalScore),
      formatOptionalNumber(row.bestBatch),
      formatOptionalNumber(row.bestBatchLowestSteps),
      formatOptionalNumber(row.bestBatchLowestAttempt),
      formatOptionalNumber(row.worstBatchScore),
      formatOptionalNumber(row.averageBatchScore),
      formatOptionalNumber(row.batches),
      formatOptionalNumber(row.batchSize),
      formatOptionalNumber(row.totalAttempts),
      row.batchScores?.map(score => formatOptionalNumber(score)).join('|') ?? '',
      row.reason ?? '',
      String(row.durationMs)
    ].map(toCsvCell).join(','))
  }

  return `${lines.join('\n')}\n`
}

function formatOptionalNumber(value: number | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return ''
  }
  return Number.isInteger(value) ? String(value) : value.toFixed(2)
}

function toCsvCell(value: string): string {
  const needsQuotes = /[",\n]/.test(value)
  const sanitized = value.replace(/"/g, '""')
  return needsQuotes ? `"${sanitized}"` : sanitized
}

function helpText(): string {
  return `Usage:
  node -r ts-node/register scripts/batch-grade.ts [options]

Defaults:
  --input ${DEFAULT_INPUT_PATH}
  --output ${DEFAULT_OUTPUT_PATH}
  --level ${DEFAULT_LEVEL_ID}
  --arch ${DEFAULT_ARCHITECTURE}
  --batches ${DEFAULT_BATCHES}
  --batch-size ${DEFAULT_BATCH_SIZE}

Options:
  -i, --input <path>        Source file, source directory, or - for stdin
  -o, --output <path>       CSV output path, or - for stdout
      --level <id>          Level id to validate
      --arch <architecture> ARM or MIPS_R6
      --batches <count>     Number of leaderboard-style batches
      --batch-size <count>  Runs per batch; --attempts is kept as an alias
      --max-steps <count>   Optional per-attempt step cap
      --ext <list>          Directory file extensions, comma-separated
      --quiet               Suppress progress logs
  -h, --help                Show this help

Examples:
  node -r ts-node/register scripts/batch-grade.ts --input ../submissions
  node -r ts-node/register scripts/batch-grade.ts --file student.s --output -
`
}

main().catch(error => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
