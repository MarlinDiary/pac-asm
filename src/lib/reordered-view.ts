import { GASAssembler, GASTarget } from './assembler'

export interface ReorderedMappingEntry {
  address: number
  lineNumber: number
  instruction: string
  sourceContent?: string
  originalLineNumbers: number[]
}

export interface ReorderedDebugView {
  transformedSource: string
  mappings: ReorderedMappingEntry[]
}

interface ReorderedViewOptions {
  target: GASTarget
  baseAddress: number
}

export async function generateReorderedDebugView(
  sourceCode: string,
  { target, baseAddress }: ReorderedViewOptions
): Promise<ReorderedDebugView> {
  const assembler = new GASAssembler({ target, baseAddress })

  await assembler.initialize()

  try {
    const { objectFile } = await assembler.assemble(sourceCode)
    const dwarfMappings = await assembler.getLineMappingInfo(sourceCode)

    const originalLinesByAddress = new Map<number, Set<number>>()
    dwarfMappings.forEach((entry) => {
      if (!originalLinesByAddress.has(entry.address)) {
        originalLinesByAddress.set(entry.address, new Set<number>())
      }
      originalLinesByAddress.get(entry.address)!.add(entry.lineNumber)
    })

    const binutilsLoader = await import('@binutils-wasm/binutils')
    const objdump = await binutilsLoader.default('objdump')

    const runObjdump = async (args: string[]): Promise<string> => {
      let stdout = ''

      await (objdump as CallableFunction)({
        arguments: [...args, 'a.o'],
        preRun: [
          (module: unknown) => {
            ;(module as { FS: { writeFile: (name: string, data: Uint8Array) => void } }).FS.writeFile('a.o', objectFile)
          }
        ],
        print: (text: string) => {
          stdout += text + '\n'
        },
        printErr: () => {}
      })

      return stdout
    }

    const disassembly = await runObjdump(['-dr', '--insn-width=8'])

    const outputLines: string[] = []
    const mappings: ReorderedMappingEntry[] = []

    for (const rawLine of disassembly.split('\n')) {
      const sanitized = rawLine.replace(/\t+/g, ' ').trimEnd()
      const trimmed = sanitized.trimStart()

      if (!trimmed || trimmed.startsWith('Disassembly of section')) {
        continue
      }

      if (trimmed.endsWith(':')) {
        const labelMatch = trimmed.match(/^([0-9a-f]+)\s+<([^>]+)>:$/i)
        if (labelMatch) {
          const label = labelMatch[2]
          const normalizedLabel = label.trim()
          if (!normalizedLabel || normalizedLabel === '.text' || normalizedLabel === 'text') {
            continue
          }
          if (outputLines.length > 0 && outputLines[outputLines.length - 1] !== '') {
            outputLines.push('')
          }
          outputLines.push(`${normalizedLabel}:`)
        }
        continue
      }

      const instructionMatch = trimmed.match(/^([0-9a-f]+):\s+([0-9a-f]{2,})\s+(.*)$/i)
      if (!instructionMatch) {
        continue
      }

      const offset = parseInt(instructionMatch[1], 16)
      const instructionText = instructionMatch[3].trim()
      const absoluteAddress = baseAddress + offset
      const originalLineSet = originalLinesByAddress.get(absoluteAddress)
      const originalLineNumbers = originalLineSet ? Array.from(originalLineSet).sort((a, b) => a - b) : []
      outputLines.push(instructionText)
      const currentLineNumber = outputLines.length

      mappings.push({
        address: absoluteAddress,
        lineNumber: currentLineNumber,
        instruction: instructionText.split(/\s+/)[0] || 'unknown',
        sourceContent: instructionText,
        originalLineNumbers
      })
    }

    return {
      transformedSource: outputLines.join('\n'),
      mappings
    }
  } finally {
    assembler.destroy()
  }
}
