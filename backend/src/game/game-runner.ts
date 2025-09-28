import { NodeEmulator, RunUntilMemWriteResult } from './emulator/node-emulator'
import { Architecture, RegisterInfo } from './emulator/types'
import {
  initializeEmulatorWithCode,
  getEmulatorMemoryState,
  resetEmulatorWithMemory,
  MEMORY_CONFIG
} from './emulator-utils'
import {
  writeMapUpdatesToMemory,
  writeCompleteMapToMemory
} from './map-memory'
import {
  updateMapWithMovementAndGhosts,
  updateGhostsOnly,
  checkVictoryCondition
} from './game-animation'
import { GameMap, TileSymbol, getMap } from './maps'
import {
  EMULATOR_RUN_TIMEOUT_MS,
  EMULATOR_RUN_TIMEOUT_US,
  formatMemoryError,
  formatRuntimeError,
  formatTimeoutError
} from './emulator/errors'

const TURN_PENALTY = 1
const DOT_REWARD = 10
const VICTORY_BONUS = 200
const GHOST_PENALTY = 200

export interface ReplayMap {
  tiles: TileSymbol[][]
  playerPosition: GameMap['playerPosition']
  ghostPositions: GameMap['ghostPositions']
}

export interface GameFrame {
  step: number
  command: number
  score: number
  map: ReplayMap
  registers?: RegisterInfo[]
  memEvent?: { address: number; value: number }
  stopReason?: 'mem-write' | 'end-of-code' | 'timeout' | 'unknown'
}

export interface GameAttemptResult {
  attempt: number
  success: boolean
  victory: boolean
  score: number
  steps: number
  frames: GameFrame[]
  failureReason?: string
  errors: string[]
}

export interface GameValidationOptions {
  sourceCode: string
  levelId: string
  architecture: Architecture
  attemptsOverride?: number
  maxSteps?: number
  includeRegisters?: boolean
}

export interface GameValidationSummary {
  pass: boolean
  reason?: string
  metrics: Record<string, unknown>
}

export interface GameValidationResult {
  levelId: string
  architecture: Architecture
  attempts: GameAttemptResult[]
  summary: GameValidationSummary
}

interface LevelRule {
  attempts: number
  mode: 'single-pass' | 'all-pass' | 'win-rate' | 'average-score'
  threshold?: number
}

const LEVEL_RULES: Record<string, LevelRule> = {
  level1: { attempts: 1, mode: 'single-pass' },
  level2: { attempts: 1, mode: 'single-pass' },
  level3: { attempts: 1, mode: 'single-pass' },
  level4: { attempts: 10, mode: 'all-pass' },
  challenge: { attempts: 10, mode: 'average-score', threshold: 100 }
}

function cloneGameMap(map: GameMap): GameMap {
  return {
    ...map,
    tiles: map.tiles.map(row => [...row]),
    ghostPositions: map.ghostPositions.map(pos => ({ ...pos })),
    ghostPreviousPositions: map.ghostPreviousPositions
      ? map.ghostPreviousPositions.map(pos => ({ ...pos }))
      : undefined,
    playerPosition: map.playerPosition ? { ...map.playerPosition } : map.playerPosition,
    playerAnimation: map.playerAnimation
      ? {
          ...map.playerAnimation,
          animationPosition: map.playerAnimation.animationPosition
            ? { ...map.playerAnimation.animationPosition }
            : undefined
        }
      : undefined,
    ghostAnimations: map.ghostAnimations
      ? map.ghostAnimations.map(animation => animation
          ? {
              ...animation,
              animationPosition: animation.animationPosition
                ? { ...animation.animationPosition }
                : undefined
            }
          : animation)
      : undefined,
    dotAnimations: map.dotAnimations ? map.dotAnimations.map(dot => ({ ...dot })) : undefined,
    waterBackground: map.waterBackground ? { ...map.waterBackground } : undefined
  }
}

function toReplayMap(map: GameMap): ReplayMap {
  return {
    tiles: map.tiles.map(row => [...row]) as TileSymbol[][],
    playerPosition: map.playerPosition ? { ...map.playerPosition } : map.playerPosition,
    ghostPositions: map.ghostPositions.map(pos => ({ ...pos }))
  }
}

function countDots(map: GameMap): number {
  let count = 0
  for (let row = 0; row < map.height; row++) {
    for (let col = 0; col < map.width; col++) {
      if (map.tiles[row][col] === '.') {
        count++
      }
    }
  }
  return count
}

