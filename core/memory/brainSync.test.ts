// Port of LearnLayerTests/BrainSyncTests.swift @ ref 2026-11-04, with the same cases. Plus checks that the byte
// layouts are CryptoKit's (so a Mac opens what Windows sealed) and the X25519 test vector of RFC 7748.

import { describe, expect, it } from "vitest";
import type { BlobPutResult, RemoteBlob, RemoteDevice, RemoteDeviceKey } from "../ai/backendClient";
import {
  base64,
  BrainCrypto,
  BrainKeyring,
  BrainMerge,
  BrainShards,
  BrainSyncController,
  BrainSyncEngine,
  emptyGraph,
  fromBase64,
  InMemoryBrainSecrets,
  InMemoryBrainSyncState,
  OfflineFailure,
  type BrainGraph,
  type BrainGraphStore,
  type BrainSyncBackend,
} from "./brainSync";
import { MemoryStore, type MemoryEdge, type MemoryNode } from "./memory";

/** One account on a pretend server, with the same version rules as `PUT /v1/memory/blobs/:id`. */
class FakeBrainServer {
  devices: RemoteDevice[] = [];
  keys = new Map<string, RemoteDeviceKey>();
  blobs = new Map<string, RemoteBlob>();
  offline = false;
  calls = 0;
  /** Runs before a blob PUT, to let another computer write in between. */
  beforePut: ((id: string) => Promise<void>) | null = null;

  addDevice(id: string) {
    this.devices.push({ id, name: id, createdAt: new Date(), lastSeenAt: null, revoked: false, current: false });
  }
}

class FakeBrainBackend implements BrainSyncBackend {
  constructor(
    readonly server: FakeBrainServer,
    readonly deviceID: string,
  ) {}

  private gate() {
    this.server.calls += 1;
    if (this.server.offline) throw new OfflineFailure("offline");
  }

  async devices() {
    this.gate();
    return this.server.devices.map((device) => ({ ...device, current: device.id === this.deviceID }));
  }

  async memoryKeys() {
    this.gate();
    return [...this.server.keys.values()].sort((a, b) => (a.deviceId < b.deviceId ? -1 : 1));
  }

  async putMemoryKey(key: RemoteDeviceKey) {
    this.gate();
    this.server.keys.set(key.deviceId, key);
  }

  async memoryBlobs() {
    this.gate();
    return [...this.server.blobs.values()];
  }

  async putMemoryBlob(
    id: string,
    expectedVersion: number,
    keyVersion: number,
    nonce: string,
    ciphertext: string,
  ): Promise<BlobPutResult> {
    this.gate();
    const hook = this.server.beforePut;
    if (hook) {
      this.server.beforePut = null;
      await hook(id);
    }
    const current = this.server.blobs.get(id)?.version ?? 0;
    if (current !== expectedVersion) return { kind: "conflict", currentVersion: current };
    this.server.blobs.set(id, { id, version: current + 1, keyVersion, nonce, ciphertext });
    return { kind: "stored", version: current + 1 };
  }
}

class FakeGraph implements BrainGraphStore {
  graph: BrainGraph = emptyGraph();
  syncGraph() {
    return this.graph;
  }
  mergeSynced(remote: BrainGraph) {
    const merged = BrainMerge.merge(this.graph, remote);
    this.graph = merged.graph;
    return merged.changed;
  }
}

class FakeMac {
  readonly graph = new FakeGraph();
  readonly secrets = new InMemoryBrainSecrets();
  readonly state = new InMemoryBrainSyncState();
  readonly backend: FakeBrainBackend;

  constructor(id: string, server: FakeBrainServer) {
    server.addDevice(id);
    this.backend = new FakeBrainBackend(server, id);
  }

  get engine() {
    return new BrainSyncEngine(this.backend, this.graph, new BrainKeyring(this.secrets, "u1"), this.state);
  }
}

