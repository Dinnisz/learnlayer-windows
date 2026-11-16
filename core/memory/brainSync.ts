// Port of LearnLayer/Memory/BrainSync.swift and BrainSyncCrypto.swift @ ref 2026-11-04
//
// Optional copy of the memory across the student's computers (Macs and PCs share it). Local first: the file on this
// computer is the truth, and a sync run only merges. The graph is split into 16 sealed shards so one blob stays small
// and two computers rarely touch the same one.
//
// End-to-end keys: one random memory key per account, sealed with AES-GCM. Each computer has its own Curve25519 key;
// the memory key travels between computers only wrapped for a computer's public key. The server never sees the
// memory key or the plaintext. The byte layouts are CryptoKit's, so a Mac opens what Windows sealed and back:
//   - a sealed shard: `nonce` (12 bytes) and `ciphertext` (ciphertext ‖ 16-byte tag), each base64;
//   - a wrapped key: ephemeral public key (32 bytes) ‖ nonce ‖ ciphertext ‖ tag, base64, under a key from
//     HKDF-SHA256(X25519 secret, salt "LearnLayer.memory.wrap.v1", info ephemeral ‖ recipient public keys).

import {
  BackendFailure,
  type BlobPutResult,
  type RemoteBlob,
  type RemoteDevice,
  type RemoteDeviceKey,
} from "../ai/backendClient";
import type { MemoryEdge, MemoryNode } from "./memory";

export type BrainSyncError = "corrupt" | "noCurrentDevice" | "conflict" | "tooLarge";

export class BrainSyncFailure extends Error {
  constructor(readonly reason: BrainSyncError) {
    super(reason);
  }
}

// MARK: Bytes

const encoder = new TextEncoder();

export function base64(bytes: Uint8Array): string {
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text);
}