function applyScoreDelta(score: number, delta: number): number {
  if (delta === 0) return score
  return Math.max(0, score + delta)
}

function createInitialFrame(map: GameMap, registers?: RegisterInfo[]): GameFrame {
  return {
    step: 0,
    command: 0,
    score: 0,
    map: toReplayMap(map),
    registers
  }
}

async function captureFrame(
  emulator: NodeEmulator,
  map: GameMap,
  score: number,
  step: number,
  command: number,
  includeRegisters: boolean,
  memEvent?: { address: number; value: number },
  stopReason?: 'mem-write' | 'end-of-code' | 'timeout' | 'unknown'
): Promise<GameFrame> {
  let registers: RegisterInfo[] | undefined = undefined
  if (includeRegisters) {
    try {
      const memoryState = await getEmulatorMemoryState(emulator)
      registers = memoryState?.registers ?? []
    } catch {
      registers = []
    }
  }
  return {
    step,
    command,
    score,
    map: toReplayMap(map),
    registers,
    memEvent,
    stopReason
  }
}

interface AttemptContext {
  emulator: NodeEmulator
  machineCode: number[]
  architecture: Architecture
  maxSteps: number
  attemptIndex: number
  includeRegisters: boolean
}

async function prepareEmulatorForAttempt(
  ctx: AttemptContext,
  map: GameMap
): Promise<void> {
  if (ctx.attemptIndex === 0) {
    return
  }
  await resetEmulatorWithMemory(ctx.emulator)
  await ctx.emulator.loadCode(ctx.machineCode)
  const success = await writeCompleteMapToMemory(ctx.emulator, map, ctx.architecture)
  if (!success) {
    throw new Error('Failed to write map data for attempt')
  }
}

