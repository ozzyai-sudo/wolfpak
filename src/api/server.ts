/**
 * WOLFPAK AI — OpenAI-Compatible API Server
 * Drop-in replacement API at localhost:8787/v1
 */
import express from 'express';
import fs from 'fs';
import { infer, listModels, getCurrentModel, type InferenceRequest } from '../inference/engine.js';
import { loadPack } from '../core/pack.js';
import { loadIdentity } from '../core/identity.js';
import { getMesh } from '../network/mesh.js';
import { createAdminRouter } from './admin.js';
import { logInference } from '../db/store.js';

let server: any = null;

/**
 * Start the OpenAI-compatible API server
 */
export function startAPI(port: number = 8787): Promise<void> {
  return new Promise((resolve) => {
    const app = express();
    app.use(express.json());

    // CORS for local dev
    app.use((_req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      if (_req.method === 'OPTIONS') return res.sendStatus(200);
      next();
    });

    // Serve desktop app static files
    const desktopPath = new URL('../../desktop/dist', import.meta.url).pathname;
    if (fs.existsSync(desktopPath)) {
      app.use('/app', express.static(desktopPath));
    }

    // Admin API
    app.use('/admin', createAdminRouter());

    // Health check
    app.get('/health', (_req, res) => {
      const identity = loadIdentity();
      const pack = loadPack();
      const mesh = getMesh();

      res.json({
        status: 'ok',
        node: identity?.peerId,
        pack: pack?.name || null,
        members: pack?.members.length || 0,
        meshPeers: mesh ? (mesh as any).getPeers?.()?.length || 0 : 0,
        currentModel: getCurrentModel(),
        timestamp: new Date().toISOString(),
      });
    });

    // List models
    app.get('/v1/models', (_req, res) => {
      const models = listModels();
      const pack = loadPack();

      const modelList = models.map((m) => ({
        id: m.name,
        object: 'model',
        created: Math.floor(Date.now() / 1000),
        owned_by: 'wolfpak',
      }));

      // Add provider models
      if (pack) {
        for (const p of pack.providers) {
          modelList.push({
            id: `${p.type}/${p.name}`,
            object: 'model',
            created: Math.floor(Date.now() / 1000),
            owned_by: p.type,
          });
        }
      }

      res.json({ object: 'list', data: modelList });
    });

    // Chat completions — the main endpoint
    app.post('/v1/chat/completions', async (req, res) => {
      try {
        const request: InferenceRequest = {
          messages: req.body.messages || [],
          model: req.body.model,
          temperature: req.body.temperature,
          max_tokens: req.body.max_tokens,
          stream: req.body.stream,
        };

        if (!request.messages.length) {
          return res.status(400).json({ error: { message: 'messages array is required', type: 'invalid_request_error' } });
        }

        // TODO: streaming support
        if (request.stream) {
          return res.status(501).json({ error: { message: 'Streaming not yet supported', type: 'not_implemented' } });
        }

        const startTime = Date.now();
        const response = await infer(request);
        const latencyMs = Date.now() - startTime;

        // Log the inference
        try {
          logInference({
            requestId: response.id,
            model: response.model,
            source: response.source,
            promptPreview: request.messages[request.messages.length - 1]?.content || '',
            responsePreview: response.choices[0]?.message?.content || '',
            promptTokens: response.usage.prompt_tokens,
            completionTokens: response.usage.completion_tokens,
            latencyMs,
          });
        } catch {}

        res.json(response);
      } catch (err: any) {
        console.error('[api] Inference error:', err.message);
        res.status(500).json({
          error: { message: err.message, type: 'server_error' },
        });
      }
    });

    // Pack status
    app.get('/v1/pack/status', (_req, res) => {
      const pack = loadPack();
      const identity = loadIdentity();
      const mesh = getMesh();

      if (!pack) {
        return res.json({ active: false, message: 'No pack active' });
      }

      res.json({
        active: true,
        packId: pack.packId,
        name: pack.name,
        members: pack.members.map((m) => ({
          peerId: m.peerId,
          displayName: m.displayName,
          role: m.role,
          capabilities: m.capabilities,
          lastSeen: m.lastSeen,
          isMe: m.peerId === identity?.peerId,
        })),
        providers: pack.providers.map((p) => ({
          name: p.name,
          type: p.type,
          budget: p.monthlyBudget,
          used: p.usedThisMonth,
        })),
        meshPeers: mesh ? (mesh as any).getPeers?.()?.length || 0 : 0,
      });
    });

    // Pack members
    app.get('/v1/pack/members', (_req, res) => {
      const pack = loadPack();
      if (!pack) return res.json({ members: [] });
      res.json({ members: pack.members });
    });

    server = app.listen(port, () => {
      console.log(`[api] WOLFPAK API server running at http://localhost:${port}`);
      console.log(`[api] OpenAI-compatible endpoint: http://localhost:${port}/v1/chat/completions`);
      resolve();
    });
  });
}

/**
 * Stop the API server
 */
export function stopAPI(): Promise<void> {
  return new Promise((resolve) => {
    if (server) {
      server.close(() => {
        console.log('[api] API server stopped.');
        resolve();
      });
    } else {
      resolve();
    }
  });
}
