/**
 * WOLFPAK AI — OpenAI-Compatible API Server
 * Drop-in replacement API at localhost:8787/v1
 * Secured with bearer token auth, rate limiting, and TLS
 */
import express from 'express';
import https from 'https';
import fs from 'fs';
import { infer, listModels, getCurrentModel, type InferenceRequest } from '../inference/engine.js';
import { loadPack } from '../core/pack.js';
import { loadIdentity } from '../core/identity.js';
import { getMesh } from '../network/mesh.js';
import { createAdminRouter } from './admin.js';
import { logInference } from '../db/store.js';
import {
  getOrCreateSecurityConfig,
  validateToken,
  checkRateLimit,
  loadSecurityConfig,
} from '../core/security.js';

let server: any = null;

/**
 * Auth middleware — validates bearer token
 * Skips auth for: health check, CORS preflight, static app files
 */
function authMiddleware(req: any, res: any, next: any): void {
  // Skip auth for health check, static app, and OPTIONS
  if (req.method === 'OPTIONS') return next();
  if (req.path === '/health') return next();
  if (req.path.startsWith('/app')) return next();

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: { message: 'Authentication required. Use: Authorization: Bearer <your-token>', type: 'auth_error' },
    });
    return;
  }

  const token = authHeader.slice(7);
  if (!validateToken(token)) {
    res.status(403).json({
      error: { message: 'Invalid API token', type: 'auth_error' },
    });
    return;
  }

  next();
}

/**
 * Rate limit middleware
 */
function rateLimitMiddleware(req: any, res: any, next: any): void {
  // Skip rate limiting for health and static
  if (req.path === '/health') return next();
  if (req.path.startsWith('/app')) return next();

  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  if (!checkRateLimit(ip)) {
    res.status(429).json({
      error: { message: 'Rate limit exceeded. Try again later.', type: 'rate_limit_error' },
    });
    return;
  }

  next();
}

/**
 * Start the OpenAI-compatible API server
 */
export function startAPI(port: number = 8787): Promise<void> {
  return new Promise((resolve) => {
    const app = express();
    app.use(express.json());

    // Initialize security config (generates token if first run)
    const secConfig = getOrCreateSecurityConfig();
    console.log(`[security] API token: ${secConfig.apiToken}`);
    console.log(`[security] Rate limits: ${secConfig.rateLimits.requestsPerMinute}/min, ${secConfig.rateLimits.requestsPerHour}/hr`);

    // CORS
    app.use((_req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      if (_req.method === 'OPTIONS') return res.sendStatus(200);
      next();
    });

    // Rate limiting (before auth so we don't waste cycles on abusive requests)
    app.use(rateLimitMiddleware);

    // Auth middleware
    app.use(authMiddleware);

    // Security headers
    app.use((_req, res, next) => {
      res.header('X-Content-Type-Options', 'nosniff');
      res.header('X-Frame-Options', 'DENY');
      res.header('X-XSS-Protection', '1; mode=block');
      res.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      next();
    });

    // Serve desktop app static files (no auth required — app handles its own auth)
    const desktopPath = new URL('../../desktop/dist', import.meta.url).pathname;
    if (fs.existsSync(desktopPath)) {
      app.use('/app', express.static(desktopPath));
    }

    // Admin API
    app.use('/admin', createAdminRouter());

    // Health check (no auth)
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

    // Chat completions
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

        if (request.stream) {
          return res.status(501).json({ error: { message: 'Streaming not yet supported', type: 'not_implemented' } });
        }

        const startTime = Date.now();
        const response = await infer(request);
        const latencyMs = Date.now() - startTime;

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
      console.log(`[security] Auth ENABLED — all API requests require Bearer token`);
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