async function runAttempt(
  ctx: AttemptContext,
  baseMap: GameMap
): Promise<GameAttemptResult> {
  const errors: string[] = []
  const initialMap = cloneGameMap(baseMap)
  await prepareEmulatorForAttempt(ctx, initialMap)

  let initialRegisters: RegisterInfo[] | undefined = undefined
  if (ctx.includeRegisters) {
    try {
      initialRegisters = (await ctx.emulator.getAllRegisters()) ?? []
    } catch {
      initialRegisters = []
    }
  }

  const frames: GameFrame[] = [createInitialFrame(initialMap, initialRegisters)]

  let currentMapState = cloneGameMap(initialMap)
  let previousMapState = cloneGameMap(initialMap)
  let movementCount = 0
  let recordedMovementCount = 0
  let stagnantSteps = 0
  let score = 0
  let levelCompletionAwarded = false
  let failureReason: string | undefined
  let victoryAchieved = false

  while (movementCount < ctx.maxSteps) {
    let runResult: RunUntilMemWriteResult | undefined
    try {
      runResult = await ctx.emulator.runUntilMemWrite(
        MEMORY_CONFIG.DATA_BASE,
        [1, 2, 3, 4],
        EMULATOR_RUN_TIMEOUT_US
      )
    } catch (error) {
      recordedMovementCount = movementCount
      if (error instanceof Error && error.name === 'TimeoutError') {
        failureReason = formatTimeoutError(
          'No movement command observed',
          EMULATOR_RUN_TIMEOUT_MS,
          `addr=0x${MEMORY_CONFIG.DATA_BASE.toString(16)}, expect=1/2/3/4`
        )
        errors.push(failureReason)
        frames.push(await captureFrame(
          ctx.emulator,
          currentMapState,
          score,
          movementCount,
          0,
          ctx.includeRegisters,
          undefined,
          'timeout'
        ))
      } else {
        const detail = error instanceof Error ? error.message : 'unexpected failure'
        failureReason = formatRuntimeError('runUntilMemWrite execution failed', detail)
        errors.push(failureReason)
        frames.push(await captureFrame(
          ctx.emulator,
          currentMapState,
          score,
          movementCount,
          0,
          ctx.includeRegisters
        ))
      }
      break
    }

    if (!runResult) {
      failureReason = formatTimeoutError(
        'runUntilMemWrite returned no result',
        EMULATOR_RUN_TIMEOUT_MS,
        `addr=0x${MEMORY_CONFIG.DATA_BASE.toString(16)}, expect=1/2/3/4`
      )
      errors.push(failureReason)
      recordedMovementCount = movementCount
      frames.push(await captureFrame(ctx.emulator, currentMapState, score, movementCount, 0, ctx.includeRegisters))
      break
    }

    if (runResult.stopReason === 'timeout') {
      failureReason = formatTimeoutError(
        'No movement command observed',
        EMULATOR_RUN_TIMEOUT_MS,
        `addr=0x${MEMORY_CONFIG.DATA_BASE.toString(16)}, expect=1/2/3/4`
      )
      errors.push(failureReason)
      recordedMovementCount = movementCount
      frames.push(await captureFrame(
        ctx.emulator,
        currentMapState,
        score,
        movementCount,
        0,
        ctx.includeRegisters,
        runResult.memEvent,
        runResult.stopReason
      ))
      break
    }

    if (runResult.stopReason === 'end-of-code' || runResult.stopReason === 'unknown') {
      recordedMovementCount = movementCount
      frames.push(await captureFrame(
        ctx.emulator,
        currentMapState,
        score,
        movementCount,
        0,
        ctx.includeRegisters,
        runResult.memEvent,
        runResult.stopReason
      ))
      break
    }

    const nextAction = runResult.memEvent?.value ?? 0
    const dotsBeforeMove = countDots(previousMapState)

    movementCount += 1

    if (nextAction >= 1 && nextAction <= 4) {
      currentMapState = updateMapWithMovementAndGhosts(currentMapState, nextAction)
    } else {
      currentMapState = updateGhostsOnly(currentMapState)
    }

    const dotsAfterMove = countDots(currentMapState)
    const dotsEaten = Math.max(0, dotsBeforeMove - dotsAfterMove)

    let scoreDelta = -TURN_PENALTY
    if (dotsEaten > 0) {
      scoreDelta += dotsEaten * DOT_REWARD
    }

    const ghostCaughtThisTurn = Boolean(currentMapState.gameOver && !previousMapState.gameOver)
    if (ghostCaughtThisTurn) {
      scoreDelta -= GHOST_PENALTY
    }

    victoryAchieved = checkVictoryCondition(currentMapState)
    if (victoryAchieved && !levelCompletionAwarded) {
      scoreDelta += VICTORY_BONUS
      levelCompletionAwarded = true
    }

    score = applyScoreDelta(score, scoreDelta)

    const prevPlayer = previousMapState.playerPosition
    const currentPlayer = currentMapState.playerPosition
    const playerMoved = prevPlayer && currentPlayer
      ? prevPlayer.row !== currentPlayer.row || prevPlayer.col !== currentPlayer.col
      : true

    stagnantSteps = playerMoved ? 0 : stagnantSteps + 1

    if (stagnantSteps >= 10) {
      failureReason = 'GAMEPLAY_ERROR: PacMan has not moved for 10 consecutive steps'
      errors.push(failureReason)
      recordedMovementCount = movementCount
      frames.push(await captureFrame(
        ctx.emulator,
        currentMapState,
        score,
        movementCount,
        nextAction,
        ctx.includeRegisters,
        runResult.memEvent,
        runResult.stopReason
      ))
      break
    }

    if (currentMapState.gameOver) {
      failureReason = 'Game Over: Collision with ghost!'
      errors.push(failureReason)
      recordedMovementCount = movementCount
      frames.push(await captureFrame(
        ctx.emulator,
        currentMapState,
        score,
        movementCount,
        nextAction,
        ctx.includeRegisters,
        runResult.memEvent,
        runResult.stopReason
      ))
      break
    }

    try {
      const writeSuccess = await writeMapUpdatesToMemory(ctx.emulator, previousMapState, currentMapState)
      if (!writeSuccess) {
        failureReason = formatMemoryError(
          'Post-move update failed while writing map diffs or refreshing state'
        )
        errors.push(failureReason)
        recordedMovementCount = movementCount
        frames.push(await captureFrame(
          ctx.emulator,
          currentMapState,
          score,
          movementCount,
          nextAction,
          ctx.includeRegisters,
          runResult.memEvent,
          runResult.stopReason
        ))
        break
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : undefined
      failureReason = formatMemoryError(
        'Post-move update failed while writing map diffs or refreshing state',
        detail
      )
      errors.push(failureReason)
      recordedMovementCount = movementCount
      frames.push(await captureFrame(
        ctx.emulator,
        currentMapState,
        score,
        movementCount,
        nextAction,
        ctx.includeRegisters,
        runResult.memEvent,
        runResult.stopReason
      ))
      break
    }

    recordedMovementCount = movementCount
    previousMapState = cloneGameMap(currentMapState)

    frames.push(await captureFrame(
      ctx.emulator,
      currentMapState,
      score,
      movementCount,
      nextAction,
      ctx.includeRegisters,
      runResult.memEvent,
      runResult.stopReason
    ))

    if (victoryAchieved) {
      break
    }
  }

  const success = victoryAchieved && !failureReason

  return {
    attempt: ctx.attemptIndex + 1,
    success,
    victory: victoryAchieved,
    score,
    steps: recordedMovementCount,
    frames,
    failureReason,
    errors
  }
}

function summarize(levelId: string, attempts: GameAttemptResult[]): GameValidationSummary {
  const rule = LEVEL_RULES[levelId] ?? { attempts: 1, mode: 'single-pass' }

  if (rule.mode === 'single-pass') {
    const firstAttempt = attempts[0]
    return {
      pass: Boolean(firstAttempt?.success),
      reason: firstAttempt?.success ? undefined : firstAttempt?.failureReason,
      metrics: {
        success: firstAttempt?.success ?? false,
        score: firstAttempt?.score ?? 0,
        steps: firstAttempt?.steps ?? 0
      }
    }
  }

  if (rule.mode === 'all-pass') {
    const failedAttempt = attempts.find(attempt => !attempt.success)
    const pass = !failedAttempt

    return {
      pass,
      reason: pass ? undefined : (failedAttempt?.failureReason ?? 'Attempt failed'),
      metrics: {
        success: pass,
        attempts: attempts.length,
        failures: pass ? 0 : attempts.filter(attempt => !attempt.success).length
      }
    }
  }

  if (rule.mode === 'win-rate') {
    const wins = attempts.filter(attempt => attempt.success).length
    const total = attempts.length
    const winRate = total === 0 ? 0 : wins / total
    const threshold = rule.threshold ?? 0.6
    return {
      pass: winRate >= threshold,
      reason: winRate >= threshold ? undefined : `Win rate ${winRate.toFixed(2)} below threshold ${threshold}`,
      metrics: {
        wins,
        attempts: total,
        winRate
      }
    }
  }

  const averageScore = attempts.length === 0
    ? 0
    : attempts.reduce((sum, attempt) => sum + attempt.score, 0) / attempts.length
  const threshold = rule.threshold ?? 0
  return {
    pass: averageScore >= threshold,
    reason: averageScore >= threshold ? undefined : `Average score ${averageScore.toFixed(2)} below threshold ${threshold}`,
    metrics: {
      attempts: attempts.length,
      averageScore
    }
  }
}

export async function validateGame(options: GameValidationOptions): Promise<GameValidationResult> {
  const { sourceCode, levelId, architecture } = options
  const map = getMap(levelId)
  if (!map) {
    throw new Error(`Unknown level id: ${levelId}`)
  }

  const rule = LEVEL_RULES[levelId] ?? { attempts: 1, mode: 'single-pass' }
  const attemptsToRun = options.attemptsOverride ?? rule.attempts
  const maxSteps = options.maxSteps ?? 300

  const emulator = new NodeEmulator()
  const initialMap = cloneGameMap(map)
  const { machineCode } = await initializeEmulatorWithCode(
    emulator,
    sourceCode,
    initialMap,
    architecture
  )

  const attempts: GameAttemptResult[] = []
  for (let attemptIndex = 0; attemptIndex < attemptsToRun; attemptIndex++) {
    if (rule.mode === 'all-pass' && attempts.some(attempt => !attempt.success)) {
      break
    }
    try {
      const attemptResult = await runAttempt(
        {
          emulator,
          machineCode,
          architecture,
          maxSteps,
          attemptIndex,
          includeRegisters: options.includeRegisters ?? false
        },
        cloneGameMap(map)
      )
      attempts.push(attemptResult)

      if (rule.mode === 'all-pass' && !attemptResult.success) {
        break
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      attempts.push({
        attempt: attemptIndex + 1,
        success: false,
        victory: false,
        score: 0,
        steps: 0,
        frames: [],
        failureReason: message,
        errors: [message]
      })
      try {
        await resetEmulatorWithMemory(emulator)
        await emulator.loadCode(machineCode)
        await writeCompleteMapToMemory(emulator, cloneGameMap(map), architecture)
      } catch {}

      if (rule.mode === 'all-pass') {
        break
      }
    }
  }

  await emulator.close()

  const summary = summarize(levelId, attempts)

  return {
    levelId,
    architecture,
    attempts,
    summary
  }
}
