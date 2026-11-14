// SF Symbol names (what the Swift code asks for) drawn with Segoe Fluent Icons (CLAUDE.md, section 7).
// Segoe MDL2 Assets has the same code points, so Windows 10 shows the same glyphs.

const glyphs: Record<string, string> = {
  "point.3.connected.trianglepath.dotted": "", // Relationship
  folder: "", // Folder
  "person.crop.circle": "", // Contact
  "person.fill": "", // Contact
  "chart.bar.xaxis": "", // Diagnostic
  gearshape: "", // Settings
  "hand.raised": "", // Permissions
  sparkles: "", // LightningBolt
  "lock.shield": "", // Lock
  laptopcomputer: "", // DeviceLaptopNoPic
  "square.and.arrow.down": "", // Download
  "person.crop.circle.badge.xmark": "", // BlockContact
  trash: "", // Delete
  "camera.viewfinder": "", // Camera
  macwindow: "", // ChromeRestore / window
  viewfinder: "", // Crop / rectangular clip
  "text.cursor": "", // FontSize / text
  "questionmark.bubble": "", // Help
  "mic.fill": "", // Microphone
  "speaker.wave.2": "", // Volume
  "speaker.slash": "", // Mute
  "stop.fill": "", // Stop
  "arrow.turn.down.right": "", // ReturnKey
  lightbulb: "", // Lightbulb
  xmark: "", // Cancel
  checkmark: "", // CheckMark
};

export const knownSymbols = Object.keys(glyphs);

export function Icon({ symbol, size = 14, className }: { symbol: string; size?: number; className?: string }) {
  return (
    <i className={className ? `icon ${className}` : "icon"} style={{ fontSize: size }} aria-hidden="true">
      {glyphs[symbol] ?? ""}
    </i>
  );
}
