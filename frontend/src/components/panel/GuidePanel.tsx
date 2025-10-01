'use client'

export default function GuidePanel() {
  return (
    <div
      className="w-full h-full overflow-y-auto px-4 py-3"
      style={{
        scrollbarWidth: 'none',
        msOverflowStyle: 'none'
      }}
    >
      <div className="max-w-4xl [&::-webkit-scrollbar]:hidden">
        <h1 className="text-xl font-bold mb-5 text-[#1f1f1f] dark:text-[#f5f5f5]">Pac-Man Hardware Manual</h1>

        <section className="mb-5">
          <h2 className="text-base font-semibold mb-2.5 text-[#1f1f1f] dark:text-[#f5f5f5]">Introduction</h2>
          <p className="text-sm text-[#5a5a5a] dark:text-[#BDBEC2] leading-relaxed">
            This hardware lets you run a simple Pac-Man game. You control Pac-Man, move around the map,
            collect dots, and avoid ghosts. The game is controlled by writing to and reading from
            specific memory addresses.
          </p>
        </section>

        <section className="mb-5">
          <h2 className="text-base font-semibold mb-2.5 text-[#1f1f1f] dark:text-[#f5f5f5]">Memory Map</h2>
          <div className="overflow-x-auto rounded-lg border border-[#f0f0f0] dark:border-[#3C3C3C]">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-[#f7f7f8] dark:bg-[#353535]">
                  <th className="border-b border-[#f0f0f0] dark:border-[#3C3C3C] px-4 py-2.5 text-left text-xs font-semibold text-[#1f1f1f] dark:text-[#f5f5f5]">Address</th>
                  <th className="border-b border-[#f0f0f0] dark:border-[#3C3C3C] px-4 py-2.5 text-left text-xs font-semibold text-[#1f1f1f] dark:text-[#f5f5f5]">Purpose</th>
                  <th className="border-b border-[#f0f0f0] dark:border-[#3C3C3C] px-4 py-2.5 text-left text-xs font-semibold text-[#1f1f1f] dark:text-[#f5f5f5]">Notes</th>
                </tr>
              </thead>
              <tbody>
                <tr className="bg-white dark:bg-[#262626]">
                  <td className="border-b border-[#f0f0f0] dark:border-[#3C3C3C] px-4 py-2.5 text-xs font-mono text-[#5a5a5a] dark:text-[#BDBEC2]">0x30000</td>
                  <td className="border-b border-[#f0f0f0] dark:border-[#3C3C3C] px-4 py-2.5 text-xs text-[#5a5a5a] dark:text-[#BDBEC2]">Movement command</td>
                  <td className="border-b border-[#f0f0f0] dark:border-[#3C3C3C] px-4 py-2.5 text-xs text-[#5a5a5a] dark:text-[#BDBEC2]">Write a number here to move Pac-Man</td>
                </tr>
                <tr className="bg-[#f7f7f8] dark:bg-[#353535]">
                  <td className="border-b border-[#f0f0f0] dark:border-[#3C3C3C] px-4 py-2.5 text-xs font-mono text-[#5a5a5a] dark:text-[#BDBEC2]">0x30004</td>
                  <td className="border-b border-[#f0f0f0] dark:border-[#3C3C3C] px-4 py-2.5 text-xs text-[#5a5a5a] dark:text-[#BDBEC2]">Map width</td>
                  <td className="border-b border-[#f0f0f0] dark:border-[#3C3C3C] px-4 py-2.5 text-xs text-[#5a5a5a] dark:text-[#BDBEC2]">Read to get the width of the map</td>
                </tr>
                <tr className="bg-white dark:bg-[#262626]">
                  <td className="border-b border-[#f0f0f0] dark:border-[#3C3C3C] px-4 py-2.5 text-xs font-mono text-[#5a5a5a] dark:text-[#BDBEC2]">0x30008</td>
                  <td className="border-b border-[#f0f0f0] dark:border-[#3C3C3C] px-4 py-2.5 text-xs text-[#5a5a5a] dark:text-[#BDBEC2]">Map height</td>
                  <td className="border-b border-[#f0f0f0] dark:border-[#3C3C3C] px-4 py-2.5 text-xs text-[#5a5a5a] dark:text-[#BDBEC2]">Read to get the height of the map</td>
                </tr>
                <tr className="bg-[#f7f7f8] dark:bg-[#353535]">
                  <td className="border-b border-[#f0f0f0] dark:border-[#3C3C3C] px-4 py-2.5 text-xs font-mono text-[#5a5a5a] dark:text-[#BDBEC2]">0x30010</td>
                  <td className="border-b border-[#f0f0f0] dark:border-[#3C3C3C] px-4 py-2.5 text-xs text-[#5a5a5a] dark:text-[#BDBEC2]">Map data start</td>
                  <td className="border-b border-[#f0f0f0] dark:border-[#3C3C3C] px-4 py-2.5 text-xs text-[#5a5a5a] dark:text-[#BDBEC2]">Start of the map tiles in memory</td>
                </tr>
                <tr className="bg-white dark:bg-[#262626]">
                  <td className="px-4 py-2.5 text-xs font-mono text-[#5a5a5a] dark:text-[#BDBEC2]">0x30400-0x31FFF</td>
                  <td className="px-4 py-2.5 text-xs text-[#5a5a5a] dark:text-[#BDBEC2]">User space</td>
                  <td className="px-4 py-2.5 text-xs text-[#5a5a5a] dark:text-[#BDBEC2]">Free memory for your own use</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="mb-5">
          <h2 className="text-base font-semibold mb-2.5 text-[#1f1f1f] dark:text-[#f5f5f5]">Map Tile Values</h2>
          <div className="overflow-x-auto rounded-lg border border-[#f0f0f0] dark:border-[#3C3C3C]">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-[#f7f7f8] dark:bg-[#353535]">
                  <th className="border-b border-[#f0f0f0] dark:border-[#3C3C3C] px-4 py-2.5 text-left text-xs font-semibold text-[#1f1f1f] dark:text-[#f5f5f5]">Value</th>
                  <th className="border-b border-[#f0f0f0] dark:border-[#3C3C3C] px-4 py-2.5 text-left text-xs font-semibold text-[#1f1f1f] dark:text-[#f5f5f5]">Meaning</th>
                </tr>
              </thead>
              <tbody>
                <tr className="bg-white dark:bg-[#262626]">
                  <td className="border-b border-[#f0f0f0] dark:border-[#3C3C3C] px-4 py-2.5 text-xs font-mono text-[#5a5a5a] dark:text-[#BDBEC2]">0</td>
                  <td className="border-b border-[#f0f0f0] dark:border-[#3C3C3C] px-4 py-2.5 text-xs text-[#5a5a5a] dark:text-[#BDBEC2]">Wall</td>
                </tr>
                <tr className="bg-[#f7f7f8] dark:bg-[#353535]">
                  <td className="border-b border-[#f0f0f0] dark:border-[#3C3C3C] px-4 py-2.5 text-xs font-mono text-[#5a5a5a] dark:text-[#BDBEC2]">1</td>
                  <td className="border-b border-[#f0f0f0] dark:border-[#3C3C3C] px-4 py-2.5 text-xs text-[#5a5a5a] dark:text-[#BDBEC2]">Grass</td>
                </tr>
                <tr className="bg-white dark:bg-[#262626]">
                  <td className="border-b border-[#f0f0f0] dark:border-[#3C3C3C] px-4 py-2.5 text-xs font-mono text-[#5a5a5a] dark:text-[#BDBEC2]">2</td>
                  <td className="border-b border-[#f0f0f0] dark:border-[#3C3C3C] px-4 py-2.5 text-xs text-[#5a5a5a] dark:text-[#BDBEC2]">Dot</td>
                </tr>
                <tr className="bg-[#f7f7f8] dark:bg-[#353535]">
                  <td className="border-b border-[#f0f0f0] dark:border-[#3C3C3C] px-4 py-2.5 text-xs font-mono text-[#5a5a5a] dark:text-[#BDBEC2]">3</td>
                  <td className="border-b border-[#f0f0f0] dark:border-[#3C3C3C] px-4 py-2.5 text-xs text-[#5a5a5a] dark:text-[#BDBEC2]">Player</td>
                </tr>
                <tr className="bg-white dark:bg-[#262626]">
                  <td className="px-4 py-2.5 text-xs font-mono text-[#5a5a5a] dark:text-[#BDBEC2]">4</td>
                  <td className="px-4 py-2.5 text-xs text-[#5a5a5a] dark:text-[#BDBEC2]">Ghost</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="mb-5">
          <h2 className="text-base font-semibold mb-2.5 text-[#1f1f1f] dark:text-[#f5f5f5]">Movement Commands</h2>
          <div className="overflow-x-auto rounded-lg border border-[#f0f0f0] dark:border-[#3C3C3C]">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-[#f7f7f8] dark:bg-[#353535]">
                  <th className="border-b border-[#f0f0f0] dark:border-[#3C3C3C] px-4 py-2.5 text-left text-xs font-semibold text-[#1f1f1f] dark:text-[#f5f5f5]">Command</th>
                  <th className="border-b border-[#f0f0f0] dark:border-[#3C3C3C] px-4 py-2.5 text-left text-xs font-semibold text-[#1f1f1f] dark:text-[#f5f5f5]">Action</th>
                </tr>
              </thead>
              <tbody>
                <tr className="bg-white dark:bg-[#262626]">
                  <td className="border-b border-[#f0f0f0] dark:border-[#3C3C3C] px-4 py-2.5 text-xs font-mono text-[#5a5a5a] dark:text-[#BDBEC2]">1</td>
                  <td className="border-b border-[#f0f0f0] dark:border-[#3C3C3C] px-4 py-2.5 text-xs text-[#5a5a5a] dark:text-[#BDBEC2]">Move Up</td>
                </tr>
                <tr className="bg-[#f7f7f8] dark:bg-[#353535]">
                  <td className="border-b border-[#f0f0f0] dark:border-[#3C3C3C] px-4 py-2.5 text-xs font-mono text-[#5a5a5a] dark:text-[#BDBEC2]">2</td>
                  <td className="border-b border-[#f0f0f0] dark:border-[#3C3C3C] px-4 py-2.5 text-xs text-[#5a5a5a] dark:text-[#BDBEC2]">Move Down</td>
                </tr>
                <tr className="bg-white dark:bg-[#262626]">
                  <td className="border-b border-[#f0f0f0] dark:border-[#3C3C3C] px-4 py-2.5 text-xs font-mono text-[#5a5a5a] dark:text-[#BDBEC2]">3</td>
                  <td className="border-b border-[#f0f0f0] dark:border-[#3C3C3C] px-4 py-2.5 text-xs text-[#5a5a5a] dark:text-[#BDBEC2]">Move Left</td>
                </tr>
                <tr className="bg-[#f7f7f8] dark:bg-[#353535]">
                  <td className="px-4 py-2.5 text-xs font-mono text-[#5a5a5a] dark:text-[#BDBEC2]">4</td>
                  <td className="px-4 py-2.5 text-xs text-[#5a5a5a] dark:text-[#BDBEC2]">Move Right</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="mb-5">
          <h2 className="text-base font-semibold mb-2.5 text-[#1f1f1f] dark:text-[#f5f5f5]">How to Use</h2>
          <ol className="list-decimal space-y-2.5 text-sm text-[#5a5a5a] dark:text-[#BDBEC2] pl-5">
            <li className="leading-relaxed pl-2">
              <strong className="text-[#1f1f1f] dark:text-[#f5f5f5]">Read the map size:</strong> Read <code className="font-mono text-sm bg-[#f7f7f8] dark:bg-[#353535] px-1.5 py-0.5 rounded">0x30004</code> for width and <code className="font-mono text-sm bg-[#f7f7f8] dark:bg-[#353535] px-1.5 py-0.5 rounded">0x30008</code> for height.
            </li>
            <li className="leading-relaxed pl-2">
              <strong className="text-[#1f1f1f] dark:text-[#f5f5f5]">Read map data:</strong> Start from <code className="font-mono text-sm bg-[#f7f7f8] dark:bg-[#353535] px-1.5 py-0.5 rounded">0x30010</code>. Each memory location is a tile.
            </li>
            <li className="leading-relaxed pl-2">
              <strong className="text-[#1f1f1f] dark:text-[#f5f5f5]">Move Pac-Man:</strong> Write the movement command (1-4) to <code className="font-mono text-sm bg-[#f7f7f8] dark:bg-[#353535] px-1.5 py-0.5 rounded">0x30000</code>.
            </li>
            <li className="leading-relaxed pl-2">
              <strong className="text-[#1f1f1f] dark:text-[#f5f5f5]">Check updates:</strong> After moving, read the map memory to see new positions.
            </li>
          </ol>
        </section>

        <section className="mb-5">
          <h2 className="text-base font-semibold mb-2.5 text-[#1f1f1f] dark:text-[#f5f5f5]">Tips</h2>
          <ul className="list-disc space-y-2.5 text-sm text-[#5a5a5a] dark:text-[#BDBEC2] pl-5">
            <li className="leading-relaxed pl-2">Use <code className="font-mono text-sm bg-[#f7f7f8] dark:bg-[#353535] px-1.5 py-0.5 rounded">0x30400-0x31FFF</code> for temporary variables.</li>
            <li className="leading-relaxed pl-2">Do not overwrite the game memory. It is undefined behavior.</li>
            <li className="leading-relaxed pl-2">Pac-Man moves one tile per command. Plan carefully to avoid ghosts.</li>
          </ul>
        </section>
      </div>
    </div>
  )
}