const node = (id: string, data: string, stamp: number, deleted: number | null = null): MemoryNode => ({
  id,
  kind: "concept",
  data,
  createdAt: 1,
  updatedAt: stamp,
  deletedAt: deleted,
});

const edge = (src: string, dst: string, stamp: number, deleted: number | null = null): MemoryEdge => ({
  src,
  dst,
  type: "prereq",
  weight: 1,
  source: "test",
  updatedAt: stamp,
  deletedAt: deleted,
});

const bytes = (text: string) => new TextEncoder().encode(text);
const contains = (haystack: Uint8Array, needle: Uint8Array) => Buffer.from(haystack).indexOf(Buffer.from(needle)) >= 0;
const hex = (text: string) => Uint8Array.from(text.match(/../g)!.map((pair) => parseInt(pair, 16)));

describe("BrainSync", () => {
  it("seal opens only with the same key and hides the plaintext", async () => {
    const key = BrainCrypto.newMemoryKey();
    const plain = bytes("derivadas da função composta");
    const sealed = await BrainCrypto.seal(plain, key);
    expect(await BrainCrypto.open(sealed, key)).toEqual(plain);
    expect(contains(fromBase64(sealed.ciphertext)!, bytes("derivadas"))).toBe(false);
    await expect(BrainCrypto.open(sealed, BrainCrypto.newMemoryKey())).rejects.toThrow();
    const tampered = { ...sealed, nonce: base64(new Uint8Array(12)) };
    await expect(BrainCrypto.open(tampered, key)).rejects.toThrow();
  });

  it("a wrapped key opens only for its device", async () => {
    const memory = BrainCrypto.newMemoryKey();
    const mac = await BrainCrypto.newDeviceKey();
    const other = await BrainCrypto.newDeviceKey();
    const wrapped = await BrainCrypto.wrap(memory, base64(await BrainCrypto.publicKey(mac)));
    expect(await BrainCrypto.unwrap(wrapped, mac)).toEqual(memory);
    await expect(BrainCrypto.unwrap(wrapped, other)).rejects.toThrow();
  });

  it("keyring keeps the device key per account", async () => {
    const secrets = new InMemoryBrainSecrets();
    const first = new BrainKeyring(secrets, "u1");
    expect(await first.publicKey()).toBe(await first.publicKey());
    expect(await new BrainKeyring(secrets, "u2").publicKey()).not.toBe(await first.publicKey());
    await first.setMemoryKey(BrainCrypto.newMemoryKey());
    expect(await first.memoryKey()).not.toBeNull();
    await first.forget();
    expect(await first.memoryKey()).toBeNull();
    expect([...secrets.items.keys()].every((account) => !account.endsWith(".u1"))).toBe(true);
  });

  it("merge keeps the newer change and tombstones", () => {
    const local: BrainGraph = { nodes: [node("a", "here", 5), node("b", "old", 1)], edges: [edge("a", "b", 5)] };
    const remote: BrainGraph = {
      nodes: [node("a", "there", 3), node("b", "gone", 1, 9), node("c", "new", 2)],
      edges: [edge("a", "b", 4, 4), edge("b", "c", 2)],
    };
    const merged = BrainMerge.merge(local, remote);
    expect(merged.graph.nodes.map((item) => item.id)).toEqual(["a", "b", "c"]);
    expect(merged.graph.nodes[0]!.data).toBe("here");
    expect(merged.graph.nodes[1]!.deletedAt).toBe(9);
    expect(merged.graph.edges.find((item) => item.src === "a")?.deletedAt).toBeNull();
    expect(merged.graph.edges.length).toBe(2);
    expect(merged.changed).toBe(3);
    expect(BrainMerge.merge(merged.graph, remote).changed).toBe(0);
  });

  it("shards are stable and carry edges with their source", () => {
    const graph: BrainGraph = {
      nodes: Array.from({ length: 40 }, (_, index) => node(`n${index}`, "x", 1)),
      edges: [edge("n1", "n2", 1)],
    };
    const shards = BrainShards.split(graph);
    expect([...shards.values()].reduce((sum, part) => sum + part.nodes.length, 0)).toBe(40);
    expect(shards.size).toBeGreaterThan(1);
    const home = BrainShards.id(BrainShards.index("n1"));
    expect(shards.get(home)?.edges.length).toBe(1);
    const shuffled: BrainGraph = { nodes: [...graph.nodes].reverse(), edges: graph.edges };
    expect(BrainShards.encode(shards.get(home)!)).toEqual(BrainShards.encode(BrainShards.split(shuffled).get(home)!));
  });

  it("two computers converge and the server sees only ciphertext", async () => {
    const server = new FakeBrainServer();
    const first = new FakeMac("mac-a", server);
    first.graph.graph = { nodes: [node("limites", "Limites laterais", 10)], edges: [] };
    expect(await first.engine.run()).toEqual({ kind: "synced", pulled: 0, pushed: 1 });
    expect(server.keys.get("mac-a")?.wrappedKey).toBeTruthy();
    for (const blob of server.blobs.values()) {
      expect(contains(fromBase64(blob.ciphertext)!, bytes("Limites"))).toBe(false);
    }

    const second = new FakeMac("pc-b", server);
    second.graph.graph = { nodes: [node("vetores", "Vetores", 11)], edges: [] };
    expect(await second.engine.run()).toEqual({ kind: "waitingForKey" });
    expect(second.graph.graph.nodes.length).toBe(1);
    expect(server.keys.get("pc-b")?.wrappedKey ?? null).toBeNull();

    // The first shares the key on its next run; then the second can read and write.
    await first.engine.run();
    expect(server.keys.get("pc-b")?.wrappedKey).toBeTruthy();
    expect((await second.engine.run()).kind).toBe("synced");
    await first.engine.run();
    expect(new Set(first.graph.graph.nodes.map((item) => item.id))).toEqual(new Set(["limites", "vetores"]));
    expect(new Set(second.graph.graph.nodes.map((item) => item.id))).toEqual(new Set(["limites", "vetores"]));

    // A deletion travels too.
    second.graph.graph = {
      ...second.graph.graph,
      nodes: second.graph.graph.nodes.map((item) =>
        item.id === "limites" ? node("limites", "Limites laterais", 10, 20) : item,
      ),
    };
    await second.engine.run();
    await first.engine.run();
    expect(first.graph.graph.nodes.find((item) => item.id === "limites")?.deletedAt).toBe(20);
  });

  it("nothing changed means no upload", async () => {
    const server = new FakeBrainServer();
    const mac = new FakeMac("mac-a", server);
    mac.graph.graph = { nodes: [node("a", "x", 1)], edges: [] };
    await mac.engine.run();
    expect(await mac.engine.run()).toEqual({ kind: "synced", pulled: 0, pushed: 0 });
  });

  it("a conflict is merged and retried", async () => {
    const server = new FakeBrainServer();
    const first = new FakeMac("mac-a", server);
    const second = new FakeMac("mac-b", server);
    first.graph.graph = { nodes: [node("a", "base", 1)], edges: [] };
    await first.engine.run();
    await second.engine.run();
    await first.engine.run();
    await second.engine.run();
    expect(second.graph.graph.nodes.map((item) => item.id)).toEqual(["a"]);

    // Same shard on both: "a" edited on the first, a node in "a"'s shard added on the second.
    const shard = BrainShards.index("a");
    const sibling = Array.from({ length: 500 }, (_, index) => `s${index}`).find(
      (id) => BrainShards.index(id) === shard && id !== "a",
    )!;
    first.graph.graph = { nodes: [node("a", "edited", 5)], edges: [] };
    second.graph.graph = { ...second.graph.graph, nodes: [...second.graph.graph.nodes, node(sibling, "added", 6)] };
    await first.engine.run();
    expect((await second.engine.run()).kind).toBe("synced");
    await first.engine.run();
    expect(new Set(first.graph.graph.nodes.map((item) => item.id))).toEqual(new Set(["a", sibling]));
    expect(first.graph.graph.nodes.find((item) => item.id === "a")?.data).toBe("edited");
    expect(second.graph.graph.nodes.find((item) => item.id === "a")?.data).toBe("edited");
  });

  it("a stale write gets 409 then succeeds", async () => {
    const server = new FakeBrainServer();
    const first = new FakeMac("mac-a", server);
    const second = new FakeMac("mac-b", server);
    await first.engine.run();
    await second.engine.run();
    await first.engine.run();
    await second.engine.run();
    second.graph.graph = { nodes: [node("a", "from b", 3)], edges: [] };
    const shardID = BrainShards.id(BrainShards.index("a"));
    // Another computer bumps the same shard right before this PUT.
    server.beforePut = async (id) => {
      const key = (await new BrainKeyring(first.secrets, "u1").memoryKey())!;
      const other: BrainGraph = { nodes: [node("a", "from a", 2)], edges: [] };
      const sealed = await BrainCrypto.seal(BrainShards.encode(other), key);
      const version = (server.blobs.get(id)?.version ?? 0) + 1;
      server.blobs.set(id, { id, version, keyVersion: 1, nonce: sealed.nonce, ciphertext: sealed.ciphertext });
    };
    expect(await second.engine.run()).toEqual({ kind: "synced", pulled: 0, pushed: 1 });
    expect(server.blobs.get(shardID)?.version).toBe(2);
    await first.engine.run();
    expect(first.graph.graph.nodes[0]?.data).toBe("from b");
  });

  it("offline keeps local memory untouched", async () => {
    const server = new FakeBrainServer();
    const mac = new FakeMac("mac-a", server);
    mac.graph.graph = { nodes: [node("a", "x", 1)], edges: [] };
    server.offline = true;
    expect(await mac.engine.run()).toEqual({ kind: "offline" });
    expect(mac.graph.graph.nodes.length).toBe(1);
    expect(mac.state.state.lastSync).toBeNull();
    server.offline = false;
    expect(await mac.engine.run()).toEqual({ kind: "synced", pulled: 0, pushed: 1 });
  });

  it("a revoked computer gets no key", async () => {
    const server = new FakeBrainServer();
    const first = new FakeMac("mac-a", server);
    await first.engine.run();
    server.keys.set("gone", {
      deviceId: "gone",
      keyVersion: 1,
      publicKey: await new BrainKeyring(new InMemoryBrainSecrets(), "x").publicKey(),
      wrappedKey: null,
    });
    server.devices.push({
      id: "gone",
      name: "gone",
      createdAt: new Date(),
      lastSeenAt: null,
      revoked: true,
      current: false,
    });
    await first.engine.run();
    expect(server.keys.get("gone")?.wrappedKey ?? null).toBeNull();
  });

  it("the controller does nothing until the student opts in", async () => {
    const server = new FakeBrainServer();
    server.addDevice("mac-a");
    let enabled = false;
    let user: string | null = "u1";
    const controller = new BrainSyncController({
      makeBackend: () => new FakeBrainBackend(server, "mac-a"),
      secrets: new InMemoryBrainSecrets(),
      stateStore: new InMemoryBrainSyncState(),
      graph: new FakeGraph(),
      userID: async () => user,
      isEnabled: () => enabled,
    });
    expect(await controller.syncNow()).toBeNull();
    expect(server.calls).toBe(0);
    expect(controller.status).toEqual({ kind: "off" });

    enabled = true;
    user = null;
    expect(await controller.syncNow()).toEqual({ kind: "signedOut" });
    expect(server.calls).toBe(0);

    user = "u1";
    expect((await controller.syncNow())?.kind).toBe("synced");
    expect(controller.status.kind).toBe("synced");
  });

  it("the memory store's merge is local first", () => {
    const store = MemoryStore.inMemory();
    expect(store.syncGraph()).toEqual(emptyGraph());
    const changed = store.mergeSynced({ nodes: [node("a", "x", 1)], edges: [edge("a", "b", 1)] });
    expect(changed).toBe(2);
    expect(store.syncGraph().nodes.map((item) => item.id)).toEqual(["a"]);
    expect(store.mergeSynced({ nodes: [node("a", "older", 0)], edges: [] })).toBe(0);
  });
});

