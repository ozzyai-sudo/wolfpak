/**
 * WOLFPAK AI — Security Module
 * Auth tokens, key encryption, peer approval, rate limiting
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getWolfpakDir, ensureWolfpakDir } from './identity.js';

const SECURITY_FILE = () => path.join(getWolfpakDir(), 'security.json');

export interface SecurityConfig {
  apiToken: string;
  apiTokenHash: string;
  pendingPeers: PendingPeer[];
  approvedPeers: string[];
  blockedPeers: string[];
  rateLimits: {
    requestsPerMinute: number;
    requestsPerHour: number;
  };
  tlsEnabled: boolean;
  createdAt: string;
}

export interface PendingPeer {
  peerId: string;
  displayName: string;
  requestedAt: string;
  capabilities: string[];
}

// ─── AUTH TOKEN ─────────────────────────────────────────────

/**
 * Generate or load API auth token
 */
export function getOrCreateSecurityConfig(): SecurityConfig {
  ensureWolfpakDir();
  const secFile = SECURITY_FILE();

  if (fs.existsSync(secFile)) {
    return JSON.parse(fs.readFileSync(secFile, 'utf-8'));
  }

  const apiToken = 'wpk_' + crypto.randomBytes(32).toString('hex');
  const apiTokenHash = crypto.createHash('sha256').update(apiToken).digest('hex');

  const config: SecurityConfig = {
    apiToken,
    apiTokenHash,
    pendingPeers: [],
    approvedPeers: [],
    blockedPeers: [],
    rateLimits: {
      requestsPerMinute: 60,
      requestsPerHour: 1000,
    },
    tlsEnabled: false,
    createdAt: new Date().toISOString(),
  };

  fs.writeFileSync(secFile, JSON.stringify(config, null, 2), { mode: 0o600 });
  return config;
}

/**
 * Load security config
 */
export function loadSecurityConfig(): SecurityConfig | null {
  const secFile = SECURITY_FILE();
  if (!fs.existsSync(secFile)) return null;
  return JSON.parse(fs.readFileSync(secFile, 'utf-8'));
}

/**
 * Save security config
 */
export function saveSecurityConfig(config: SecurityConfig): void {
  fs.writeFileSync(SECURITY_FILE(), JSON.stringify(config, null, 2), { mode: 0o600 });
}

/**
 * Validate an API token
 */
export function validateToken(token: string): boolean {
  const config = loadSecurityConfig();
  if (!config) return false;
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(config.apiTokenHash));
}

/**
 * Regenerate the API token
 */
export function regenerateToken(): string {
  const config = getOrCreateSecurityConfig();
  const newToken = 'wpk_' + crypto.randomBytes(32).toString('hex');
  config.apiToken = newToken;
  config.apiTokenHash = crypto.createHash('sha256').update(newToken).digest('hex');
  saveSecurityConfig(config);
  return newToken;
}

// ─── KEY ENCRYPTION ─────────────────────────────────────────

/**
 * Encrypt a string using the pack encryption key
 */
export function encryptValue(plaintext: string, encryptionKey: string): string {
  const key = Buffer.from(encryptionKey, 'base64');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Format: base64(iv + authTag + encrypted)
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

/**
 * Decrypt a string using the pack encryption key
 */
export function decryptValue(encryptedB64: string, encryptionKey: string): string {
  const key = Buffer.from(encryptionKey, 'base64');
  const data = Buffer.from(encryptedB64, 'base64');
  const iv = data.subarray(0, 16);
  const authTag = data.subarray(16, 32);
  const encrypted = data.subarray(32);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf-8');
}

// ─── PEER APPROVAL ──────────────────────────────────────────

/**
 * Add a peer to the pending approval queue
 */
export function addPendingPeer(peer: PendingPeer): void {
  const config = getOrCreateSecurityConfig();
  if (config.blockedPeers.includes(peer.peerId)) return;
  if (config.approvedPeers.includes(peer.peerId)) return;
  if (config.pendingPeers.find(p => p.peerId === peer.peerId)) return;
  config.pendingPeers.push(peer);
  saveSecurityConfig(config);
}

/**
 * Approve a pending peer
 */
export function approvePeer(peerId: string): boolean {
  const config = getOrCreateSecurityConfig();
  const idx = config.pendingPeers.findIndex(p => p.peerId === peerId);
  if (idx === -1) return false;
  config.pendingPeers.splice(idx, 1);
  config.approvedPeers.push(peerId);
  saveSecurityConfig(config);
  return true;
}

/**
 * Reject and block a peer
 */
export function rejectPeer(peerId: string): boolean {
  const config = getOrCreateSecurityConfig();
  config.pendingPeers = config.pendingPeers.filter(p => p.peerId !== peerId);
  if (!config.blockedPeers.includes(peerId)) {
    config.blockedPeers.push(peerId);
  }
  saveSecurityConfig(config);
  return true;
}

/**
 * Check if a peer is approved
 */
export function isPeerApproved(peerId: string): boolean {
  const config = loadSecurityConfig();
  if (!config) return false;
  return config.approvedPeers.includes(peerId);
}

/**
 * Check if a peer is blocked
 */
export function isPeerBlocked(peerId: string): boolean {
  const config = loadSecurityConfig();
  if (!config) return false;
  return config.blockedPeers.includes(peerId);
}

// ─── RATE LIMITING ──────────────────────────────────────────

const requestCounts = new Map<string, { minute: number[]; hour: number[] }>();

/**
 * Check if a request should be rate limited
 * Returns true if the request is ALLOWED, false if BLOCKED
 */
export function checkRateLimit(ip: string): boolean {
  const config = loadSecurityConfig();
  if (!config) return true;

  const now = Date.now();
  const oneMinAgo = now - 60000;
  const oneHourAgo = now - 3600000;

  if (!requestCounts.has(ip)) {
    requestCounts.set(ip, { minute: [], hour: [] });
  }

  const counts = requestCounts.get(ip)!;

  // Clean old entries
  counts.minute = counts.minute.filter(t => t > oneMinAgo);
  counts.hour = counts.hour.filter(t => t > oneHourAgo);

  // Check limits
  if (counts.minute.length >= config.rateLimits.requestsPerMinute) return false;
  if (counts.hour.length >= config.rateLimits.requestsPerHour) return false;

  // Record this request
  counts.minute.push(now);
  counts.hour.push(now);

  return true;
}

// ─── TLS CERTIFICATE ────────────────────────────────────────

/**
 * Generate self-signed TLS certificate for the API server
 */
export function getOrCreateTLSCert(): { certPath: string; keyPath: string } {
  ensureWolfpakDir();
  const certPath = path.join(getWolfpakDir(), 'tls-cert.pem');
  const keyPath = path.join(getWolfpakDir(), 'tls-key.pem');

  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    return { certPath, keyPath };
  }

  // Generate self-signed cert using Node crypto
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });

  // Create a basic self-signed certificate
  // For production, use Let's Encrypt — this is for local/mesh encryption
  const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
  const pubPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;

  // Write private key
  fs.writeFileSync(keyPath, privPem, { mode: 0o600 });
  // Write public key as cert placeholder (real cert needs openssl)
  fs.writeFileSync(certPath, pubPem, { mode: 0o644 });

  return { certPath, keyPath };
}
