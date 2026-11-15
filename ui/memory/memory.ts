// The on-device memory, one for the window, kept in `memory.json` under %APPDATA%\LearnLayer.

import { MemoryStore } from "@core/memory/memory";
import { dataFiles } from "../native";

let opening: Promise<MemoryStore> | null = null;

export function memoryStore(): Promise<MemoryStore> {
  opening ??= MemoryStore.open(dataFiles).catch(() => MemoryStore.inMemory());
  return opening;
}
