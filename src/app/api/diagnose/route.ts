import { streamText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { NextRequest } from 'next/server'

// Initialize OpenAI with API key from environment
const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY || ''
})

export async function POST(req: NextRequest) {
  try {
    const { error, code } = await req.json()

    const prompt = `You are a helpful and professional assembly programming assistant. Be respectful, patient, and constructive in your responses.
They got this error: ${error}
Their code: ${code}

Important context: Memory at address 0x00030000 and onwards is writable data memory. Students can store values there using STR instructions. This is where they should write movement commands. Writing the same value multiple times to 0x00030000 is perfectly valid - it means executing the same movement multiple times.

Respond with 2-3 concise sentences providing objective guidance on how to fix the issue. Focus on the specific problem and give clear, actionable advice. Do not include code examples or use bullet points. Be encouraging and supportive while maintaining professional language.`

    const result = streamText({
      model: openai.responses('gpt-5-nano'),
      prompt,
      temperature: 0.7,
      providerOptions: {
        openai: {
          reasoningEffort: 'low',
          textVerbosity: 'low'
        }
      }
    })

    return result.toTextStreamResponse()
  } catch {
    // Silently handle API error
    return new Response('SERVICE_ERROR: Failed to Generate Diagnosis', { status: 500 })
  }
}
