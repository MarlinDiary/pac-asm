'use client'

import { Editor } from '@monaco-editor/react'
import { useRef, useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { useSettings } from '@/hooks/useSettings'

interface CodeEditorProps {
  value?: string
  onChange?: (value: string | undefined) => void
  height?: string | number
  width?: string | number
  disabled?: boolean
  className?: string
  highlightedLine?: number
}

export default function CodeEditor({
  value = '',
  onChange,
  height = '100%',
  width = '100%',
  disabled = false,
  className = '',
  highlightedLine
}: CodeEditorProps) {
  const editorRef = useRef<import('monaco-editor').editor.IStandaloneCodeEditor | null>(null)
  const decorationsRef = useRef<string[]>([])
  const monacoRef = useRef<typeof import('monaco-editor') | null>(null)
  const { theme, systemTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [editorReady, setEditorReady] = useState(false)
  const { settings } = useSettings()

  // Ensure languages and token providers are registered before editor mounts
  function handleEditorWillMount(monaco: typeof import('monaco-editor')) {
    // ARM language
    if (!monaco.languages.getLanguages().some((l) => l.id === 'assembly-arm')) {
      monaco.languages.register({ id: 'assembly-arm' })
      monaco.languages.setMonarchTokensProvider('assembly-arm', {
        ignoreCase: true,
        tokenizer: {
          root: [
            [/\b0x[0-9a-fA-F]+\b/, 'number.hex'],[/\b0b[01]+\b/, 'number.binary'],[/#-?[0-9]+\b/, 'number'],[/\b[0-9]+\b/, 'number'],
            [/;.*$/, 'comment'],[/#.*$/, 'comment'],[/\/\/.*$/, 'comment'],[/@.*$/, 'comment'],
            [/\b([rR][0-9]|[rR]1[0-5]|[sS][pP]|[lL][rR]|[pP][cC]|[cC][pP][sS][rR])\b/, 'variable.predefined'],
            [/^\s*\.(globl|global|text|data|bss|section|type|extern|align|balign|p2align|word|hword|half|byte|space|ascii|asciz|set|macro|endm|equ|include|file|size|loc)\b/i, 'keyword'],
            [/\b(MOV|MOVS?|MVN|MVNS?|LDR|LDRB?|LDRH?|LDRSB?|LDRSH?|STR|STRB?|STRH?|LDM|LDMIA|LDMIB|LDMDA|LDMDB|STM|STMIA|STMIB|STMDA|STMDB|PUSH|POP|ADD|ADDS?|ADC|ADCS?|SUB|SUBS?|SBC|SBCS?|RSB|RSBS?|RSC|RSCS?|MUL|MULS?|MLA|MLAS?|UMULL|UMULLS?|UMLAL|UMLALS?|SMULL|SMULLS?|SMLAL|SMLALS?|AND|ANDS?|ORR|ORRS?|EOR|EORS?|BIC|BICS?|CMP|CMN|TST|TEQ|LSL|LSLS?|LSR|LSRS?|ASR|ASRS?|ROR|RORS?|RRX|RRXS?|B|BL|BX|BLX|BEQ|BNE|BCS|BCC|BMI|BPL|BVS|BVC|BHI|BLS|BGE|BLT|BGT|BLE|BAL|NOP|SWI|ADR|ADRL)(EQ|NE|CS|CC|MI|PL|VS|VC|HI|LS|GE|LT|GT|LE|AL|HS|LO)?S?\b/i, 'keyword'],
            [/^[a-zA-Z_][a-zA-Z0-9_]*:/, 'type'],
            [/\[[^\]]+\]/, 'string.regexp'],
            [/\"([^\"\\]|\\.)*$/, 'string.invalid'],[/\"/, 'string', '@string'],[/'([^'\\]|\\.)*$/, 'string.invalid'],[/'/, 'string', '@sstring'],
            [/\b[a-zA-Z_][a-zA-Z0-9_]*\b/, 'identifier']
          ],
          string: [[/[^\\\"]+/, 'string'],[/\\./, 'string.escape'],[/\"/, 'string', '@pop']],
          sstring: [[/[^\\']+/, 'string'],[/\\./, 'string.escape'],[/'/, 'string', '@pop']]
        }
      })
    }

    // MIPS language
    if (!monaco.languages.getLanguages().some((l) => l.id === 'assembly-mips')) {
      monaco.languages.register({ id: 'assembly-mips' })
      monaco.languages.setMonarchTokensProvider('assembly-mips', {
        ignoreCase: true,
        tokenizer: {
          root: [
            [/\b0x[0-9a-fA-F]+\b/, 'number.hex'],[/\b0b[01]+\b/, 'number.binary'],[/#-?[0-9]+\b/, 'number'],[/\b[0-9]+\b/, 'number'],
            [/;.*$/, 'comment'],[/#.*$/, 'comment'],[/\/\/.*$/, 'comment'],[/@.*$/, 'comment'],
            [/\$?(zero|at|v[01]|a[0-3]|t[0-9]|s[0-7]|k[01]|gp|sp|fp|s8|ra|hi|lo|f(?:[0-9]|[12][0-9]|3[01]))\b/i, 'variable.predefined'],
            [/^\s*\.(globl|global|text|data|bss|section|type|ent|end|extern|align|balign|p2align|word|hword|half|byte|space|ascii|asciz|option|set|macro|endm|equ|include|file|size|loc|frame|mask|fmask|cpload|cprestore|comm|lcomm|end|endr|rept|irpc|if|else|elseif|endif|altmacro|noreorder|reorder)\b/i, 'keyword'],
            [/\b(ADD(U)?|ADDI(U)?|SUB(U)?|AND(I)?|OR(I)?|XOR(I)?|NOR|NOT|NEG(U)?|SLT(I|IU)?|SLTU|SLL(V)?|SRL(V)?|SRA(V)?|ROTR(V)?|LW|SW|LB|LBU|LH|LHU|SB|SH|LUI|LWL|LWR|SWL|SWR|LL|SC|BEQ|BNE|BLEZ|BGTZ|BLTZ|BGEZ|BEQL|BNEL|BLEZL|BGTZL|BLTZL|BGEZL|BLTZAL|BGEZAL|BLTZALL|BGEZALL|BEQZ|BNEZ|BAL|B|J|JAL|JR|JALR|MFHI|MFLO|MTHI|MTLO|MULT(U)?|DIV(U)?|MUL|MOVN|MOVZ|MOVE|LI|LA|NOP|MFC0|MTC0|ERET|CACHE|PREF|SYNC|SYSCALL|BREAK|EXT|INS|SEB|SEH|CLO|CLZ|MADD|MADDU|MSUB|MSUBU)\b/i, 'keyword'],
            [/\b-?[0-9]+\s*\([^)]+\)/, 'string.regexp'],
            [/^[a-zA-Z_][a-zA-Z0-9_]*:/, 'type'],
            [/\"([^\"\\]|\\.)*$/, 'string.invalid'],[/\"/, 'string', '@string'],[/'([^'\\]|\\.)*$/, 'string.invalid'],[/'/, 'string', '@sstring'],
            [/\b[a-zA-Z_][a-zA-Z0-9_]*\b/, 'identifier']
          ],
          string: [[/[^\\\"]+/, 'string'],[/\\./, 'string.escape'],[/\"/, 'string', '@pop']],
          sstring: [[/[^\\']+/, 'string'],[/\\./, 'string.escape'],[/'/, 'string', '@pop']]
        }
      })
    }
  }

  useEffect(() => {
    setMounted(true)
  }, [])

  function handleEditorDidMount(
    editor: import('monaco-editor').editor.IStandaloneCodeEditor, 
    monaco: typeof import('monaco-editor')
  ) {
    editorRef.current = editor
    monacoRef.current = monaco

    // Register assembly language if not already registered
    if (!monaco.languages.getLanguages().some((lang: { id: string }) => lang.id === 'assembly')) {
      monaco.languages.register({ id: 'assembly' })

      // Define assembly language syntax highlighting
      monaco.languages.setMonarchTokensProvider('assembly', {
        keywords: [
          // Data movement instructions
          'MOV', 'MOVS', 'MVN', 'MVNS', 'LDR', 'LDRB', 'LDRH', 'LDRSB', 'LDRSH',
          'STR', 'STRB', 'STRH', 'LDM', 'LDMIA', 'LDMIB', 'LDMDA', 'LDMDB',
          'STM', 'STMIA', 'STMIB', 'STMDA', 'STMDB', 'PUSH', 'POP',
          // Arithmetic instructions
          'ADD', 'ADDS', 'ADC', 'ADCS', 'SUB', 'SUBS', 'SBC', 'SBCS', 'RSB', 'RSBS',
          'RSC', 'RSCS', 'MUL', 'MULS', 'MLA', 'MLAS', 'UMULL', 'UMULLS', 'UMLAL', 'UMLALS',
          'SMULL', 'SMULLS', 'SMLAL', 'SMLALS',
          // Logical instructions
          'AND', 'ANDS', 'ORR', 'ORRS', 'EOR', 'EORS', 'BIC', 'BICS',
          // Comparison instructions
          'CMP', 'CMN', 'TST', 'TEQ',
          // Shift instructions
          'LSL', 'LSLS', 'LSR', 'LSRS', 'ASR', 'ASRS', 'ROR', 'RORS', 'RRX', 'RRXS',
          // Branch instructions
          'B', 'BL', 'BX', 'BLX', 'BEQ', 'BNE', 'BCS', 'BCC', 'BMI', 'BPL', 'BVS', 'BVC',
          'BHI', 'BLS', 'BGE', 'BLT', 'BGT', 'BLE', 'BAL',
          // Other instructions
          'NOP', 'SWI', 'ADR', 'ADRL',
          // Lowercase versions
          'mov', 'movs', 'mvn', 'mvns', 'ldr', 'ldrb', 'ldrh', 'ldrsb', 'ldrsh',
          'str', 'strb', 'strh', 'ldm', 'ldmia', 'ldmib', 'ldmda', 'ldmdb',
          'stm', 'stmia', 'stmib', 'stmda', 'stmdb', 'push', 'pop',
          'add', 'adds', 'adc', 'adcs', 'sub', 'subs', 'sbc', 'sbcs', 'rsb', 'rsbs',
          'rsc', 'rscs', 'mul', 'muls', 'mla', 'mlas', 'umull', 'umulls', 'umlal', 'umlals',
          'smull', 'smulls', 'smlal', 'smlals',
          'and', 'ands', 'orr', 'orrs', 'eor', 'eors', 'bic', 'bics',
          'cmp', 'cmn', 'tst', 'teq',
          'lsl', 'lsls', 'lsr', 'lsrs', 'asr', 'asrs', 'ror', 'rors', 'rrx', 'rrxs',
          'b', 'bl', 'bx', 'blx', 'beq', 'bne', 'bcs', 'bcc', 'bmi', 'bpl', 'bvs', 'bvc',
          'bhi', 'bls', 'bge', 'blt', 'bgt', 'ble', 'bal',
          'nop', 'swi', 'adr', 'adrl',
          // MIPS core + extended set (uppercase)
          'ADD','ADDU','ADDI','ADDIU','SUB','SUBU','AND','ANDI','OR','ORI','XOR','XORI','NOR','NOT','NEG','NEGU',
          'SLT','SLTI','SLTU','SLTIU','SLL','SRL','SRA','SLLV','SRLV','SRAV','ROTR','ROTRV',
          'LW','SW','LB','LBU','LH','LHU','SB','SH','LUI','LWL','LWR','SWL','SWR','LL','SC',
          'BEQ','BNE','BLEZ','BGTZ','BLTZ','BGEZ','BEQL','BNEL','BLEZL','BGTZL',
          'BLTZL','BGEZL','BLTZAL','BGEZAL','BLTZALL','BGEZALL','BEQZ','BNEZ','BAL',
          'J','JAL','JR','JALR','MFHI','MFLO','MTHI','MTLO','MULT','MULTU','DIV','DIVU','MUL','MOVN','MOVZ','MOVE','LI','LA',
          'MFC0','MTC0','ERET','CACHE','PREF','SYNC','SYSCALL','BREAK',
          'EXT','INS','SEB','SEH','CLO','CLZ','MADD','MADDU','MSUB','MSUBU',
          // MIPS core + extended set (lowercase)
          'add','addu','addi','addiu','sub','subu','and','andi','or','ori','xor','xori','nor','not','neg','negu',
          'slt','slti','sltu','sltiu','sll','srl','sra','sllv','srlv','srav','rotr','rotrv',
          'lw','sw','lb','lbu','lh','lhu','sb','sh','lui','lwl','lwr','swl','swr','ll','sc',
          'beq','bne','blez','bgtz','bltz','bgez','beql','bnel','blezl','bgtzl',
          'bltzl','bgezl','bltzal','bgezal','bltzall','bgezall','beqz','bnez','bal',
          'j','jal','jr','jalr','mfhi','mflo','mthi','mtlo','mult','multu','div','divu','mul','movn','movz','move','li','la',
          'mfc0','mtc0','eret','cache','pref','sync','syscall','break',
          'ext','ins','seb','seh','clo','clz','madd','maddu','msub','msubu'
        ],
        tokenizer: {
          root: [
            // Numbers (before comments to catch #4, #1, etc.)
            [/\b0x[0-9a-fA-F]+\b/, 'number.hex'],
            [/\b0b[01]+\b/, 'number.binary'],
            [/#-?[0-9]+\b/, 'number'],
            [/\b[0-9]+\b/, 'number'],
            
            // Comments
            [/;.*$/, 'comment'],
            [/#.*$/, 'comment'],
            [/\/\/.*$/, 'comment'],
            [/@.*$/, 'comment'],
            
            // MIPS registers (e.g., $t0, $a1, $sp, $ra, $zero, $hi, $lo)
            [/\$(zero|at|v[01]|a[0-3]|t[0-9]|s[0-7]|k[01]|gp|sp|fp|ra|hi|lo)\b/i, 'variable.predefined'],

            // Assembler directives (ARM/MIPS common)
            [/^\s*\.(globl|global|text|data|bss|section|type|ent|end|extern|align|balign|p2align|word|hword|half|byte|space|ascii|asciz|option|set|macro|endm|equ|include|file|size|loc)\b/i, 'keyword'],

            // Labels
            [/^[a-zA-Z_][a-zA-Z0-9_]*:/, 'type'],
            
            // Memory references
            [/\[[^\]]+\]/, 'string.regexp'],
            // MIPS offset(base) addressing
            [/\b-?[0-9]+\s*\([^)]+\)/, 'string.regexp'],
            
            // Strings
            [/"([^"\\]|\\.)*$/, 'string.invalid'],
            [/"/, 'string', '@string'],
            [/'([^'\\]|\\.)*$/, 'string.invalid'],
            [/'/, 'string', '@string_single'],
            
            // ARM registers (before instructions to be more specific)
            [/\b([rR][0-9]|[rR]1[0-5]|[sS][pP]|[lL][rR]|[pP][cC]|[cC][pP][sS][rR])\b/, 'variable.predefined'],
            // MIPS registers (with or without $)
            [/\$?(zero|at|v[01]|a[0-3]|t[0-9]|s[0-7]|k[01]|gp|sp|fp|s8|ra)\b/i, 'variable.predefined'],
            
            // ARM instructions - match base instruction + optional condition codes + optional S suffix
            // This pattern matches: MOV, MOVEQ, MOVS, MOVEQS, RSBMI, TSTNE, etc.
            [/\b(MOV|MOVS?|MVN|MVNS?|LDR|LDRB?|LDRH?|LDRSB?|LDRSH?|STR|STRB?|STRH?|LDM|LDMIA|LDMIB|LDMDA|LDMDB|STM|STMIA|STMIB|STMDA|STMDB|PUSH|POP|ADD|ADDS?|ADC|ADCS?|SUB|SUBS?|SBC|SBCS?|RSB|RSBS?|RSC|RSCS?|MUL|MULS?|MLA|MLAS?|UMULL|UMULLS?|UMLAL|UMLALS?|SMULL|SMULLS?|SMLAL|SMLALS?|AND|ANDS?|ORR|ORRS?|EOR|EORS?|BIC|BICS?|CMP|CMN|TST|TEQ|LSL|LSLS?|LSR|LSRS?|ASR|ASRS?|ROR|RORS?|RRX|RRXS?|B|BL|BX|BLX|BEQ|BNE|BCS|BCC|BMI|BPL|BVS|BVC|BHI|BLS|BGE|BLT|BGT|BLE|BAL|NOP|SWI|ADR|ADRL)(EQ|NE|CS|CC|MI|PL|VS|VC|HI|LS|GE|LT|GT|LE|AL|HS|LO)?S?\b/i, 'keyword'],
            // MIPS instructions
            [/\b(ADD(U)?|ADDI(U)?|SUB(U)?|AND(I)?|OR(I)?|XOR(I)?|SLT(I|IU)?|SLTU|SLL(V)?|SRL(V)?|SRA(V)?|LW|SW|LB|LBU|LH|LHU|SB|SH|LUI|BEQ|BNE|BLEZ|BGTZ|BLTZ|BGEZ|J|JAL|JR|JALR|MFHI|MFLO|MTHI|MTLO|MULT(U)?|DIV(U)?|NOP|MOVE)\b/i, 'keyword'],
            
            // Identifiers (last to avoid conflicts)
            [/[a-zA-Z_][a-zA-Z0-9_]*/, 'identifier'],
          ],
          
          string: [
            [/[^\\"]+/, 'string'],
            [/\\./, 'string.escape.invalid'],
            [/"/, 'string', '@pop']
          ],
          
          string_single: [
            [/[^\\']+/, 'string'],
            [/\\./, 'string.escape.invalid'],
            [/'/, 'string', '@pop']
          ]
        }
      })

      // Set language configuration
      monaco.languages.setLanguageConfiguration('assembly', {
        comments: {
          lineComment: '@'
        },
        brackets: [
          ['[', ']'],
          ['(', ')']
        ],
        autoClosingPairs: [
          { open: '[', close: ']' },
          { open: '(', close: ')' },
          { open: '"', close: '"' },
          { open: "'", close: "'" }
        ],
        surroundingPairs: [
          { open: '[', close: ']' },
          { open: '(', close: ')' },
          { open: '"', close: '"' },
          { open: "'", close: "'" }
        ]
      })
    }

    // Also register split languages for per-arch accuracy
    if (!monaco.languages.getLanguages().some((l) => l.id === 'assembly-arm')) {
      monaco.languages.register({ id: 'assembly-arm' })
      monaco.languages.setMonarchTokensProvider('assembly-arm', {
        ignoreCase: true,
        tokenizer: {
          root: [
            [/\b0x[0-9a-fA-F]+\b/, 'number.hex'],[/\b0b[01]+\b/, 'number.binary'],[/#-?[0-9]+\b/, 'number'],[/\b[0-9]+\b/, 'number'],
            [/;.*$/, 'comment'],[/#.*$/, 'comment'],[/\/\/.*$/, 'comment'],[/@.*$/, 'comment'],
            // ARM registers
            [/\b([rR][0-9]|[rR]1[0-5]|[sS][pP]|[lL][rR]|[pP][cC]|[cC][pP][sS][rR])\b/, 'variable.predefined'],
            // directives
            [/^\s*\.(globl|global|text|data|bss|section|type|extern|align|balign|p2align|word|hword|half|byte|space|ascii|asciz|set|macro|endm|equ|include|file|size|loc)\b/i, 'keyword'],
            // ARM instruction + cond + optional S
            [/\b(MOV|MOVS?|MVN|MVNS?|LDR|LDRB?|LDRH?|LDRSB?|LDRSH?|STR|STRB?|STRH?|LDM|LDMIA|LDMIB|LDMDA|LDMDB|STM|STMIA|STMIB|STMDA|STMDB|PUSH|POP|ADD|ADDS?|ADC|ADCS?|SUB|SUBS?|SBC|SBCS?|RSB|RSBS?|RSC|RSCS?|MUL|MULS?|MLA|MLAS?|UMULL|UMULLS?|UMLAL|UMLALS?|SMULL|SMULLS?|SMLAL|SMLALS?|AND|ANDS?|ORR|ORRS?|EOR|EORS?|BIC|BICS?|CMP|CMN|TST|TEQ|LSL|LSLS?|LSR|LSRS?|ASR|ASRS?|ROR|RORS?|RRX|RRXS?|B|BL|BX|BLX|BEQ|BNE|BCS|BCC|BMI|BPL|BVS|BVC|BHI|BLS|BGE|BLT|BGT|BLE|BAL|NOP|SWI|ADR|ADRL)(EQ|NE|CS|CC|MI|PL|VS|VC|HI|LS|GE|LT|GT|LE|AL|HS|LO)?S?\b/i, 'keyword'],
            // labels
            [/^[a-zA-Z_][a-zA-Z0-9_]*:/, 'type'],
            // memory
            [/\[[^\]]+\]/, 'string.regexp'],
            // strings
            [/\"([^\"\\]|\\.)*$/, 'string.invalid'],[/\"/, 'string', '@string'],[/'([^'\\]|\\.)*$/, 'string.invalid'],[/'/, 'string', '@sstring'],
            // identifiers
            [/\b[a-zA-Z_][a-zA-Z0-9_]*\b/, 'identifier']
          ],
          string: [[/[^\\\"]+/, 'string'],[/\\./, 'string.escape'],[/\"/, 'string', '@pop']],
          sstring: [[/[^\\']+/, 'string'],[/\\./, 'string.escape'],[/'/, 'string', '@pop']]
        }
      })
    }

    if (!monaco.languages.getLanguages().some((l) => l.id === 'assembly-mips')) {
      monaco.languages.register({ id: 'assembly-mips' })
      monaco.languages.setMonarchTokensProvider('assembly-mips', {
        ignoreCase: true,
        tokenizer: {
          root: [
            [/\b0x[0-9a-fA-F]+\b/, 'number.hex'],[/\b0b[01]+\b/, 'number.binary'],[/#-?[0-9]+\b/, 'number'],[/\b[0-9]+\b/, 'number'],
            [/;.*$/, 'comment'],[/#.*$/, 'comment'],[/\/\/.*$/, 'comment'],[/@.*$/, 'comment'],
            // MIPS registers (GPR/FPR/HI/LO)
            [/\$?(zero|at|v[01]|a[0-3]|t[0-9]|s[0-7]|k[01]|gp|sp|fp|s8|ra|hi|lo|f(?:[0-9]|[12][0-9]|3[01]))\b/i, 'variable.predefined'],
            // directives (extended)
            [/^\s*\.(globl|global|text|data|bss|section|type|ent|end|extern|align|balign|p2align|word|hword|half|byte|space|ascii|asciz|option|set|macro|endm|equ|include|file|size|loc|frame|mask|fmask|cpload|cprestore|comm|lcomm|end|endr|rept|irpc|if|else|elseif|endif|altmacro|noreorder|reorder)\b/i, 'keyword'],
            // MIPS instructions incl. likely + pseudo (case-insensitive)
            [/\b(ADD(U)?|ADDI(U)?|SUB(U)?|AND(I)?|OR(I)?|XOR(I)?|NOR|NOT|NEG(U)?|SLT(I|IU)?|SLTU|SLL(V)?|SRL(V)?|SRA(V)?|ROTR(V)?|LW|SW|LB|LBU|LH|LHU|SB|SH|LUI|LWL|LWR|SWL|SWR|LL|SC|BEQ|BNE|BLEZ|BGTZ|BLTZ|BGEZ|BEQL|BNEL|BLEZL|BGTZL|BLTZL|BGEZL|BLTZAL|BGEZAL|BLTZALL|BGEZALL|BEQZ|BNEZ|BAL|B|J|JAL|JR|JALR|MFHI|MFLO|MTHI|MTLO|MULT(U)?|DIV(U)?|MUL|MOVN|MOVZ|MOVE|LI|LA|NOP|MFC0|MTC0|ERET|CACHE|PREF|SYNC|SYSCALL|BREAK|EXT|INS|SEB|SEH|CLO|CLZ|MADD|MADDU|MSUB|MSUBU)\b/i, 'keyword'],
            // addressing offset(base)
            [/\b-?[0-9]+\s*\([^)]+\)/, 'string.regexp'],
            // labels
            [/^[a-zA-Z_][a-zA-Z0-9_]*:/, 'type'],
            // strings
            [/\"([^\"\\]|\\.)*$/, 'string.invalid'],[/\"/, 'string', '@string'],[/'([^'\\]|\\.)*$/, 'string.invalid'],[/'/, 'string', '@sstring'],
            // identifiers
            [/\b[a-zA-Z_][a-zA-Z0-9_]*\b/, 'identifier']
          ],
          string: [[/[^\\\"]+/, 'string'],[/\\./, 'string.escape'],[/\"/, 'string', '@pop']],
          sstring: [[/[^\\']+/, 'string'],[/\\./, 'string.escape'],[/'/, 'string', '@pop']]
        }
      })
    }

    // Define light theme
    monaco.editor.defineTheme('custom-assembly-light', {
      base: 'vs',
      inherit: false,
      rules: [
        // Default text - black
        { token: '', foreground: '000000' },
        
        // Comments - #647182
        { token: 'comment', foreground: '647182' },
        
        // Strings - #003d99
        { token: 'string', foreground: '003d99' },
        { token: 'string.invalid', foreground: '003d99' },
        { token: 'string.escape.invalid', foreground: '003d99' },
        { token: 'string.regexp', foreground: '003d99' },
        
        // Keywords (ARM instructions) - #df0c24
        { token: 'keyword', foreground: 'df0c24' },
        
        // Functions/Labels - #894ceb
        { token: 'type', foreground: '894ceb' },
        
        // Variables (ARM registers) - #a24610
        { token: 'variable.predefined', foreground: 'a24610' },
        { token: 'identifier', foreground: '000000' },
        
        // Numbers/Constants - #005fcc
        { token: 'number', foreground: '005fcc' },
        { token: 'number.hex', foreground: '005fcc' }
      ],
      colors: {
        'editor.background': '#ffffff',
        'editor.foreground': '#000000',
        'editor.lineHighlightBackground': '#f6f8fa',
        'editor.lineHighlightBorder': '#f6f8fa',
        'editorLineNumber.foreground': '#bdbebf',
        'editorLineNumber.activeForeground': '#000000',
        'editorCursor.foreground': '#000000'
      }
    })

    // Define dark theme
    monaco.editor.defineTheme('custom-assembly-dark', {
      base: 'vs-dark',
      inherit: false,
      rules: [
        // Default text - white
        { token: '', foreground: 'ffffff' },
        
        // Comments - #6A737D
        { token: 'comment', foreground: '6A737D' },
        
        // Strings - #9ECBFF
        { token: 'string', foreground: '9ECBFF' },
        { token: 'string.invalid', foreground: '9ECBFF' },
        { token: 'string.escape.invalid', foreground: '9ECBFF' },
        { token: 'string.regexp', foreground: '9ECBFF' },
        
        // Keywords (ARM instructions) - #F87683
        { token: 'keyword', foreground: 'F87683' },
        
        // Functions/Labels - #B392F0
        { token: 'type', foreground: 'B392F0' },
        
        // Variables (ARM registers) - #FFAB70
        { token: 'variable.predefined', foreground: 'FFAB70' },
        { token: 'identifier', foreground: 'ffffff' },
        
        // Numbers/Constants - #79B8FF
        { token: 'number', foreground: '79B8FF' },
        { token: 'number.hex', foreground: '79B8FF' }
      ],
      colors: {
        'editor.background': '#262626',
        'editor.foreground': '#ffffff',
        'editor.lineHighlightBackground': '#2B3036',
        'editor.lineHighlightBorder': '#2B3036',
        'editorLineNumber.foreground': '#444D56',
        'editorLineNumber.activeForeground': '#ffffff',
        'editorCursor.foreground': '#FFFFFF'
      }
    })

    // Apply the appropriate theme immediately based on DOM class
    const isDark = document.documentElement.classList.contains('dark')
    const currentTheme = isDark ? 'custom-assembly-dark' : 'custom-assembly-light'
    monaco.editor.setTheme(currentTheme)
    
    // Mark editor as ready after a short delay
    setTimeout(() => setEditorReady(true), 10)
  }

  // Effect to update theme when it changes
  useEffect(() => {
    if (!monacoRef.current || !mounted) return

    const monaco = monacoRef.current
    const actualTheme = theme === 'system' ? systemTheme : theme
    
    // Re-define themes to ensure they're up to date
    monaco.editor.defineTheme('custom-assembly-dark', {
      base: 'vs-dark',
      inherit: false,
      rules: [
        { token: '', foreground: 'ffffff' },
        { token: 'comment', foreground: '6A737D' },
        { token: 'string', foreground: '9ECBFF' },
        { token: 'string.invalid', foreground: '9ECBFF' },
        { token: 'string.escape.invalid', foreground: '9ECBFF' },
        { token: 'string.regexp', foreground: '9ECBFF' },
        { token: 'keyword', foreground: 'F87683' },
        { token: 'type', foreground: 'B392F0' },
        { token: 'variable.predefined', foreground: 'FFAB70' },
        { token: 'identifier', foreground: 'ffffff' },
        { token: 'number', foreground: '79B8FF' },
        { token: 'number.hex', foreground: '79B8FF' }
      ],
      colors: {
        'editor.background': '#262626',
        'editor.foreground': '#ffffff',
        'editor.lineHighlightBackground': '#2B3036',
        'editor.lineHighlightBorder': '#2B3036',
        'editorLineNumber.foreground': '#444D56',
        'editorLineNumber.activeForeground': '#ffffff',
        'editorCursor.foreground': '#FFFFFF'
      }
    })

    monaco.editor.defineTheme('custom-assembly-light', {
      base: 'vs',
      inherit: false,
      rules: [
        { token: '', foreground: '000000' },
        { token: 'comment', foreground: '647182' },
        { token: 'string', foreground: '003d99' },
        { token: 'string.invalid', foreground: '003d99' },
        { token: 'string.escape.invalid', foreground: '003d99' },
        { token: 'string.regexp', foreground: '003d99' },
        { token: 'keyword', foreground: 'df0c24' },
        { token: 'type', foreground: '894ceb' },
        { token: 'variable.predefined', foreground: 'a24610' },
        { token: 'identifier', foreground: '000000' },
        { token: 'number', foreground: '005fcc' },
        { token: 'number.hex', foreground: '005fcc' }
      ],
      colors: {
        'editor.background': '#ffffff',
        'editor.foreground': '#000000',
        'editor.lineHighlightBackground': '#f6f8fa',
        'editor.lineHighlightBorder': '#f6f8fa',
        'editorLineNumber.foreground': '#bdbebf',
        'editorLineNumber.activeForeground': '#000000',
        'editorCursor.foreground': '#000000'
      }
    })

    const themeName = actualTheme === 'dark' ? 'custom-assembly-dark' : 'custom-assembly-light'
    monaco.editor.setTheme(themeName)
  }, [theme, systemTheme, mounted])

  // Effect to (re)configure syntax highlighting based on architecture
  useEffect(() => {
    if (!monacoRef.current || !mounted) return
    const monaco = monacoRef.current

    const commonRoot = [
      [/\b0x[0-9a-fA-F]+\b/, 'number.hex'],
      [/\b0b[01]+\b/, 'number.binary'],
      [/#-?[0-9]+\b/, 'number'],
      [/\b[0-9]+\b/, 'number'],
      [/;.*$/, 'comment'],
      [/#.*$/, 'comment'],
      [/\/\/.*$/, 'comment'],
      [/@.*$/, 'comment'],
      // Labels
      [/^[a-zA-Z_][a-zA-Z0-9_]*:/, 'type'],
      // Memory references
      [/\[[^\]]+\]/, 'string.regexp'],
      // Strings
      [/\"([^\"\\]|\\.)*$/, 'string.invalid'],
      [/\"/, 'string', '@string'],
      [/'([^'\\]|\\.)*$/, 'string.invalid'],
      [/'/, 'string', '@string_single'],
    ] as const

    const armProvider = {
      tokenizer: {
        root: [
          // ARM registers first
          [/\b([rR][0-9]|[rR]1[0-5]|[sS][pP]|[lL][rR]|[pP][cC]|[cC][pP][sS][rR])\b/, 'variable.predefined'],
          // Directives (common subset)
          [/^\s*\.(globl|global|text|data|bss|section|type|extern|align|balign|p2align|word|hword|half|byte|space|ascii|asciz|set|macro|endm|equ|include|file|size|loc)\b/i, 'keyword'],
          // ARM instruction + cond + optional S
          [/\b(MOV|MOVS?|MVN|MVNS?|LDR|LDRB?|LDRH?|LDRSB?|LDRSH?|STR|STRB?|STRH?|LDM|LDMIA|LDMIB|LDMDA|LDMDB|STM|STMIA|STMIB|STMDA|STMDB|PUSH|POP|ADD|ADDS?|ADC|ADCS?|SUB|SUBS?|SBC|SBCS?|RSB|RSBS?|RSC|RSCS?|MUL|MULS?|MLA|MLAS?|UMULL|UMULLS?|UMLAL|UMLALS?|SMULL|SMULLS?|SMLAL|SMLALS?|AND|ANDS?|ORR|ORRS?|EOR|EORS?|BIC|BICS?|CMP|CMN|TST|TEQ|LSL|LSLS?|LSR|LSRS?|ASR|ASRS?|ROR|RORS?|RRX|RRXS?|B|BL|BX|BLX|BEQ|BNE|BCS|BCC|BMI|BPL|BVS|BVC|BHI|BLS|BGE|BLT|BGT|BLE|BAL|NOP|SWI|ADR|ADRL)(EQ|NE|CS|CC|MI|PL|VS|VC|HI|LS|GE|LT|GT|LE|AL|HS|LO)?S?\b/i, 'keyword'],
          // fallback identifiers
          [/[a-zA-Z_][a-zA-Z0-9_]*/, 'identifier'],
          // then append common patterns
          ...commonRoot
        ],
        string: [[/[^\\\"]+/, 'string'],[/\\./, 'string.escape'],[/\"/, 'string', '@pop']],
        string_single: [[/[^\\']+/, 'string'],[/\\./, 'string.escape'],[/'/, 'string', '@pop']]
      }
    }

    const mipsProvider = {
      tokenizer: {
        root: [
          // MIPS registers (GPR/FPR/HI/LO)
          [/\$?(zero|at|v[01]|a[0-3]|t[0-9]|s[0-7]|k[01]|gp|sp|fp|s8|ra|hi|lo|f(?:[0-9]|[12][0-9]|3[01]))\b/i, 'variable.predefined'],
          // Directives (extended)
          [/^\s*\.(globl|global|text|data|bss|section|type|ent|end|extern|align|balign|p2align|word|hword|half|byte|space|ascii|asciz|option|set|macro|endm|equ|include|file|size|loc|frame|mask|fmask|cpload|cprestore|comm|lcomm|end|endr|rept|irpc|if|else|elseif|endif|altmacro|noreorder|reorder)\b/i, 'keyword'],
          // MIPS instructions incl. likely + pseudo
          [/\b(ADD(U)?|ADDI(U)?|SUB(U)?|AND(I)?|OR(I)?|XOR(I)?|NOR|NOT|NEG(U)?|SLT(I|IU)?|SLTU|SLL(V)?|SRL(V)?|SRA(V)?|ROTR(V)?|LW|SW|LB|LBU|LH|LHU|SB|SH|LUI|LWL|LWR|SWL|SWR|LL|SC|BEQ|BNE|BLEZ|BGTZ|BLTZ|BGEZ|BEQL|BNEL|BLEZL|BGTZL|BLTZL|BGEZL|BLTZAL|BGEZAL|BLTZALL|BGEZALL|BEQZ|BNEZ|BAL|B|J|JAL|JR|JALR|MFHI|MFLO|MTHI|MTLO|MULT(U)?|DIV(U)?|MUL|MOVN|MOVZ|MOVE|LI|LA|MFC0|MTC0|ERET|CACHE|PREF|SYNC|SYSCALL|BREAK|EXT|INS|SEB|SEH|CLO|CLZ|MADD|MADDU|MSUB|MSUBU)\b/i, 'keyword'],
          // MIPS addressing offset(base)
          [/\b-?[0-9]+\s*\([^)]+\)/, 'string.regexp'],
          // fallback identifiers
          [/[a-zA-Z_][a-zA-Z0-9_]*/, 'identifier'],
          // then append common patterns
          ...commonRoot
        ],
        string: [[/[^\\\"]+/, 'string'],[/\\./, 'string.escape'],[/\"/, 'string', '@pop']],
        string_single: [[/[^\\']+/, 'string'],[/\\./, 'string.escape'],[/'/, 'string', '@pop']]
      }
    }

    const provider = settings.architecture === 'MIPS' ? mipsProvider : armProvider
    monaco.languages.setMonarchTokensProvider('assembly', provider as import('monaco-editor').languages.IMonarchLanguage)
  }, [settings.architecture, mounted])

  // Effect to handle line highlighting
  useEffect(() => {
    if (!editorRef.current || highlightedLine === undefined) {
      return
    }

    const editor = editorRef.current

    // Add new decoration for highlighted line
    // Import monaco dynamically to avoid SSR issues
    import('monaco-editor').then((monaco) => {
      // Clear previous decorations and add new one
      decorationsRef.current = editor.deltaDecorations(decorationsRef.current, [
        {
          range: new monaco.Range(highlightedLine, 1, highlightedLine, Number.MAX_SAFE_INTEGER),
          options: {
            isWholeLine: true,
            className: 'highlighted-line-full',
            marginClassName: 'highlighted-line-margin',
            linesDecorationsClassName: 'highlighted-line-glyph'
          }
        }
      ])
    })

    // Scroll to highlighted line
    editor.revealLineInCenter(highlightedLine)
  }, [highlightedLine])

  // Effect to clear decorations when highlightedLine becomes undefined
  useEffect(() => {
    if (!editorRef.current || highlightedLine !== undefined) {
      return
    }

    const editor = editorRef.current
    // Clear all decorations
    decorationsRef.current = editor.deltaDecorations(decorationsRef.current, [])
  }, [highlightedLine])

  return (
    <div 
      className={`h-full w-full ${className} ${disabled ? 'disabled-editor' : ''}`}
      style={{ opacity: editorReady ? 1 : 0 }}
    >
      <style dangerouslySetInnerHTML={{
        __html: `
          .monaco-editor .view-overlays .current-line {
            background-color: #f6f8fa !important;
            border: none !important;
          }
          .dark .monaco-editor .view-overlays .current-line {
            background-color: #2f2f2f !important;
          }
          .monaco-editor .margin-view-overlays .current-line-margin {
            background-color: #f6f8fa !important;
            border: none !important;
          }
          .dark .monaco-editor .margin-view-overlays .current-line-margin {
            background-color: #2f2f2f !important;
          }
          .monaco-editor .scroll-decoration {
            display: none !important;
          }
          .monaco-editor:not(.focused) .view-overlays .current-line {
            background-color: transparent !important;
          }
          .monaco-editor:not(.focused) .margin-view-overlays .current-line-margin {
            background-color: transparent !important;
          }
          .monaco-editor .line-numbers {
            color: #bdbebf !important;
          }
          .dark .monaco-editor .line-numbers {
            color: #6e7681 !important;
          }
          .monaco-editor .current-line .line-numbers,
          .monaco-editor .active-line-number {
            color: #000000 !important;
          }
          .dark .monaco-editor .current-line .line-numbers,
          .dark .monaco-editor .active-line-number {
            color: #ffffff !important;
          }
          .monaco-editor .margin-view-overlays .current-line-margin,
          .monaco-editor .margin-view-overlays .current-line-margin * {
            color: #000000 !important;
          }
          .dark .monaco-editor .margin-view-overlays .current-line-margin,
          .dark .monaco-editor .margin-view-overlays .current-line-margin * {
            color: #ffffff !important;
          }
          .monaco-editor .cursors-layer .cursor {
            background-color: #000000 !important;
            border-left: 1px solid #000000 !important;
            color: #000000 !important;
            transition: all 0.1s ease-out !important;
          }
          .dark .monaco-editor .cursors-layer .cursor {
            background-color: #FFFFFF !important;
            border-left: 1px solid #FFFFFF !important;
            color: #FFFFFF !important;
            transition: all 0.1s ease-out !important;
          }
          .monaco-editor .cursors-layer > .cursor {
            background-color: #000000 !important;
            border-color: #000000 !important;
            transition: all 0.1s ease-out !important;
          }
          .dark .monaco-editor .cursors-layer > .cursor {
            background-color: #FFFFFF !important;
            border-color: #FFFFFF !important;
            transition: all 0.1s ease-out !important;
          }
          .monaco-editor .highlighted-line-full {
            background-color: #f7f1da !important;
          }
          .dark .monaco-editor .highlighted-line-full {
            background-color: #4a4a3a !important;
          }
          .monaco-editor .view-overlays .highlighted-line-full {
            background-color: #f7f1da !important;
            width: 100% !important;
            left: 0 !important;
            right: 0 !important;
          }
          .dark .monaco-editor .view-overlays .highlighted-line-full {
            background-color: #4a4a3a !important;
          }
          .monaco-editor .highlighted-line-margin {
            background-color: #f7f1da !important;
          }
          .dark .monaco-editor .highlighted-line-margin {
            background-color: #4a4a3a !important;
          }
          .monaco-editor .highlighted-line-glyph {
            background-color: #f7f1da !important;
          }
          .dark .monaco-editor .highlighted-line-glyph {
            background-color: #4a4a3a !important;
          }
          .disabled-editor .monaco-editor * {
            pointer-events: none !important;
          }
          .disabled-editor .monaco-scrollable-element {
            pointer-events: auto !important;
          }
          .disabled-editor .scrollbar {
            pointer-events: auto !important;
          }
        `
      }} />
      <Editor
        height={height}
        width={width}
        language={settings.architecture === 'MIPS' ? 'assembly-mips' : 'assembly-arm'}
        value={value}
        onChange={onChange}
        beforeMount={handleEditorWillMount}
        onMount={handleEditorDidMount}
        theme={mounted && (theme === 'dark' || (theme === 'system' && systemTheme === 'dark')) ? 'custom-assembly-dark' : 'custom-assembly-light'}
        loading=""
        options={{
          minimap: { enabled: false },
          fontSize: 14,
          fontFamily: 'Menlo, Monaco, "Courier New", monospace',
          lineNumbers: 'on',
          lineNumbersMinChars: 5,
          glyphMargin: false,
          roundedSelection: false,
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 4,
          insertSpaces: true,
          wordWrap: 'on',
          contextmenu: false,
          mouseWheelZoom: false,
          cursorStyle: 'line',
          lineHeight: 1.5,
          renderWhitespace: 'selection',
          showUnused: false,
          // Disable code folding per request
          folding: false,
          foldingHighlight: false,
          unfoldOnClickAfterEndOfLine: false,
          selectOnLineNumbers: true,
          padding: { top: 8 },
          scrollbar: { 
            vertical: 'hidden',
            horizontal: 'hidden'
          },
          overviewRulerLanes: 0,
          renderLineHighlight: 'all',
          occurrencesHighlight: 'off',
          selectionHighlight: false,
          stickyScroll: { enabled: false }
        }}
      />
    </div>
  )
} 
