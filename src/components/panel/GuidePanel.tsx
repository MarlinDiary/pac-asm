'use client'

export default function GuidePanel() {
  return (
    <div 
      className="w-full h-full py-5 px-4 overflow-y-auto [&::-webkit-scrollbar]:hidden" 
      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
    >
      <div className="max-w-3xl">
        <section className="mb-6">
          <h2 className="text-lg font-semibold mb-2 text-[#262626] dark:text-[#FFFFFF]">
            Memory Map
          </h2>
          <div className="text-sm text-[#262626] dark:text-[#FFFFFF] space-y-2">
            <p><code className="bg-[#F7F7F8] dark:bg-[#353535] border border-[#EAEAEB] dark:border-[#4D4D4E] text-[#5B5B5B] dark:text-[#C0C2C5] text-xs px-1 rounded">0x30000</code> - Movement command</p>
            <p><code className="bg-[#F7F7F8] dark:bg-[#353535] border border-[#EAEAEB] dark:border-[#4D4D4E] text-[#5B5B5B] dark:text-[#C0C2C5] text-xs px-1 rounded">0x30004</code> - Map width</p>
            <p><code className="bg-[#F7F7F8] dark:bg-[#353535] border border-[#EAEAEB] dark:border-[#4D4D4E] text-[#5B5B5B] dark:text-[#C0C2C5] text-xs px-1 rounded">0x30008</code> - Map height</p>
            <p><code className="bg-[#F7F7F8] dark:bg-[#353535] border border-[#EAEAEB] dark:border-[#4D4D4E] text-[#5B5B5B] dark:text-[#C0C2C5] text-xs px-1 rounded">0x30010</code> - Map data start</p>
            <p><code className="bg-[#F7F7F8] dark:bg-[#353535] border border-[#EAEAEB] dark:border-[#4D4D4E] text-[#5B5B5B] dark:text-[#C0C2C5] text-xs px-1 rounded">0x30400-0x30FFF</code> - User space</p>
          </div>
        </section>

        <section className="mb-6">
          <h2 className="text-lg font-semibold mb-2 text-[#262626] dark:text-[#FFFFFF]">
            Map Tile Values
          </h2>
          <div className="text-sm text-[#262626] dark:text-[#FFFFFF] space-y-2">
            <p><code className="bg-[#F7F7F8] dark:bg-[#353535] border border-[#EAEAEB] dark:border-[#4D4D4E] text-[#5B5B5B] dark:text-[#C0C2C5] text-xs px-1 rounded">0</code> - Wall</p>
            <p><code className="bg-[#F7F7F8] dark:bg-[#353535] border border-[#EAEAEB] dark:border-[#4D4D4E] text-[#5B5B5B] dark:text-[#C0C2C5] text-xs px-1 rounded">1</code> - Grass</p>
            <p><code className="bg-[#F7F7F8] dark:bg-[#353535] border border-[#EAEAEB] dark:border-[#4D4D4E] text-[#5B5B5B] dark:text-[#C0C2C5] text-xs px-1 rounded">2</code> - Dot</p>
            <p><code className="bg-[#F7F7F8] dark:bg-[#353535] border border-[#EAEAEB] dark:border-[#4D4D4E] text-[#5B5B5B] dark:text-[#C0C2C5] text-xs px-1 rounded">3</code> - Player</p>
            <p><code className="bg-[#F7F7F8] dark:bg-[#353535] border border-[#EAEAEB] dark:border-[#4D4D4E] text-[#5B5B5B] dark:text-[#C0C2C5] text-xs px-1 rounded">4</code> - Ghost</p>
          </div>
        </section>

        <section className="mb-6">
          <h2 className="text-lg font-semibold mb-2 text-[#262626] dark:text-[#FFFFFF]">
            Movement Commands
          </h2>
          <div className="text-sm text-[#262626] dark:text-[#FFFFFF] space-y-2">
            <p><code className="bg-[#F7F7F8] dark:bg-[#353535] border border-[#EAEAEB] dark:border-[#4D4D4E] text-[#5B5B5B] dark:text-[#C0C2C5] text-xs px-1 rounded">1</code> - Move Up</p>
            <p><code className="bg-[#F7F7F8] dark:bg-[#353535] border border-[#EAEAEB] dark:border-[#4D4D4E] text-[#5B5B5B] dark:text-[#C0C2C5] text-xs px-1 rounded">2</code> - Move Down</p>
            <p><code className="bg-[#F7F7F8] dark:bg-[#353535] border border-[#EAEAEB] dark:border-[#4D4D4E] text-[#5B5B5B] dark:text-[#C0C2C5] text-xs px-1 rounded">3</code> - Move Left</p>
            <p><code className="bg-[#F7F7F8] dark:bg-[#353535] border border-[#EAEAEB] dark:border-[#4D4D4E] text-[#5B5B5B] dark:text-[#C0C2C5] text-xs px-1 rounded">4</code> - Move Right</p>
          </div>
        </section>

      </div>
    </div>
  )
}