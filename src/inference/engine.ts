/**
 * WOLFPAK AI — Inference Engine
 * Local GGUF model loading + inference via node-llama-cpp
 * Falls back to shared API providers when no local model available
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { getWolfpakDir } from '../core/identity.js';
import { loadPack, type SharedProvider } from '../core/pack.js';

const MODELS_DIR = path.join(getWolfpakDir(), 'models');

export interface InferenceRequest {
  messages: Array<{ role: string; content: string }>;
  model?: string;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

export interface InferenceResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: { role: string; content: string };
    finish_reason: string;
  }>;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  source: 'local' | 'provider';
}

export interface ModelInfo {
  name: string;
  filename: string;
  size: number;
  quantization: string;
  loaded: boolean;
}

let llamaInstance: any = null;
let llamaModel: any = null;
let currentModelName: string | null = null;

/**
 * Ensure models directory exists
 */
export function ensureModelsDir(): string {
  if (!fs.existsSync(MODELS_DIR)) {
    fs.mkdirSync(MODELS_DIR, { recursive: true });
  }
  return MODELS_DIR;
}

/**
 * List downloaded models
 */
export function listModels(): ModelInfo[] {
  ensureModelsDir();
  const files = fs.readdirSync(MODELS_DIR).filter((f) => f.endsWith('.gguf'));

  return files.map((f) => {
    const stat = fs.statSync(path.join(MODELS_DIR, f));
    const parts = f.replace('.gguf', '').split('-');
    const quant = parts.find((p) => p.match(/^[Qq]\d/)) || 'unknown';

    return {
      name: f.replace('.gguf', ''),
      filename: f,
      size: stat.size,
      quantization: quant,
      loaded: currentModelName === f.replace('.gguf', ''),
    };
  });
}

/**
 * Auto-detect best model tier based on system RAM
 */
export function recommendedModelTier(): { vram: string; recommended: string } {
  const totalGB = Math.round(os.totalmem() / (1024 * 1024 * 1024));

  if (totalGB >= 64) return { vram: `${totalGB}GB`, recommended: 'Qwen 2.5 32B (Q4_K_M)' };
  if (totalGB >= 32) return { vram: `${totalGB}GB`, recommended: 'Gemma 3 27B (Q4_K_M)' };
  if (totalGB >= 16) return { vram: `${totalGB}GB`, recommended: 'Gemma 3 12B (Q4_K_M)' };
  if (totalGB >= 8) return { vram: `${totalGB}GB`, recommended: 'Gemma 3 4B (Q4_K_M)' };
  return { vram: `${totalGB}GB`, recommended: 'Gemma 3 1B (Q4_K_M)' };
}

/**
 * Load a GGUF model for inference
 */
export async function loadModel(modelPath: string): Promise<void> {
  try {
    // Dynamic import — node-llama-cpp is optional (only needed for local inference)
    const llamaCpp: any = await import(/* webpackIgnore: true */ 'node-llama-cpp' + '');
    llamaInstance = await llamaCpp.getLlama();

    const fullPath = modelPath.startsWith('/') ? modelPath : path.join(MODELS_DIR, modelPath);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Model not found: ${fullPath}`);
    }

    console.log(`[inference] Loading model: ${fullPath}`);
    llamaModel = await llamaInstance.loadModel({ modelPath: fullPath });
    currentModelName = path.basename(fullPath).replace('.gguf', '');
    console.log(`[inference] Model loaded: ${currentModelName}`);
  } catch (err: any) {
    console.error(`[inference] Failed to load model: ${err.message}`);
    throw err;
  }
}

/**
 * Run local inference on loaded model
 */
export async function inferLocal(request: InferenceRequest): Promise<InferenceResponse> {
  if (!llamaModel) {
    throw new Error('No model loaded. Run: wolfpak models load <model>');
  }

  const context = await llamaModel.createContext();
  // Dynamic import — node-llama-cpp is optional (only needed for local inference)
  const llamaCpp: any = await import(/* webpackIgnore: true */ 'node-llama-cpp' + '');
  const session = new llamaCpp.LlamaChatSession({ contextSequence: context.getSequence() });

  const lastMessage = request.messages[request.messages.length - 1];
  const prompt = lastMessage?.content || '';

  const response = await session.prompt(prompt, {
    maxTokens: request.max_tokens || 2048,
    temperature: request.temperature || 0.7,
  });

  return {
    id: `wpk-${Date.now().toString(36)}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: currentModelName || 'unknown',
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: response },
        finish_reason: 'stop',
      },
    ],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    source: 'local',
  };
}

/**
 * Run inference via shared provider API key
 */
export async function inferProvider(request: InferenceRequest, provider: SharedProvider): Promise<InferenceResponse> {
  const endpoints: Record<string, string> = {
    openrouter: 'https://openrouter.ai/api/v1/chat/completions',
    groq: 'https://api.groq.com/openai/v1/chat/completions',
    together: 'https://api.together.xyz/v1/chat/completions',
    openai: 'https://api.openai.com/v1/chat/completions',
    anthropic: 'https://api.anthropic.com/v1/messages',
  };

  const endpoint = endpoints[provider.type];
  if (!endpoint) throw new Error(`Unsupported provider: ${provider.type}`);

  if (provider.type === 'anthropic') {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': provider.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: request.model || 'claude-sonnet-4-20250514',
        max_tokens: request.max_tokens || 2048,
        messages: request.messages,
      }),
    });
    const data: any = await res.json();
    return {
      id: data.id || `wpk-${Date.now().toString(36)}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: request.model || 'claude-sonnet-4-20250514',
      choices: [{ index: 0, message: { role: 'assistant', content: data.content?.[0]?.text || '' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: data.usage?.input_tokens || 0, completion_tokens: data.usage?.output_tokens || 0, total_tokens: 0 },
      source: 'provider',
    };
  }

  // OpenAI-compatible providers
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify({
      model: request.model || 'auto',
      messages: request.messages,
      temperature: request.temperature || 0.7,
      max_tokens: request.max_tokens || 2048,
    }),
  });

  const data: any = await res.json();

  return {
    id: data.id || `wpk-${Date.now().toString(36)}`,
    object: 'chat.completion',
    created: data.created || Math.floor(Date.now() / 1000),
    model: data.model || request.model || 'unknown',
    choices: data.choices || [{ index: 0, message: { role: 'assistant', content: 'No response' }, finish_reason: 'stop' }],
    usage: data.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    source: 'provider',
  };
}

/**
 * Smart inference router — tries local first, then providers
 */
export async function infer(request: InferenceRequest): Promise<InferenceResponse> {
  // Try local model first
  if (llamaModel) {
    try {
      return await inferLocal(request);
    } catch (err: any) {
      console.log(`[inference] Local inference failed: ${err.message}, trying providers...`);
    }
  }

  // Try shared providers
  const pack = loadPack();
  if (pack && pack.providers.length > 0) {
    for (const provider of pack.providers) {
      if (provider.usedThisMonth < provider.monthlyBudget || provider.monthlyBudget === 0) {
        try {
          return await inferProvider(request, provider);
        } catch (err: any) {
          console.log(`[inference] Provider ${provider.name} failed: ${err.message}`);
        }
      }
    }
  }

  throw new Error('No inference source available. Load a model or add a provider.');
}

/**
 * Unload current model
 */
export async function unloadModel(): Promise<void> {
  llamaModel = null;
  llamaInstance = null;
  currentModelName = null;
  console.log('[inference] Model unloaded.');
}

/**
 * Get current model name
 */
export function getCurrentModel(): string | null {
  return currentModelName;
}
