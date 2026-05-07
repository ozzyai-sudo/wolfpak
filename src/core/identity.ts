/**
 * WOLFPAK AI — Node Identity Manager
 * Ed25519 keypair generation and persistent identity
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export interface WolfpakIdentity {
  peerId: string;
  publicKey: string;
  privateKey: string;
  displayName: string;
  createdAt: string;
}

const WOLFPAK_DIR = path.join(process.env.HOME || '~', '.wolfpak');
const IDENTITY_FILE = path.join(WOLFPAK_DIR, 'identity.json');

/**
 * Ensure ~/.wolfpak directory exists
 */
export function ensureWolfpakDir(): string {
  if (!fs.existsSync(WOLFPAK_DIR)) {
    fs.mkdirSync(WOLFPAK_DIR, { recursive: true });
  }
  return WOLFPAK_DIR;
}

/**
 * Generate a new Ed25519 identity or load existing one
 */
export function getOrCreateIdentity(displayName?: string): WolfpakIdentity {
  ensureWolfpakDir();

  if (fs.existsSync(IDENTITY_FILE)) {
    const existing = JSON.parse(fs.readFileSync(IDENTITY_FILE, 'utf-8'));
    return existing as WolfpakIdentity;
  }

  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');

  const pubKeyDer = publicKey.export({ type: 'spki', format: 'der' });
  const privKeyDer = privateKey.export({ type: 'pkcs8', format: 'der' });

  // Generate peerId from hash of public key
  const peerId = 'wpk_' + crypto.createHash('sha256').update(pubKeyDer).digest('hex').slice(0, 32);

  const identity: WolfpakIdentity = {
    peerId,
    publicKey: pubKeyDer.toString('base64'),
    privateKey: privKeyDer.toString('base64'),
    displayName: displayName || `wolf-${peerId.slice(4, 10)}`,
    createdAt: new Date().toISOString(),
  };

  fs.writeFileSync(IDENTITY_FILE, JSON.stringify(identity, null, 2));
  return identity;
}

/**
 * Load existing identity (returns null if none)
 */
export function loadIdentity(): WolfpakIdentity | null {
  if (!fs.existsSync(IDENTITY_FILE)) return null;
  return JSON.parse(fs.readFileSync(IDENTITY_FILE, 'utf-8'));
}

/**
 * Get the wolfpak config directory
 */
export function getWolfpakDir(): string {
  return WOLFPAK_DIR;
}
