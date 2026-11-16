// The memory sync of this computer (BrainSyncController on the Mac): runs in the main window only, every 15 minutes
// and on "Sync now", when the student turned sync on and is signed in. The keys live in the Credential Manager
// (`memory-sync.<name>`), the per-shard state in localStorage.

import { BackendClient, BackendFailure } from "@core/ai/backendClient";
import {
  base64,
  BrainSyncController,
  freshSyncState,
  fromBase64,
  OfflineFailure,
  type BrainSecretStore,
  type BrainSyncBackend,
  type BrainSyncState,
  type BrainSyncStateStore,
} from "@core/memory/brainSync";
import { appConfig, invoke, isTauri, nativeFetch, session } from "../native";
import { memoryStore } from "./memory";

/** The Credential Manager through the two native commands; localStorage in a development browser. */
const secrets: BrainSecretStore = isTauri
  ? {
      read: async (name) => {
        const value = await invoke<string | null>("memory_secret_read", { name }).catch(() => null);
        return value ? fromBase64(value) : null;
      },
      write: async (name, data) => {
        await invoke<boolean>("memory_secret_write", { name, value: data ? base64(data) : null }).catch(() => false);
      },
    }
  : {
      read: async (name) => {
        const value = localStorage.getItem("learnlayer-dev-secret:" + name);
        return value ? fromBase64(value) : null;
      },
      write: async (name, data) => {
        if (data) localStorage.setItem("learnlayer-dev-secret:" + name, base64(data));
        else localStorage.removeItem("learnlayer-dev-secret:" + name);
      },
    };

const stateKey = "learnLayerBrainSyncState";

const stateStore: BrainSyncStateStore = {
  load: () => {
    try {
      const saved = JSON.parse(localStorage.getItem(stateKey) ?? "null") as BrainSyncState | null;
      return saved && typeof saved.userID === "string" ? saved : freshSyncState();
    } catch {
      return freshSyncState();
    }
  },
  save: (state) => {
    try {
      localStorage.setItem(stateKey, JSON.stringify(state));
    } catch {
      // Kept for this launch only: the next run pushes again what it cannot prove is on the server.
    }
  },
};

/** The live API with the saved session. A request that never got an answer is `OfflineFailure`. */
function liveBackend(client: BackendClient): BrainSyncBackend {
  const token = async () => {
    const value = await session.accessToken(false);
    if (!value) throw new BackendFailure(401, "unauthorized", "");
    return value;
  };
  const call = async <T>(work: (token: string) => Promise<T>): Promise<T> => {
    const value = await token();
    try {
      return await work(value);
    } catch (error) {
      if (error instanceof BackendFailure) throw error;
      if (error instanceof Error && error.name === "DecodingFailure") throw error;
      throw new OfflineFailure(String(error));
    }
  };
  return {
    devices: () => call((value) => client.devices(value)),
    memoryKeys: () => call((value) => client.memoryKeys(value)),
    putMemoryKey: (key) => call((value) => client.putMemoryKey(key, value)),
    memoryBlobs: () => call((value) => client.memoryBlobs(value)),
    putMemoryBlob: (id, expectedVersion, keyVersion, nonce, ciphertext) =>
      call((value) => client.putMemoryBlob(id, { expectedVersion, keyVersion, nonce, ciphertext }, value)),
  };
}

let shared: Promise<BrainSyncController> | null = null;

export function memorySync(): Promise<BrainSyncController> {
  shared ??= Promise.all([appConfig(), memoryStore()]).then(([config, memory]) => {
    const client = new BackendClient(config.apiBase, nativeFetch);
    return new BrainSyncController({
      makeBackend: () => liveBackend(client),
      secrets,
      stateStore,
      graph: memory,
      userID: async () => {
        const status = await session.status().catch(() => null);
        return status?.signedIn && status.userID !== "" ? status.userID : null;
      },
      isEnabled: () => memory.consent.memorySync,
    });
  });
  return shared;
}
