/**
 * WOLFPAK AI — Admin API Routes
 * Master admin backend for desktop app
 */
import { Router } from 'express';
import os from 'os';
import { loadIdentity, getWolfpakDir } from '../core/identity.js';
import { loadPack, savePack, addProvider, getInviteLink, createPack, parseInvite, joinPack } from '../core/pack.js';
import { listModels, recommendedModelTier, getCurrentModel, loadModel, unloadModel, ensureModelsDir } from '../inference/engine.js';
import { MODEL_CATALOG, getCompatibleModels, getRecommendedModel } from '../inference/catalog.js';
import { getMesh } from '../network/mesh.js';
import { getDashboardStats, getInferenceLogs, getNodeEvents, getProviderUsageSummary } from '../db/store.js';
import { createCapsule } from '../core/capsule.js';
import {
  loadSecurityConfig,
  getOrCreateSecurityConfig,
  saveSecurityConfig,
  regenerateToken,
  approvePeer,
  rejectPeer,
} from '../core/security.js';
import fs from 'fs';
import path from 'path';

export function createAdminRouter(): Router {
  const router = Router();

  // ─── DASHBOARD ──────────────────────────────────────────────
  router.get('/dashboard', (_req, res) => {
    const identity = loadIdentity();
    const pack = loadPack();
    const mesh = getMesh();
    const stats = getDashboardStats();
    const models = listModels();
    const totalGB = Math.round(os.totalmem() / (1024 * 1024 * 1024));
    const freeGB = Math.round(os.freemem() / (1024 * 1024 * 1024));

    res.json({
      node: {
        peerId: identity?.peerId,
        displayName: identity?.displayName,
        platform: `${os.platform()} ${os.arch()}`,
        cpu: os.cpus()[0]?.model || 'unknown',
        cores: os.cpus().length,
        totalRAM: totalGB,
        freeRAM: freeGB,
        uptime: Math.round(os.uptime()),
        meshOnline: !!mesh,
        meshPeers: mesh ? (mesh as any).getPeers?.()?.length || 0 : 0,
        currentModel: getCurrentModel(),
      },
      pack: pack ? {
        packId: pack.packId,
        name: pack.name,
        members: pack.members.length,
        providers: pack.providers.length,
        routing: pack.settings.routingStrategy,
        createdAt: pack.createdAt,
      } : null,
      stats: stats,
      models: models.map(m => ({
        ...m,
        sizeGB: (m.size / (1024 * 1024 * 1024)).toFixed(1),
      })),
      recommended: recommendedModelTier(),
    });
  });

  // ─── PACK MANAGEMENT ────────────────────────────────────────
  router.get('/pack', (_req, res) => {
    const pack = loadPack();
    const identity = loadIdentity();
    if (!pack) return res.json({ active: false });

    res.json({
      active: true,
      ...pack,
      inviteLink: getInviteLink(pack),
      members: pack.members.map(m => ({
        ...m,
        isMe: m.peerId === identity?.peerId,
        online: m.lastSeen ? (Date.now() - new Date(m.lastSeen).getTime()) < 60000 : m.peerId === identity?.peerId,
      })),
    });
  });

  router.delete('/pack/members/:peerId', (req, res) => {
    const pack = loadPack();
    if (!pack) return res.status(404).json({ error: 'No active pack' });

    const identity = loadIdentity();
    const self = pack.members.find(m => m.peerId === identity?.peerId);
    if (!self || self.role !== 'alpha') {
      return res.status(403).json({ error: 'Only the Alpha can remove members' });
    }

    pack.members = pack.members.filter(m => m.peerId !== req.params.peerId);
    savePack(pack);
    res.json({ success: true, members: pack.members.length });
  });

  router.post('/pack/create', (req, res) => {
    try {
      const pack = createPack(req.body.name || 'my-pack');
      res.json({ success: true, packId: pack.packId, name: pack.name, inviteLink: getInviteLink(pack), encryptionKey: pack.encryptionKey });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/pack/join', (req, res) => {
    try {
      const { invite, key } = req.body;
      if (!invite || !key) return res.status(400).json({ error: 'invite and key are required' });
      const inviteData = parseInvite(invite);
      const pack = joinPack(inviteData, key);
      res.json({ success: true, packId: pack.packId, name: pack.name });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/pack/leave', (_req, res) => {
    try {
      const packFile = path.join(getWolfpakDir(), 'pack.json');
      if (fs.existsSync(packFile)) fs.unlinkSync(packFile);
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.put('/pack/settings', (req, res) => {
    const pack = loadPack();
    if (!pack) return res.status(404).json({ error: 'No active pack' });

    if (req.body.routingStrategy) pack.settings.routingStrategy = req.body.routingStrategy;
    if (req.body.maxMembers) pack.settings.maxMembers = req.body.maxMembers;
    if (req.body.defaultModel) pack.settings.defaultModel = req.body.defaultModel;

    savePack(pack);
    res.json({ success: true, settings: pack.settings });
  });

  // ─── PROVIDERS ──────────────────────────────────────────────
  router.get('/providers', (_req, res) => {
    const pack = loadPack();
    const usage = getProviderUsageSummary();
    res.json({
      providers: pack?.providers.map(p => {
        const u = usage.find((u: any) => u.provider_name === p.name) as any;
        return {
          ...p,
          apiKey: p.apiKey.slice(0, 8) + '...',
          totalRequests: u?.request_count || 0,
          totalTokens: u?.total_tokens || 0,
          totalCost: u?.total_cost || 0,
        };
      }) || [],
    });
  });

  router.post('/providers', (req, res) => {
    try {
      const identity = loadIdentity();
      if (!identity) return res.status(400).json({ error: 'Not initialized' });

      addProvider({
        name: req.body.name,
        type: req.body.type,
        apiKey: req.body.apiKey,
        addedBy: identity.peerId,
        monthlyBudget: req.body.monthlyBudget || 0,
      });
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.delete('/providers/:name', (req, res) => {
    const pack = loadPack();
    if (!pack) return res.status(404).json({ error: 'No active pack' });

    pack.providers = pack.providers.filter(p => p.name !== req.params.name);
    savePack(pack);
    res.json({ success: true });
  });

  // ─── MODELS ─────────────────────────────────────────────────
  router.get('/models', (_req, res) => {
    const models = listModels();
    const rec = recommendedModelTier();
    const recModel = getRecommendedModel();
    const compatible = getCompatibleModels();
    res.json({
      models: models.map(m => ({
        ...m,
        sizeGB: (m.size / (1024 * 1024 * 1024)).toFixed(1),
      })),
      currentModel: getCurrentModel(),
      recommended: rec,
      catalog: MODEL_CATALOG,
      compatibleCatalog: compatible,
      recommendedModel: recModel,
    });
  });

  router.post('/models/load', async (req, res) => {
    try {
      const filename = req.body.name.endsWith('.gguf') ? req.body.name : `${req.body.name}.gguf`;
      await loadModel(filename);
      res.json({ success: true, model: getCurrentModel() });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/models/unload', async (_req, res) => {
    await unloadModel();
    res.json({ success: true });
  });

  // ─── INFERENCE LOGS ─────────────────────────────────────────
  router.get('/logs/inference', (req, res) => {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    const logs = getInferenceLogs(limit, offset);
    res.json({ logs, limit, offset });
  });

  // ─── NODE EVENTS ────────────────────────────────────────────
  router.get('/logs/events', (req, res) => {
    const limit = parseInt(req.query.limit as string) || 50;
    const events = getNodeEvents(limit);
    res.json({ events });
  });

  // ─── CAPSULE ────────────────────────────────────────────────
  router.post('/capsule/create', (_req, res) => {
    try {
      const capsulePath = createCapsule();
      res.json({ success: true, path: capsulePath });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // ─── SYSTEM ─────────────────────────────────────────────────
  router.get('/system', (_req, res) => {
    const totalGB = Math.round(os.totalmem() / (1024 * 1024 * 1024));
    const freeGB = Math.round(os.freemem() / (1024 * 1024 * 1024));
    const wolfDir = getWolfpakDir();

    let dbSize = 0;
    const dbPath = path.join(wolfDir, 'wolfpak.db');
    if (fs.existsSync(dbPath)) {
      dbSize = Math.round(fs.statSync(dbPath).size / 1024);
    }

    res.json({
      platform: os.platform(),
      arch: os.arch(),
      cpu: os.cpus()[0]?.model || 'unknown',
      cores: os.cpus().length,
      totalRAM: totalGB,
      freeRAM: freeGB,
      hostname: os.hostname(),
      uptime: Math.round(os.uptime()),
      nodeVersion: process.version,
      configDir: wolfDir,
      dbSizeKB: dbSize,
      loadAvg: os.loadavg(),
    });
  });

  // ─── SECURITY ───────────────────────────────────────────────
  router.get('/security', (_req, res) => {
    const config = getOrCreateSecurityConfig();
    res.json({
      tokenPreview: config.apiToken.slice(0, 12) + '...',
      pendingPeers: config.pendingPeers,
      approvedPeers: config.approvedPeers,
      blockedPeers: config.blockedPeers,
      rateLimits: config.rateLimits,
    });
  });

  router.get('/security/token', (_req, res) => {
    const config = getOrCreateSecurityConfig();
    res.json({ token: config.apiToken });
  });

  router.post('/security/token/regenerate', (_req, res) => {
    const newToken = regenerateToken();
    res.json({ success: true, token: newToken });
  });

  router.post('/security/peers/:peerId/approve', (req, res) => {
    const ok = approvePeer(req.params.peerId);
    res.json({ success: ok });
  });

  router.post('/security/peers/:peerId/reject', (req, res) => {
    const ok = rejectPeer(req.params.peerId);
    res.json({ success: ok });
  });

  router.put('/security/rate-limits', (req, res) => {
    const config = getOrCreateSecurityConfig();
    if (req.body.requestsPerMinute) config.rateLimits.requestsPerMinute = req.body.requestsPerMinute;
    if (req.body.requestsPerHour) config.rateLimits.requestsPerHour = req.body.requestsPerHour;
    saveSecurityConfig(config);
    res.json({ success: true, rateLimits: config.rateLimits });
  });

  return router;
}
