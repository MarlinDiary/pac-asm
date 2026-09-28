export interface MemoryRow {
  address: string
  hex: string
  ascii: string
}

const BYTES_PER_ROW = 4
const REGIONS = [
  { start: 0x10000, size: 0x1000 },
  { start: 0x20000, size: 0x1000 },
  { start: 0x30000, size: 0x2000 }
] as const

// These are display strings only, never emulator memory. Most snapshot rows
// are zero, so share immutable rows instead of formatting them on every step.
const EMPTY_ROWS = REGIONS.map(region =>
  Array.from({ length: region.size / BYTES_PER_ROW }, (_, index): MemoryRow =>
    Object.freeze({
      address: `0x${(region.start + index * BYTES_PER_ROW).toString(16).toUpperCase().padStart(8, '0')}`,
      hex: '00 00 00 00',
      ascii: '. . . .'
    })
  )
)

export function generateMemoryRows(
  codeMemory?: number[],
  stackMemory?: number[],
  dataMemory?: number[]
): MemoryRow[] {
  const rows: MemoryRow[] = []
  const snapshots = [codeMemory, stackMemory, dataMemory]

  EMPTY_ROWS.forEach((emptyRows, regionIndex) => {
    const data = snapshots[regionIndex]
    emptyRows.forEach((emptyRow, index) => {
      const offset = index * BYTES_PER_ROW
      if (
        (!data || data[offset] === undefined || data[offset] === 0) &&
        (!data || data[offset + 1] === undefined || data[offset + 1] === 0) &&
        (!data || data[offset + 2] === undefined || data[offset + 2] === 0) &&
        (!data || data[offset + 3] === undefined || data[offset + 3] === 0)
      ) {
        rows.push(emptyRow)
        return
      }

      const bytes = new Array<number>(BYTES_PER_ROW).fill(0)
      for (let byteIndex = 0; byteIndex < BYTES_PER_ROW; byteIndex++) {
        const value = data?.[offset + byteIndex]
        if (value !== undefined) bytes[byteIndex] = value
      }
      rows.push({
        address: emptyRow.address,
        hex: bytes.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' '),
        ascii: bytes.map(b => (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.').join(' ')
      })
    })
  })
  return rows
}