describe("Byte layouts shared with the Mac", () => {
  it("X25519 matches the RFC 7748 test vector", async () => {
    // Alice's private key and Bob's public key from RFC 7748, section 6.1, and their shared secret.
    const alice = { raw: hex("77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a") };
    expect(Buffer.from(await BrainCrypto.publicKey(alice)).toString("hex")).toBe(
      "8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a",
    );
    const bob = await crypto.subtle.importKey(
      "raw",
      hex("de9edb7d7b7dc1b4d35b61c2ece435373f8343c85b78674dadfc7e146f882b4f"),
      { name: "X25519" },
      true,
      [],
    );
    const secret = new Uint8Array(
      await crypto.subtle.deriveBits({ name: "X25519", public: bob }, await BrainCrypto.privateKey(alice), 256),
    );
    expect(Buffer.from(secret).toString("hex")).toBe(
      "4a5d9d5ba4ce2de1728e3bf480350f25e07e21c947d19e3376f09b3c1e161742",
    );
  });

  it("a wrapped key is the ephemeral public key, then nonce, ciphertext and tag", async () => {
    const device = await BrainCrypto.newDeviceKey();
    const wrapped = fromBase64(
      await BrainCrypto.wrap(BrainCrypto.newMemoryKey(), base64(await BrainCrypto.publicKey(device))),
    )!;
    // 32 (X25519 public) + 12 (nonce) + 32 (memory key) + 16 (tag): CryptoKit's `publicKey ‖ box.combined`.
    expect(wrapped.length).toBe(92);
  });

  it("a sealed shard keeps the nonce apart and the tag after the ciphertext", async () => {
    const sealed = await BrainCrypto.seal(bytes("abc"), BrainCrypto.newMemoryKey());
    expect(fromBase64(sealed.nonce)!.length).toBe(12);
    expect(fromBase64(sealed.ciphertext)!.length).toBe(3 + 16);
  });

  it("a shard written by a Mac (no deletedAt, slashes escaped) is read", () => {
    const fromMac = bytes(
      '{"edges":[{"dst":"b","source":"memory","src":"a","type":"asked_about","updatedAt":5}],' +
        '"nodes":[{"createdAt":1,"data":"{\\"name\\":\\"1\\/2\\"}","id":"a","kind":"concept","updatedAt":5}]}',
    );
    const graph = BrainShards.decode(fromMac)!;
    expect(graph.nodes[0]).toEqual({
      id: "a",
      kind: "concept",
      data: '{"name":"1/2"}',
      createdAt: 1,
      updatedAt: 5,
      deletedAt: null,
    });
    expect(graph.edges[0]?.weight).toBeNull();
    expect(new TextDecoder().decode(BrainShards.encode(graph))).toBe(
      '{"edges":[{"dst":"b","source":"memory","src":"a","type":"asked_about","updatedAt":5}],' +
        '"nodes":[{"createdAt":1,"data":"{\\"name\\":\\"1/2\\"}","id":"a","kind":"concept","updatedAt":5}]}',
    );
  });

  it("shard ids and the shard of a key are the Mac's", () => {
    expect(BrainShards.id(0)).toBe("memoria-00");
    expect(BrainShards.id(15)).toBe("memoria-0f");
    // FNV-1a of "" is the offset basis; of "a" is 0xe40c292c.
    expect(BrainShards.index("")).toBe(2_166_136_261 % 16);
    expect(BrainShards.index("a")).toBe(0xe40c292c % 16);
  });
});