export function fromBase64(text: string): Uint8Array | null {
  try {
    return Uint8Array.from(atob(text), (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

const buffer = (bytes: Uint8Array): ArrayBuffer =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

const subtle = () => globalThis.crypto.subtle;

/** The fixed PKCS #8 header of an X25519 private key (RFC 8410): the 32 raw bytes follow it. */
const pkcs8Header = Uint8Array.from([
  0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x6e, 0x04, 0x22, 0x04, 0x20,
]);

// MARK: Crypto

export interface Sealed {
  nonce: string;
  ciphertext: string;
}

/** A device's X25519 key, kept as CryptoKit's `rawRepresentation` (the 32 private bytes). */
export interface DeviceKey {
  raw: Uint8Array;
}

export const BrainCrypto = {
  wrapInfo: encoder.encode("LearnLayer.memory.wrap.v1"),

  newMemoryKey(): Uint8Array {
    return globalThis.crypto.getRandomValues(new Uint8Array(32));
  },

  async seal(plaintext: Uint8Array, key: Uint8Array): Promise<Sealed> {
    const nonce = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const aes = await subtle().importKey("raw", buffer(key), "AES-GCM", false, ["encrypt"]);
    const body = new Uint8Array(await subtle().encrypt({ name: "AES-GCM", iv: buffer(nonce) }, aes, buffer(plaintext)));
    return { nonce: base64(nonce), ciphertext: base64(body) };
  },

  async open(sealed: Sealed, key: Uint8Array): Promise<Uint8Array> {
    const nonce = fromBase64(sealed.nonce);
    const body = fromBase64(sealed.ciphertext);
    if (!nonce || !body || body.length < 16 || nonce.length !== 12) throw new BrainSyncFailure("corrupt");
    const aes = await subtle().importKey("raw", buffer(key), "AES-GCM", false, ["decrypt"]);
    return new Uint8Array(await subtle().decrypt({ name: "AES-GCM", iv: buffer(nonce) }, aes, buffer(body)));
  },

  async newDeviceKey(): Promise<DeviceKey> {
    const pair = (await subtle().generateKey({ name: "X25519" }, true, ["deriveBits"])) as CryptoKeyPair;
    const pkcs8 = new Uint8Array(await subtle().exportKey("pkcs8", pair.privateKey));
    return { raw: pkcs8.slice(pkcs8.length - 32) };
  },

  async privateKey(device: DeviceKey): Promise<CryptoKey> {
    return subtle().importKey("pkcs8", buffer(concat(pkcs8Header, device.raw)), { name: "X25519" }, true, [
      "deriveBits",
    ]);
  },

  /** The 32 public bytes, CryptoKit's `publicKey.rawRepresentation`. */
  async publicKey(device: DeviceKey): Promise<Uint8Array> {
    const jwk = await subtle().exportKey("jwk", await BrainCrypto.privateKey(device));
    const bytes = fromBase64((jwk.x ?? "").replace(/-/g, "+").replace(/_/g, "/").padEnd(44, "="));
    if (!bytes || bytes.length !== 32) throw new BrainSyncFailure("corrupt");
    return bytes;
  },

  /** Ephemeral public key (32 bytes) ‖ AES-GCM combined, base64. */
  async wrap(memoryKey: Uint8Array, publicKey: string): Promise<string> {
    const recipientRaw = fromBase64(publicKey);
    if (!recipientRaw || recipientRaw.length !== 32) throw new BrainSyncFailure("corrupt");
    const recipient = await subtle().importKey("raw", buffer(recipientRaw), { name: "X25519" }, true, []);
    const ephemeral = await BrainCrypto.newDeviceKey();
    const ephemeralPublic = await BrainCrypto.publicKey(ephemeral);
    const secret = await sharedSecret(await BrainCrypto.privateKey(ephemeral), recipient);
    const kek = await keyEncryptionKey(ephemeralPublic, recipientRaw, secret);
    const nonce = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const aes = await subtle().importKey("raw", buffer(kek), "AES-GCM", false, ["encrypt"]);
    const body = new Uint8Array(await subtle().encrypt({ name: "AES-GCM", iv: buffer(nonce) }, aes, buffer(memoryKey)));
    return base64(concat(ephemeralPublic, nonce, body));
  },

  async unwrap(wrapped: string, device: DeviceKey): Promise<Uint8Array> {
    const data = fromBase64(wrapped);
    if (!data || data.length <= 32 + 12 + 16) throw new BrainSyncFailure("corrupt");
    const ephemeralRaw = data.slice(0, 32);
    const ephemeral = await subtle().importKey("raw", buffer(ephemeralRaw), { name: "X25519" }, true, []);
    const secret = await sharedSecret(await BrainCrypto.privateKey(device), ephemeral);
    const kek = await keyEncryptionKey(ephemeralRaw, await BrainCrypto.publicKey(device), secret);
    const aes = await subtle().importKey("raw", buffer(kek), "AES-GCM", false, ["decrypt"]);
    const raw = new Uint8Array(
      await subtle().decrypt({ name: "AES-GCM", iv: buffer(data.slice(32, 44)) }, aes, buffer(data.slice(44))),
    );
    if (raw.length !== 32) throw new BrainSyncFailure("corrupt");
    return raw;
  },
};

async function sharedSecret(privateKey: CryptoKey, publicKey: CryptoKey): Promise<Uint8Array> {
  return new Uint8Array(await subtle().deriveBits({ name: "X25519", public: publicKey }, privateKey, 256));
}

/** CryptoKit's `hkdfDerivedSymmetricKey(using: SHA256, salt: wrapInfo, sharedInfo: ephemeral ‖ recipient, 32)`. */
async function keyEncryptionKey(ephemeral: Uint8Array, recipient: Uint8Array, secret: Uint8Array): Promise<Uint8Array> {
  const material = await subtle().importKey("raw", buffer(secret), "HKDF", false, ["deriveBits"]);
  return new Uint8Array(
    await subtle().deriveBits(
      { name: "HKDF", hash: "SHA-256", salt: buffer(BrainCrypto.wrapInfo), info: buffer(concat(ephemeral, recipient)) },
      material,
      256,
    ),
  );
}

// MARK: Keys

/** Where the keys live: the Credential Manager in the app, a map in tests. Values are bytes. */
export interface BrainSecretStore {
  read(account: string): Promise<Uint8Array | null>;
  write(account: string, data: Uint8Array | null): Promise<void>;
}

export class InMemoryBrainSecrets implements BrainSecretStore {
  readonly items = new Map<string, Uint8Array>();
  async read(account: string) {
    return this.items.get(account) ?? null;
  }
  async write(account: string, data: Uint8Array | null) {
    if (data) this.items.set(account, data);
    else this.items.delete(account);
  }
}

/** The two keys for one account on this computer. */
export class BrainKeyring {
  constructor(
    readonly store: BrainSecretStore,
    readonly userID: string,
  ) {}

  async deviceKey(): Promise<DeviceKey> {
    const raw = await this.store.read("device." + this.userID);
    if (raw && raw.length === 32) {
      const key = { raw };
      try {
        await BrainCrypto.privateKey(key);
        return key;
      } catch {
        // A damaged key is replaced, as on the Mac.
      }
    }
    const key = await BrainCrypto.newDeviceKey();
    await this.store.write("device." + this.userID, key.raw);
    return key;
  }

  async publicKey(): Promise<string> {
    return base64(await BrainCrypto.publicKey(await this.deviceKey()));
  }

  async memoryKey(): Promise<Uint8Array | null> {
    const raw = await this.store.read("memory." + this.userID);
    return raw && raw.length === 32 ? raw : null;
  }

  async setMemoryKey(key: Uint8Array): Promise<void> {
    await this.store.write("memory." + this.userID, key);
  }

  async forget(): Promise<void> {
    await this.store.write("device." + this.userID, null);
    await this.store.write("memory." + this.userID, null);
  }
}

// MARK: Graph

export interface BrainGraph {
  nodes: MemoryNode[];
  edges: MemoryEdge[];
}

export const emptyGraph = (): BrainGraph => ({ nodes: [], edges: [] });

/** A Mac leaves out an absent `deletedAt` or `weight`; here they are null. */
function normalizedNode(node: MemoryNode): MemoryNode {
  return { ...node, deletedAt: node.deletedAt ?? null };
}

function normalizedEdge(edge: MemoryEdge): MemoryEdge {
  return { ...edge, weight: edge.weight ?? null, deletedAt: edge.deletedAt ?? null };
}

export const BrainMerge = {
  edgeKey: (edge: MemoryEdge) => edge.src + "\u001F" + edge.dst + "\u001F" + edge.type,

  /**
   * The newer change wins; a tie keeps what is here. Tombstones are records too, so a deletion beats an older edit
   * and an edit after a deletion brings the record back.
   */
  merge(local: BrainGraph, remote: BrainGraph): { graph: BrainGraph; changed: number } {
    const stamp = (record: { updatedAt: number; deletedAt?: number | null }) =>
      Math.max(record.updatedAt, record.deletedAt ?? 0);
    let changed = 0;
    const nodes = [...local.nodes];
    const nodeIndex = new Map<string, number>();
    nodes.forEach((node, index) => {
      if (!nodeIndex.has(node.id)) nodeIndex.set(node.id, index);
    });
    for (const node of remote.nodes) {
      const index = nodeIndex.get(node.id);
      if (index !== undefined) {
        if (stamp(node) > stamp(nodes[index]!)) {
          nodes[index] = node;
          changed += 1;
        }
      } else {
        nodeIndex.set(node.id, nodes.length);
        nodes.push(node);
        changed += 1;
      }
    }
    const edges = [...local.edges];
    const edgeIndex = new Map<string, number>();
    edges.forEach((edge, index) => {
      const key = BrainMerge.edgeKey(edge);
      if (!edgeIndex.has(key)) edgeIndex.set(key, index);
    });
    for (const edge of remote.edges) {
      const key = BrainMerge.edgeKey(edge);
      const index = edgeIndex.get(key);
      if (index !== undefined) {
        if (stamp(edge) > stamp(edges[index]!)) {
          edges[index] = edge;
          changed += 1;
        }
      } else {
        edgeIndex.set(key, edges.length);
        edges.push(edge);
        changed += 1;
      }
    }
    return { graph: { nodes, edges }, changed };
  },
};

/** Swift's `<` on these ASCII ids: by UTF-16 code unit, as JavaScript compares. */
const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** JSON with sorted keys and no absent optionals, as Swift's `JSONEncoder` with `.sortedKeys` writes it. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== null && item !== undefined)
      .sort(([a], [b]) => byText(a, b));
    return "{" + entries.map(([key, item]) => JSON.stringify(key) + ":" + canonical(item)).join(",") + "}";
  }
  return JSON.stringify(value);
}

export const BrainShards = {
  count: 16,
  prefix: "memoria-",

  id: (index: number) => BrainShards.prefix + index.toString(16).padStart(2, "0"),

  /** FNV-1a, so every computer puts a node in the same shard. */
  index(key: string): number {
    let hash = 2_166_136_261;
    for (const byte of encoder.encode(key)) hash = Math.imul(hash ^ byte, 16_777_619) >>> 0;
    return hash % BrainShards.count;
  },

  /** An edge rides with its source node. */
  split(graph: BrainGraph): Map<string, BrainGraph> {
    const out = new Map<string, BrainGraph>();
    const shard = (key: string) => {
      const id = BrainShards.id(BrainShards.index(key));
      const part = out.get(id) ?? emptyGraph();
      out.set(id, part);
      return part;
    };
    for (const node of graph.nodes) shard(node.id).nodes.push(node);
    for (const edge of graph.edges) shard(edge.src).edges.push(edge);
    return out;
  },

  /** Sorted keys and sorted records, so the same content always gives the same bytes. */
  encode(graph: BrainGraph): Uint8Array {
    const sorted = {
      nodes: [...graph.nodes].sort((a, b) => byText(a.id, b.id)),
      edges: [...graph.edges].sort((a, b) => byText(BrainMerge.edgeKey(a), BrainMerge.edgeKey(b))),
    };
    return encoder.encode(canonical(sorted));
  },

  async digest(data: Uint8Array): Promise<string> {
    const hash = new Uint8Array(await subtle().digest("SHA-256", buffer(data)));
    return [...hash].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  },

  /** A shard as a computer wrote it; null when it isn't a graph. */
  decode(plain: Uint8Array): BrainGraph | null {
    try {
      const json = JSON.parse(new TextDecoder().decode(plain)) as Partial<BrainGraph>;
      if (!Array.isArray(json.nodes) || !Array.isArray(json.edges)) return null;
      return { nodes: json.nodes.map(normalizedNode), edges: json.edges.map(normalizedEdge) };
    } catch {
      return null;
    }
  },
};

const graphsEqual = (a: BrainGraph, b: BrainGraph) =>
  canonical({ nodes: a.nodes, edges: a.edges }) === canonical({ nodes: b.nodes, edges: b.edges });

// MARK: Engine

/** What this computer last agreed with the server, per shard. `lastSync` in Unix seconds. */
export interface BrainSyncState {
  userID: string;
  versions: Record<string, number>;
  digests: Record<string, string>;
  lastSync: number | null;
}

export const freshSyncState = (userID = ""): BrainSyncState => ({ userID, versions: {}, digests: {}, lastSync: null });

export interface BrainSyncStateStore {
  load(): BrainSyncState;
  save(state: BrainSyncState): void;
}

export class InMemoryBrainSyncState implements BrainSyncStateStore {
  state = freshSyncState();
  load() {
    return structuredClone(this.state);
  }
  save(state: BrainSyncState) {
    this.state = structuredClone(state);
  }
}

/** The server side of a sync run: the live API in the app, a fake in tests. */
export interface BrainSyncBackend {
  devices(): Promise<RemoteDevice[]>;
  memoryKeys(): Promise<RemoteDeviceKey[]>;
  putMemoryKey(key: RemoteDeviceKey): Promise<void>;
  memoryBlobs(): Promise<RemoteBlob[]>;
  putMemoryBlob(
    id: string,
    expectedVersion: number,
    keyVersion: number,
    nonce: string,
    ciphertext: string,
  ): Promise<BlobPutResult>;
}

export interface BrainGraphStore {
  syncGraph(): BrainGraph;
  mergeSynced(remote: BrainGraph): number;
}

export type BrainSyncOutcome =
  | { kind: "synced"; pulled: number; pushed: number }
  /** This computer is registered but no other one has shared the key yet. */
  | { kind: "waitingForKey" }
  | { kind: "offline" }
  | { kind: "signedOut" }
  | { kind: "failed" };

/** A network failure (no answer at all), as opposed to a server that said no. The live backend throws it. */
export class OfflineFailure extends Error {}

export class BrainSyncEngine {
  static readonly keyVersion = 1;
  static readonly maxShardBytes = 900_000;
  readonly maxAttempts = 3;

  constructor(
    readonly backend: BrainSyncBackend,
    readonly graph: BrainGraphStore,
    readonly keyring: BrainKeyring,
    readonly state: BrainSyncStateStore,
  ) {}

  async run(now: number = Date.now() / 1000): Promise<BrainSyncOutcome> {
    try {
      const key = await this.ensureKey();
      if (!key) return { kind: "waitingForKey" };
      return await this.syncShards(key, now);
    } catch (error) {
      if (error instanceof OfflineFailure) return { kind: "offline" };
      if (error instanceof BackendFailure && error.status === 401) return { kind: "signedOut" };
      return { kind: "failed" };
    }
  }

  // MARK: Keys

  /** The memory key, or null while this computer waits for another one to share it. */
  async ensureKey(): Promise<Uint8Array | null> {
    const keyVersion = BrainSyncEngine.keyVersion;
    const devices = await this.backend.devices();
    const me = devices.find((device) => device.current && !device.revoked);
    if (!me) throw new BrainSyncFailure("noCurrentDevice");
    const active = new Set(devices.filter((device) => !device.revoked).map((device) => device.id));
    const keys = (await this.backend.memoryKeys()).filter(
      (key) => key.keyVersion === keyVersion && active.has(key.deviceId),
    );
    const mine = keys.find((key) => key.deviceId === me.id);
    const publicKey = await this.keyring.publicKey();

    let memoryKey = await this.keyring.memoryKey();
    if (!memoryKey && mine && mine.publicKey === publicKey && mine.wrappedKey) {
      memoryKey = await BrainCrypto.unwrap(mine.wrappedKey, await this.keyring.deviceKey()).catch(() => null);
      if (memoryKey) await this.keyring.setMemoryKey(memoryKey);
    }
    if (!memoryKey) {
      const someoneHasIt = keys.some((key) => key.deviceId !== me.id && key.wrappedKey);
      if (someoneHasIt) {
        if (mine?.publicKey !== publicKey || mine?.wrappedKey) {
          await this.backend.putMemoryKey({ deviceId: me.id, keyVersion, publicKey, wrappedKey: null });
        }
        return null;
      }
      memoryKey = BrainCrypto.newMemoryKey();
      await this.keyring.setMemoryKey(memoryKey);
    }

    if (mine?.publicKey !== publicKey || !mine?.wrappedKey) {
      const wrapped = await BrainCrypto.wrap(memoryKey, publicKey);
      await this.backend.putMemoryKey({ deviceId: me.id, keyVersion, publicKey, wrappedKey: wrapped });
    }
    // Share with the account's other active computers that are still waiting.
    for (const waiting of keys) {
      if (waiting.deviceId === me.id || waiting.wrappedKey) continue;
      const wrapped = await BrainCrypto.wrap(memoryKey, waiting.publicKey).catch(() => null);
      if (!wrapped) continue;
      await this.backend.putMemoryKey({
        deviceId: waiting.deviceId,
        keyVersion,
        publicKey: waiting.publicKey,
        wrappedKey: wrapped,
      });
    }
    return memoryKey;
  }

  // MARK: Shards

  private async syncShards(key: Uint8Array, now: number): Promise<BrainSyncOutcome> {
    let saved = this.state.load();
    if (saved.userID !== this.keyring.userID) saved = freshSyncState(this.keyring.userID);
    let pulled = 0;
    let pushed = 0;
    let remote = await this.remoteShards();
    const remoteDigests = new Map<string, string>();

    for (const [id, blob] of remote) {
      if (saved.versions[id] === blob.version) continue;
      const decoded = await this.decode(blob, key);
      if (decoded) {
        pulled += this.graph.mergeSynced(decoded.graph);
        remoteDigests.set(id, decoded.digest);
      }
    }

    for (let index = 0; index < BrainShards.count; index += 1) {
      const id = BrainShards.id(index);
      let attempt = 0;
      for (;;) {
        attempt += 1;
        const part = BrainShards.split(this.graph.syncGraph()).get(id) ?? emptyGraph();
        const plain = BrainShards.encode(part);
        const digest = await BrainShards.digest(plain);
        const remoteVersion = remote.get(id)?.version ?? 0;
        if (graphsEqual(part, emptyGraph()) && !remote.has(id)) break;
        if (
          remoteDigests.get(id) === digest ||
          (saved.digests[id] === digest && saved.versions[id] === remoteVersion)
        ) {
          saved.versions[id] = remoteVersion;
          saved.digests[id] = digest;
          break;
        }
        if (plain.length > BrainSyncEngine.maxShardBytes) throw new BrainSyncFailure("tooLarge");
        const sealed = await BrainCrypto.seal(plain, key);
        const result = await this.backend.putMemoryBlob(
          id,
          remoteVersion,
          BrainSyncEngine.keyVersion,
          sealed.nonce,
          sealed.ciphertext,
        );
        if (result.kind === "stored") {
          saved.versions[id] = result.version;
          saved.digests[id] = digest;
          pushed += 1;
          break;
        }
        if (attempt >= this.maxAttempts) throw new BrainSyncFailure("conflict");
        remote = await this.remoteShards();
        const blob = remote.get(id);
        const decoded = blob ? await this.decode(blob, key) : null;
        if (decoded) {
          pulled += this.graph.mergeSynced(decoded.graph);
          remoteDigests.set(id, decoded.digest);
        }
      }
    }
    saved.lastSync = now;
    this.state.save(saved);
    return { kind: "synced", pulled, pushed };
  }

  private async remoteShards(): Promise<Map<string, RemoteBlob>> {
    const out = new Map<string, RemoteBlob>();
    for (const blob of await this.backend.memoryBlobs()) {
      if (blob.id.startsWith(BrainShards.prefix) && !out.has(blob.id)) out.set(blob.id, blob);
    }
    return out;
  }

  /** A shard sealed with a key this computer doesn't hold is skipped and later overwritten. */
  private async decode(blob: RemoteBlob, key: Uint8Array): Promise<{ graph: BrainGraph; digest: string } | null> {
    if (blob.keyVersion !== BrainSyncEngine.keyVersion) return null;
    try {
      const plain = await BrainCrypto.open({ nonce: blob.nonce, ciphertext: blob.ciphertext }, key);
      const graph = BrainShards.decode(plain);
      if (!graph) return null;
      return { graph, digest: await BrainShards.digest(BrainShards.encode(graph)) };
    } catch {
      return null;
    }
  }
}

// MARK: Controller

export type BrainSyncStatus =
  | { kind: "off" }
  | { kind: "idle" }
  | { kind: "syncing" }
  | { kind: "synced"; at: number }
  | { kind: "waitingForKey" }
  | { kind: "offline" }
  | { kind: "signedOut" }
  | { kind: "failed" };

export interface BrainSyncControllerServices {
  makeBackend(): BrainSyncBackend;
  secrets: BrainSecretStore;
  stateStore: BrainSyncStateStore;
  graph: BrainGraphStore;
  userID(): Promise<string | null>;
  isEnabled(): boolean;
}

/** Runs the engine when the student has opted in and is signed in. Never otherwise. */
export class BrainSyncController {
  status: BrainSyncStatus = { kind: "off" };
  private running = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(readonly services: BrainSyncControllerServices) {
    const last = services.stateStore.load().lastSync;
    if (last !== null) this.status = { kind: "synced", at: last };
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private set(status: BrainSyncStatus) {
    this.status = status;
    for (const listener of [...this.listeners]) listener();
  }

  /** Called once at launch. A sync every 15 minutes while opted in. */
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.syncNow(), 15 * 60 * 1000);
    void this.syncNow();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async syncNow(): Promise<BrainSyncOutcome | null> {
    if (!this.services.isEnabled()) {
      this.set({ kind: "off" });
      return null;
    }
    const userID = await this.services.userID();
    if (!userID) {
      this.set({ kind: "signedOut" });
      return { kind: "signedOut" };
    }
    if (this.running) return null;
    this.running = true;
    this.set({ kind: "syncing" });
    try {
      const engine = new BrainSyncEngine(
        this.services.makeBackend(),
        this.services.graph,
        new BrainKeyring(this.services.secrets, userID),
        this.services.stateStore,
      );
      const outcome = await engine.run();
      if (outcome.kind === "synced")
        this.set({ kind: "synced", at: this.services.stateStore.load().lastSync ?? Date.now() / 1000 });
      else this.set({ kind: outcome.kind });
      return outcome;
    } finally {
      this.running = false;
    }
  }

  /** The account is gone; its keys are useless and should not linger. */
  async forget(userID: string): Promise<void> {
    await new BrainKeyring(this.services.secrets, userID).forget();
    this.services.stateStore.save(freshSyncState());
    this.set(this.services.isEnabled() ? { kind: "idle" } : { kind: "off" });
  }
}
