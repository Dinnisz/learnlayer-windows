// SF Symbol names (what the Swift code asks for) drawn with Segoe Fluent Icons (CLAUDE.md, section 7).
// Segoe MDL2 Assets has the same code points, so Windows 10 shows the same glyphs.

const glyphs: Record<string, string> = {
  "point.3.connected.trianglepath.dotted": "\uF003", // Relationship
  folder: "\uE8B7", // Folder
  "person.crop.circle": "\uE77B", // Contact
  "person.fill": "\uE77B", // Contact
  "chart.bar.xaxis": "\uE9D9", // Diagnostic
  gearshape: "\uE713", // Settings
  "hand.raised": "\uE8D7", // Permissions
  sparkles: "\uE945", // LightningBolt
  "lock.shield": "\uE72E", // Lock
  laptopcomputer: "\uE7F8", // DeviceLaptopNoPic
  "square.and.arrow.down": "\uE896", // Download
  "person.crop.circle.badge.xmark": "\uE8F8", // BlockContact
  trash: "\uE74D", // Delete
  "camera.viewfinder": "\uE722", // Camera
  macwindow: "\uE737", // ChromeRestore / window
  viewfinder: "\uEF20", // Crop / rectangular clip
  "text.cursor": "\uE8E9", // FontSize / text
  "questionmark.bubble": "\uE897", // Help
  "mic.fill": "\uE720", // Microphone
  "speaker.wave.2": "\uE767", // Volume
  "speaker.slash": "\uE74F", // Mute
  "stop.fill": "\uE71A", // Stop
  "arrow.turn.down.right": "\uE751", // ReturnKey
  lightbulb: "\uEA80", // Lightbulb
  xmark: "\uE711", // Cancel
  "plus.magnifyingglass": "\uE8A3", // ZoomIn
  "minus.magnifyingglass": "\uE71F", // ZoomOut
  "arrow.up.left.and.arrow.down.right": "\uE9A6", // FitPage
  doc: "\uE8E5", // OpenFile
  checkmark: "\uE73E", // CheckMark
};

export const knownSymbols = Object.keys(glyphs);

export function Icon({ symbol, size = 14, className }: { symbol: string; size?: number; className?: string }) {
  return (
    <i className={className ? `icon ${className}` : "icon"} style={{ fontSize: size }} aria-hidden="true">
      {glyphs[symbol] ?? "\uE9CE"}
    </i>
  );
}
