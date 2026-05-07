/**
 * WOLFPAK AI — P2P Mesh Network
 * libp2p-based mesh for pack communication
 */
import { createLibp2p, Libp2p } from 'libp2p';
import { tcp } from '@libp2p/tcp';
import { noise } from '@chainsafe/libp2p-noise';
import { mplex } from '@libp2p/mplex';
import { mdns } from '@libp2p/mdns';
import { gossipsub } from '@chainsafe/libp2p-gossipsub';
import { kadDHT } from '@libp2p/kad-dht';
import { identify } from '@libp2p/identify';
import { ping } from '@libp2p/ping';
import { loadPack, savePack, type PackConfig, type PackMember } from '../core/pack.js';
import { loadIdentity } from '../core/identity.js';

const WOLFPAK_PROTOCOL = '/wolfpak/1.0.0';
const PACK_TOPIC = 'wolfpak-pack-sync';

let node: Libp2p | null = null;

export interface MeshCallbacks {
  onPeerJoin?: (peerId: string) => void;
  onPeerLeave?: (peerId: string) => void;
  onInferenceRequest?: (req: any) => Promise<any>;
  onPackSync?: (pack: PackConfig) => void;
}

/**
 * Start the libp2p mesh node
 */
export async function startMesh(port: number = 4002, callbacks: MeshCallbacks = {}): Promise<Libp2p> {
  const identity = loadIdentity();
  if (!identity) throw new Error('No identity found. Run wolfpak init first.');

  node = await createLibp2p({
    addresses: {
      listen: [`/ip4/0.0.0.0/tcp/${port}`],
    },
    transports: [tcp()],
    connectionEncrypters: [noise()],
    streamMuxers: [mplex()],
    peerDiscovery: [
      mdns({
        interval: 10000,
      }),
    ],
    services: {
      pubsub: gossipsub({
        emitSelf: false,
        allowPublishToZeroTopicPeers: true,
      }),
      dht: kadDHT({
        clientMode: false,
      }),
      identify: identify(),
      ping: ping(),
    } as any,
  });

  await node.start();

  // Subscribe to pack sync topic
  const pubsub = node.services.pubsub as any;
  pubsub.subscribe(PACK_TOPIC);

  pubsub.addEventListener('message', (evt: any) => {
    if (evt.detail.topic === PACK_TOPIC) {
      try {
        const data = JSON.parse(new TextDecoder().decode(evt.detail.data));
        handlePackMessage(data, callbacks);
      } catch (e) {
        console.error('[mesh] Failed to parse pack message:', e);
      }
    }
  });

  // Peer discovery events
  node.addEventListener('peer:connect', (evt: any) => {
    const remotePeer = evt.detail.toString();
    console.log(`[mesh] Peer connected: ${remotePeer}`);
    callbacks.onPeerJoin?.(remotePeer);

    // Announce ourselves to the pack
    announcePresence();
  });

  node.addEventListener('peer:disconnect', (evt: any) => {
    const remotePeer = evt.detail.toString();
    console.log(`[mesh] Peer disconnected: ${remotePeer}`);
    callbacks.onPeerLeave?.(remotePeer);
  });

  console.log(`[mesh] Node started. Listening on port ${port}`);
  console.log(`[mesh] PeerId: ${node.peerId.toString()}`);

  const addrs = node.getMultiaddrs();
  for (const addr of addrs) {
    console.log(`[mesh] Address: ${addr.toString()}`);
  }

  return node;
}

/**
 * Stop the mesh node
 */
export async function stopMesh(): Promise<void> {
  if (node) {
    await node.stop();
    node = null;
    console.log('[mesh] Node stopped.');
  }
}

/**
 * Get the running mesh node
 */
export function getMesh(): Libp2p | null {
  return node;
}

/**
 * Broadcast a message to the pack
 */
export async function broadcastToPack(type: string, payload: any): Promise<void> {
  if (!node) throw new Error('Mesh not started');
  const pubsub = node.services.pubsub as any;
  const identity = loadIdentity();

  const message = JSON.stringify({
    type,
    from: identity?.peerId,
    timestamp: Date.now(),
    payload,
  });

  await pubsub.publish(PACK_TOPIC, new TextEncoder().encode(message));
}

/**
 * Announce this node's presence and capabilities
 */
export async function announcePresence(): Promise<void> {
  const pack = loadPack();
  const identity = loadIdentity();
  if (!pack || !identity) return;

  const self = pack.members.find((m) => m.peerId === identity.peerId);
  if (!self) return;

  await broadcastToPack('presence', {
    peerId: identity.peerId,
    displayName: identity.displayName,
    capabilities: self.capabilities,
    packId: pack.packId,
  });
}

/**
 * Request inference from the pack network
 */
export async function requestInference(prompt: string, model?: string): Promise<string> {
  if (!node) throw new Error('Mesh not started');

  return new Promise((resolve, reject) => {
    const requestId = Date.now().toString(36) + Math.random().toString(36).slice(2);
    const timeout = setTimeout(() => reject(new Error('Inference request timed out')), 30000);

    const pubsub = node!.services.pubsub as any;

    const handler = (evt: any) => {
      if (evt.detail.topic === PACK_TOPIC) {
        try {
          const data = JSON.parse(new TextDecoder().decode(evt.detail.data));
          if (data.type === 'inference-response' && data.payload.requestId === requestId) {
            clearTimeout(timeout);
            pubsub.removeEventListener('message', handler);
            resolve(data.payload.response);
          }
        } catch {}
      }
    };

    pubsub.addEventListener('message', handler);

    broadcastToPack('inference-request', {
      requestId,
      prompt,
      model: model || 'auto',
    }).catch(reject);
  });
}

/**
 * Connect to a specific peer by multiaddr
 */
export async function connectToPeer(multiaddr: string): Promise<void> {
  if (!node) throw new Error('Mesh not started');
  const { multiaddr: ma } = await import('@multiformats/multiaddr');
  await node.dial(ma(multiaddr));
}

/**
 * Handle incoming pack messages
 */
function handlePackMessage(data: any, callbacks: MeshCallbacks): void {
  const { type, from, payload } = data;

  switch (type) {
    case 'presence': {
      const pack = loadPack();
      if (!pack) break;
      const existing = pack.members.find((m) => m.peerId === payload.peerId);
      if (existing) {
        existing.lastSeen = new Date().toISOString();
        existing.capabilities = payload.capabilities;
      } else if (payload.packId === pack.packId) {
        pack.members.push({
          peerId: payload.peerId,
          displayName: payload.displayName,
          joinedAt: new Date().toISOString(),
          role: 'member',
          capabilities: payload.capabilities,
          lastSeen: new Date().toISOString(),
        });
      }
      savePack(pack);
      break;
    }
    case 'inference-request': {
      if (callbacks.onInferenceRequest) {
        callbacks.onInferenceRequest(payload).then((response) => {
          broadcastToPack('inference-response', {
            requestId: payload.requestId,
            response,
          });
        });
      }
      break;
    }
    case 'pack-sync': {
      callbacks.onPackSync?.(payload);
      break;
    }
  }
}
