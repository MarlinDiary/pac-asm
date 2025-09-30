'use client'

export default function GuidePanel() {
  return (
    <div className="p-4 max-w-3xl mx-auto font-sans">
      <h1 className="text-2xl font-bold mb-4">Pac-Man Hardware Manual</h1>

      <section className="mb-4">
        <h2 className="text-xl font-semibold mb-2">Introduction</h2>
        <p>
          This hardware lets you run a simple Pac-Man game. You control Pac-Man, move around the map,
          collect dots, and avoid ghosts. The game is controlled by writing to and reading from
          specific memory addresses.
        </p>
      </section>

      <section className="mb-4">
        <h2 className="text-xl font-semibold mb-2">Memory Map</h2>
        <table className="table-auto border-collapse border border-gray-400 w-full">
          <thead>
            <tr className="bg-gray-200">
              <th className="border border-gray-400 px-2 py-1">Address</th>
              <th className="border border-gray-400 px-2 py-1">Purpose</th>
              <th className="border border-gray-400 px-2 py-1">Notes</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-gray-400 px-2 py-1">0x30000</td>
              <td className="border border-gray-400 px-2 py-1">Movement command</td>
              <td className="border border-gray-400 px-2 py-1">Write a number here to move Pac-Man</td>
            </tr>
            <tr>
              <td className="border border-gray-400 px-2 py-1">0x30004</td>
              <td className="border border-gray-400 px-2 py-1">Map width</td>
              <td className="border border-gray-400 px-2 py-1">Read to get the width of the map</td>
            </tr>
            <tr>
              <td className="border border-gray-400 px-2 py-1">0x30008</td>
              <td className="border border-gray-400 px-2 py-1">Map height</td>
              <td className="border border-gray-400 px-2 py-1">Read to get the height of the map</td>
            </tr>
            <tr>
              <td className="border border-gray-400 px-2 py-1">0x30010</td>
              <td className="border border-gray-400 px-2 py-1">Map data start</td>
              <td className="border border-gray-400 px-2 py-1">Start of the map tiles in memory</td>
            </tr>
            <tr>
              <td className="border border-gray-400 px-2 py-1">0x30400-0x31FFF</td>
              <td className="border border-gray-400 px-2 py-1">User space</td>
              <td className="border border-gray-400 px-2 py-1">Free memory for your own use</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="mb-4">
        <h2 className="text-xl font-semibold mb-2">Map Tile Values</h2>
        <table className="table-auto border-collapse border border-gray-400 w-full">
          <thead>
            <tr className="bg-gray-200">
              <th className="border border-gray-400 px-2 py-1">Value</th>
              <th className="border border-gray-400 px-2 py-1">Meaning</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-gray-400 px-2 py-1">0</td>
              <td className="border border-gray-400 px-2 py-1">Wall</td>
            </tr>
            <tr>
              <td className="border border-gray-400 px-2 py-1">1</td>
              <td className="border border-gray-400 px-2 py-1">Grass</td>
            </tr>
            <tr>
              <td className="border border-gray-400 px-2 py-1">2</td>
              <td className="border border-gray-400 px-2 py-1">Dot</td>
            </tr>
            <tr>
              <td className="border border-gray-400 px-2 py-1">3</td>
              <td className="border border-gray-400 px-2 py-1">Player</td>
            </tr>
            <tr>
              <td className="border border-gray-400 px-2 py-1">4</td>
              <td className="border border-gray-400 px-2 py-1">Ghost</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="mb-4">
        <h2 className="text-xl font-semibold mb-2">Movement Commands</h2>
        <table className="table-auto border-collapse border border-gray-400 w-full">
          <thead>
            <tr className="bg-gray-200">
              <th className="border border-gray-400 px-2 py-1">Command</th>
              <th className="border border-gray-400 px-2 py-1">Action</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-gray-400 px-2 py-1">1</td>
              <td className="border border-gray-400 px-2 py-1">Move Up</td>
            </tr>
            <tr>
              <td className="border border-gray-400 px-2 py-1">2</td>
              <td className="border border-gray-400 px-2 py-1">Move Down</td>
            </tr>
            <tr>
              <td className="border border-gray-400 px-2 py-1">3</td>
              <td className="border border-gray-400 px-2 py-1">Move Left</td>
            </tr>
            <tr>
              <td className="border border-gray-400 px-2 py-1">4</td>
              <td className="border border-gray-400 px-2 py-1">Move Right</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-2">How to Use</h2>
        <ol className="list-decimal list-inside">
          <li>
            <strong>Read the map size:</strong> Read <code>0x30004</code> for width and <code>0x30008</code> for height.
          </li>
          <li>
            <strong>Read map data:</strong> Start from <code>0x30010</code>. Each memory location is a tile.
          </li>
          <li>
            <strong>Move Pac-Man:</strong> Write the movement command (1-4) to <code>0x30000</code>.
          </li>
          <li>
            <strong>Check updates:</strong> After moving, read the map memory to see new positions.
          </li>
        </ol>
      </section>

      <section className="mt-4">
        <h2 className="text-xl font-semibold mb-2">Tips</h2>
        <ul className="list-disc list-inside">
          <li>Use <code>0x30400-0x31FFF</code> for temporary variables.</li>
          <li>Do not overwrite the game memory. It is undefined behavior.</li>
          <li>Pac-Man moves one tile per command. Plan carefully to avoid ghosts.</li>
        </ul>
      </section>
    </div>
  )
}
