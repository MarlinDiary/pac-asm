/// <reference types="node" />
import { promises as fs } from 'fs'
import path from 'path'

import { validateGame, GameValidationSummary } from '../src/game'

const LEVEL_ID = 'level4'
const ARCHITECTURE = 'MIPS_R6' as const
const SUBMISSIONS_DIR = path.resolve(__dirname, '../../submissions')
const OUTPUT_PATH = path.resolve(__dirname, '../../results.csv')

async function main() {
  const entries = await fs.readdir(SUBMISSIONS_DIR)
  const rows: string[] = ['filename,pass,cycle']

  for (const entry of entries) {
    if (!entry.toLowerCase().endsWith('.txt')) continue

    const filePath = path.join(SUBMISSIONS_DIR, entry)
    const stat = await fs.stat(filePath).catch(() => null)
    if (!stat?.isFile()) continue

    let pass = false
    let cycle: number | undefined

    try {
      const sourceCode = await fs.readFile(filePath, 'utf8')
      const validation = await validateGame({
        sourceCode,
        levelId: LEVEL_ID,
        architecture: ARCHITECTURE
      })

      pass = validation.summary.pass
      cycle = extractCycle(validation.summary)
      console.log(`Graded ${entry}: ${pass ? 'pass' : 'fail'}${typeof cycle === 'number' ? ` (cycle=${cycle})` : ''}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`Failed to grade ${entry}: ${message}`)
    }

    const cycleCell = typeof cycle === 'number' ? String(cycle) : ''
    rows.push(`${toCsvCell(entry)},${pass ? 'pass' : 'fail'},${cycleCell}`)
  }

  await fs.writeFile(OUTPUT_PATH, rows.join('\n'), 'utf8')
  console.log(`\nWrote ${rows.length - 1} results to ${OUTPUT_PATH}`)
}

function extractCycle(summary: GameValidationSummary): number | undefined {
  const metrics = (summary.metrics ?? {}) as Record<string, unknown>
  const cycleCountsRaw = metrics.cycleCounts
  const validCycleCounts = Array.isArray(cycleCountsRaw)
    ? cycleCountsRaw.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    : []

  let cycleCount: number | undefined
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
