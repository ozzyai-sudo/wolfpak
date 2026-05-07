/**
 * WOLFPAK AI — Pack Manager
 * Create, join, and manage packs (private AI clusters)
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { getWolfpakDir, getOrCreateIdentity } from './identity.js';

export interface PackMember {
  peerId: string;
  displayName: string;
  joinedAt: string;
  role: 'alpha' | 'member';
  capabilities: string[];
  lastSeen?: string;
}

export interface SharedProvider {
  name: string;
  type: 'openrouter' | 'groq' | 'together' | 'openai' | 'anthropic';
  apiKey: string;
  addedBy: string;
  monthlyBudget: number;
  usedThisMonth: number;
}

export interface PackConfig {
  packId: string;
  name: string;
  createdAt: string;
  createdBy: string;
  inviteCode: string;
  encryptionKey: string;
  members: PackMember[];
  providers: SharedProvider[];
  settings: {
    maxMembers: number;
    defaultModel: string;
    inferencePort: number;
    routingStrategy: 'best-gpu' | 'round-robin' | 'least-loaded';
  };
}

const PACK_FILE = () => path.join(getWolfpakDir(), 'pack.json');

/**
 * Create a new pack — makes this node the Alpha
 */
export function createPack(name: string): PackConfig {
  const identity = getOrCreateIdentity();

  const packId = 'pack_' + crypto.randomBytes(12).toString('hex');
  const inviteCode = crypto.randomBytes(16).toString('base64url');
  const encryptionKey = crypto.randomBytes(32).toString('base64');

  const pack: PackConfig = {
    packId,
    name,
    createdAt: new Date().toISOString(),
    createdBy: identity.peerId,
    inviteCode,
    encryptionKey,
    members: [
      {
        peerId: identity.peerId,
        displayName: identity.displayName,
        joinedAt: new Date().toISOString(),
        role: 'alpha',
        capabilities: detectCapabilities(),
      },
    ],
    providers: [],
    settings: {
      maxMembers: 20,
      defaultModel: 'auto',
      inferencePort: 8787,
      routingStrategy: 'best-gpu',
    },
  };

  fs.writeFileSync(PACK_FILE(), JSON.stringify(pack, null, 2));
  return pack;
}

/**
 * Generate a shareable invite link
 */
export function getInviteLink(pack: PackConfig): string {
  const payload = Buffer.from(
    JSON.stringify({
      packId: pack.packId,
      name: pack.name,
      inviteCode: pack.inviteCode,
      createdBy: pack.createdBy,
    })
  ).toString('base64url');

  return `wolfpak://join/${payload}`;
}

/**
 * Parse an invite link and join the pack
 */
export function parseInvite(inviteLink: string): { packId: string; name: string; inviteCode: string; createdBy: string } {
  const payload = inviteLink.replace('wolfpak://join/', '');
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
}

/**
 * Join a pack from invite data (network sync happens separately)
 */
export function joinPack(inviteData: { packId: string; name: string; inviteCode: string; createdBy: string }, encryptionKey: string): PackConfig {
  const identity = getOrCreateIdentity();

  const pack: PackConfig = {
    packId: inviteData.packId,
    name: inviteData.name,
    createdAt: new Date().toISOString(),
    createdBy: inviteData.createdBy,
    inviteCode: inviteData.inviteCode,
    encryptionKey,
    members: [
      {
        peerId: identity.peerId,
        displayName: identity.displayName,
        joinedAt: new Date().toISOString(),
        role: 'member',
        capabilities: detectCapabilities(),
      },
    ],
    providers: [],
    settings: {
      maxMembers: 20,
      defaultModel: 'auto',
      inferencePort: 8787,
      routingStrategy: 'best-gpu',
    },
  };

  fs.writeFileSync(PACK_FILE(), JSON.stringify(pack, null, 2));
  return pack;
}

/**
 * Load current pack config
 */
export function loadPack(): PackConfig | null {
  const packFile = PACK_FILE();
  if (!fs.existsSync(packFile)) return null;
  return JSON.parse(fs.readFileSync(packFile, 'utf-8'));
}

/**
 * Save pack config
 */
export function savePack(pack: PackConfig): void {
  fs.writeFileSync(PACK_FILE(), JSON.stringify(pack, null, 2));
}

/**
 * Add a shared API provider to the pack
 */
export function addProvider(provider: Omit<SharedProvider, 'usedThisMonth'>): void {
  const pack = loadPack();
  if (!pack) throw new Error('No active pack. Create or join one first.');

  pack.providers.push({ ...provider, usedThisMonth: 0 });
  savePack(pack);
}

/**
 * Detect this machine's capabilities
 */
function detectCapabilities(): string[] {
  const caps: string[] = ['relay', 'storage'];
  const totalMem = Math.round(os.totalmem() / (1024 * 1024 * 1024));

  if (totalMem >= 8) caps.push('inference');
  if (totalMem >= 4) caps.push('embedding');
  caps.push('orchestration');

  return caps;
}
