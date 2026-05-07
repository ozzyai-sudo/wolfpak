/**
 * WOLFPAK AI — SQLite State Store
 * Tracks inference logs, node stats, provider usage
 */
import Database from 'better-sqlite3';
import path from 'path';
import { getWolfpakDir, ensureWolfpakDir } from '../core/identity.js';

let db: Database.Database | null = null;

/**
 * Get or create the SQLite database
 */
export function getDB(): Database.Database {
  if (db) return db;

  ensureWolfpakDir();
  const dbPath = path.join(getWolfpakDir(), 'wolfpak.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  initTables();
  return db;
}

/**
 * Initialize database tables
 */
function initTables(): void {
  if (!db) return;

  db.exec(`
    CREATE TABLE IF NOT EXISTS inference_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id TEXT UNIQUE NOT NULL,
      model TEXT,
      source TEXT NOT NULL,
      served_by TEXT,
      prompt_preview TEXT,
      response_preview TEXT,
      prompt_tokens INTEGER DEFAULT 0,
      completion_tokens INTEGER DEFAULT 0,
      total_tokens INTEGER DEFAULT 0,
      latency_ms INTEGER DEFAULT 0,
      status TEXT DEFAULT 'success',
      error TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS node_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      peer_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      details TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS provider_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider_name TEXT NOT NULL,
      provider_type TEXT NOT NULL,
      tokens_used INTEGER DEFAULT 0,
      estimated_cost REAL DEFAULT 0,
      request_id TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS daily_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      total_requests INTEGER DEFAULT 0,
      local_requests INTEGER DEFAULT 0,
      provider_requests INTEGER DEFAULT 0,
      mesh_requests INTEGER DEFAULT 0,
      total_tokens INTEGER DEFAULT 0,
      avg_latency_ms REAL DEFAULT 0,
      errors INTEGER DEFAULT 0,
      UNIQUE(date)
    );
  `);
}

/**
 * Log an inference request
 */
export function logInference(data: {
  requestId: string;
  model: string;
  source: 'local' | 'provider' | 'mesh';
  servedBy?: string;
  promptPreview: string;
  responsePreview: string;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  status?: string;
  error?: string;
}): void {
  const store = getDB();
  store.prepare(`
    INSERT INTO inference_logs (request_id, model, source, served_by, prompt_preview, response_preview, prompt_tokens, completion_tokens, total_tokens, latency_ms, status, error)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.requestId, data.model, data.source, data.servedBy || null,
    data.promptPreview.slice(0, 200), data.responsePreview.slice(0, 500),
    data.promptTokens, data.completionTokens,
    data.promptTokens + data.completionTokens,
    data.latencyMs, data.status || 'success', data.error || null
  );

  const today = new Date().toISOString().split('T')[0];
  store.prepare(`
    INSERT INTO daily_stats (date, total_requests, local_requests, provider_requests, mesh_requests, total_tokens, avg_latency_ms, errors)
    VALUES (?, 1, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(date) DO UPDATE SET
      total_requests = total_requests + 1,
      local_requests = local_requests + excluded.local_requests,
      provider_requests = provider_requests + excluded.provider_requests,
      mesh_requests = mesh_requests + excluded.mesh_requests,
      total_tokens = total_tokens + excluded.total_tokens,
      avg_latency_ms = (avg_latency_ms * (total_requests - 1) + excluded.avg_latency_ms) / total_requests,
      errors = errors + excluded.errors
  `).run(
    today,
    data.source === 'local' ? 1 : 0,
    data.source === 'provider' ? 1 : 0,
    data.source === 'mesh' ? 1 : 0,
    data.promptTokens + data.completionTokens,
    data.latencyMs,
    data.status === 'error' ? 1 : 0
  );
}

/**
 * Log a node event
 */
export function logNodeEvent(peerId: string, eventType: string, details?: string): void {
  const store = getDB();
  store.prepare(`INSERT INTO node_events (peer_id, event_type, details) VALUES (?, ?, ?)`).run(peerId, eventType, details || null);
}

/**
 * Log provider usage
 */
export function logProviderUsage(providerName: string, providerType: string, tokensUsed: number, estimatedCost: number, requestId?: string): void {
  const store = getDB();
  store.prepare(`INSERT INTO provider_usage (provider_name, provider_type, tokens_used, estimated_cost, request_id) VALUES (?, ?, ?, ?, ?)`).run(
    providerName, providerType, tokensUsed, estimatedCost, requestId || null
  );
}

/**
 * Get dashboard stats
 */
export function getDashboardStats(): any {
  const store = getDB();
  const today = new Date().toISOString().split('T')[0];

  const todayStats = store.prepare(`SELECT * FROM daily_stats WHERE date = ?`).get(today) as any || {
    total_requests: 0, local_requests: 0, provider_requests: 0, mesh_requests: 0, total_tokens: 0, avg_latency_ms: 0, errors: 0
  };

  const allTimeStats = store.prepare(`
    SELECT
      COALESCE(SUM(total_requests), 0) as total_requests,
      COALESCE(SUM(local_requests), 0) as local_requests,
      COALESCE(SUM(provider_requests), 0) as provider_requests,
      COALESCE(SUM(mesh_requests), 0) as mesh_requests,
      COALESCE(SUM(total_tokens), 0) as total_tokens,
      COALESCE(AVG(avg_latency_ms), 0) as avg_latency_ms,
      COALESCE(SUM(errors), 0) as errors
    FROM daily_stats
  `).get() as any;

  const recentLogs = store.prepare(`SELECT * FROM inference_logs ORDER BY id DESC LIMIT 50`).all();
  const weeklyStats = store.prepare(`SELECT * FROM daily_stats ORDER BY date DESC LIMIT 7`).all();

  return { today: todayStats, allTime: allTimeStats, recentLogs, weeklyStats };
}

/**
 * Get inference logs with pagination
 */
export function getInferenceLogs(limit: number = 50, offset: number = 0): any[] {
  const store = getDB();
  return store.prepare(`SELECT * FROM inference_logs ORDER BY id DESC LIMIT ? OFFSET ?`).all(limit, offset);
}

/**
 * Get node events
 */
export function getNodeEvents(limit: number = 50): any[] {
  const store = getDB();
  return store.prepare(`SELECT * FROM node_events ORDER BY id DESC LIMIT ?`).all(limit);
}

/**
 * Get provider usage summary
 */
export function getProviderUsageSummary(): any[] {
  const store = getDB();
  return store.prepare(`
    SELECT provider_name, provider_type,
      SUM(tokens_used) as total_tokens,
      SUM(estimated_cost) as total_cost,
      COUNT(*) as request_count
    FROM provider_usage
    GROUP BY provider_name, provider_type
  `).all();
}
