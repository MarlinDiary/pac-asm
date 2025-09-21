import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@/components/ui/table"

interface RegisterData {
  register: string
  value: number
}

interface RegisterPanelProps {
  registers?: RegisterData[]
  previousRegisters?: RegisterData[]
  architecture?: 'ARM' | 'MIPS'
}

const ARM_REG_LIST = [
  'R0', 'R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7',
  'R8', 'R9', 'R10', 'R11', 'R12', 'SP', 'LR', 'PC'
]

// MIPS register display order per requirements
const MIPS_REG_LIST = [
  'ZERO','AT','V0','V1','A0','A1','A2','A3',
  'T0','T1','T2','T3','T4','T5','T6','T7','T8','T9',
  'S0','S1','S2','S3','S4','S5','S6','S7','S8',
  'K0','K1','PC'
]

export default function RegisterPanel({ registers: registerData, previousRegisters, architecture = 'ARM' }: RegisterPanelProps) {
  const registers = architecture === 'MIPS' ? MIPS_REG_LIST : ARM_REG_LIST
  const NBSP = '\u00A0'
  const formatRegisterName = (register: string) => {
    if (architecture === 'ARM') {
      // Original ARM behavior: inner space for single-digit Rn and for SP/LR/PC
      if (register.length === 2 && register.startsWith('R')) {
        return `R ${register[1]}`
      }
      if (register === 'SP' || register === 'LR' || register === 'PC') {
        return `${register[0]} ${register[1]}`
      }
      return register
    }
    // MIPS: two-letter registers padded with spaces around, no inner space
    if (register.length === 2) {
      return `${NBSP}${register}${NBSP}`
    }
    return register
  }

  const resolveRegisterKey = (name: string): string => {
    const n = name.toLowerCase()
    if (architecture === 'MIPS') {
      // Map S8 to fp for underlying emulator register
      if (n === 's8') return 'fp'
    }
    return n
  }
  const getRegisterValue = (registerName: string): number => {
    if (!registerData) return 0
    // Convert to lowercase to match the data from emulator (r0, r1, etc.)
    const key = resolveRegisterKey(registerName)
    const found = registerData.find(reg => reg.register === key)
    return found ? found.value : 0
  }

  const getPreviousRegisterValue = (registerName: string): number => {
    if (!previousRegisters) return 0
    const key = resolveRegisterKey(registerName)
    const found = previousRegisters.find(reg => reg.register === key)
    return found ? found.value : 0
  }

  const isRegisterChanged = (registerName: string): boolean => {
    if (!previousRegisters) return false
    const currentValue = getRegisterValue(registerName)
    const previousValue = getPreviousRegisterValue(registerName)
    return currentValue !== previousValue
  }

  return (
    <div className="w-full">
      <Table className="border-none">
        <TableBody>
          {registers.map((register, index) => {
            const value = getRegisterValue(register)
            const hexValue = value.toString(16).toUpperCase().padStart(8, '0')
            const hasChanged = isRegisterChanged(register)
            
            return (
              <TableRow key={register} className={`h-12 border-none ${index % 2 === 0 ? 'bg-white hover:bg-white dark:bg-[#262626] dark:hover:bg-[#262626]' : 'bg-[#f7f7f8] hover:bg-[#f7f7f8] dark:bg-[#353535] dark:hover:bg-[#353535]'}`}>
                <TableCell className="h-12 w-1/4 text-center border-none">
                  <Badge 
                    variant="outline" 
                    className={`font-mono text-xs ${hasChanged ? 'text-white bg-[#1a1a1a] dark:bg-[#F5F5F5] dark:text-black border-none' : 'text-[#5a5a5a] dark:text-[#BDBEC2] bg-transparent'}`}
                  >
                    {formatRegisterName(register)}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono h-12 w-1/2 text-center border-none text-[#5a5a5a] dark:text-[#BDBEC2]">
                  {hexValue}
                </TableCell>
                <TableCell className="font-mono h-12 w-1/4 text-center border-none text-[#5a5a5a] dark:text-[#BDBEC2]">
                  {value}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
