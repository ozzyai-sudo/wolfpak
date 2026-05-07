/**
 * WOLFPAK AI — Pack Capsule
 * Encrypted backup/restore of entire pack state
 * AES-256-GCM encrypted .tar.gz
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { getWolfpakDir } from './identity.js';
import { loadPack } from './pack.js';

/**
 * Create an encrypted capsule backup of the pack
 */
export function createCapsule(outputPath?: string): string {
  const pack = loadPack();
  if (!pack) throw new Error('No active pack to backup.');

  const wolfDir = getWolfpakDir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const capsuleName = `wolfpak-capsule-${pack.name}-${timestamp}`;
  const tarPath = outputPath || path.join(process.cwd(), `${capsuleName}.wpk`);

  // Gather pack state
  const capsuleData = {
    version: 1,
    createdAt: new Date().toISOString(),
    pack: JSON.parse(fs.readFileSync(path.join(wolfDir, 'pack.json'), 'utf-8')),
    identity: JSON.parse(fs.readFileSync(path.join(wolfDir, 'identity.json'), 'utf-8')),
    models: listModelFiles(),
  };

  // Encrypt with pack's encryption key
  const key = Buffer.from(pack.encryptionKey, 'base64');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const plaintext = JSON.stringify(capsuleData);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Write capsule: [16 bytes IV][16 bytes authTag][encrypted data]
  const capsule = Buffer.concat([iv, authTag, encrypted]);
  fs.writeFileSync(tarPath, capsule);

  console.log(`[capsule] Pack capsule created: ${tarPath}`);
  console.log(`[capsule] Size: ${(capsule.length / 1024).toFixed(1)}KB`);

  return tarPath;
}

/**
 * Restore a pack from an encrypted capsule
 */
export function restoreCapsule(capsulePath: string, encryptionKey: string): void {
  if (!fs.existsSync(capsulePath)) {
    throw new Error(`Capsule not found: ${capsulePath}`);
  }

  const data = fs.readFileSync(capsulePath);
  const iv = data.subarray(0, 16);
  const authTag = data.subarray(16, 32);
  const encrypted = data.subarray(32);

  const key = Buffer.from(encryptionKey, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  const capsuleData = JSON.parse(decrypted.toString('utf-8'));

  const wolfDir = getWolfpakDir();

  // Restore identity
  fs.writeFileSync(path.join(wolfDir, 'identity.json'), JSON.stringify(capsuleData.identity, null, 2));

  // Restore pack
  fs.writeFileSync(path.join(wolfDir, 'pack.json'), JSON.stringify(capsuleData.pack, null, 2));

  console.log(`[capsule] Pack restored: ${capsuleData.pack.name}`);
  console.log(`[capsule] Members: ${capsuleData.pack.members.length}`);
  console.log(`[capsule] Providers: ${capsuleData.pack.providers.length}`);
}

/**
 * List model files (names only, not included in capsule for size)
 */
function listModelFiles(): string[] {
  const modelsDir = path.join(getWolfpakDir(), 'models');
  if (!fs.existsSync(modelsDir)) return [];
  return fs.readdirSync(modelsDir).filter((f) => f.endsWith('.gguf'));
}
