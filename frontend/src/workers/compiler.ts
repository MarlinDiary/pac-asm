import { createHighlighter } from '../lib/highlighter'
import type { AssemblerOptions } from '../lib/assembler'
import type { CompiledProgram } from '../lib/compiler-client'

self.onmessage = async (event: MessageEvent<{ sourceCode: string; options: AssemblerOptions }>) => {
  const { sourceCode, options } = event.data
  try {
    const highlighter = createHighlighter(options)
    const machineCode = await highlighter.initialize(sourceCode)
    const result: CompiledProgram = { machineCode, mappings: highlighter.getAllMappings() }
    self.postMessage(result)
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) })
  }
}
