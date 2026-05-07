/**
 * WOLFPAK AI — Model Catalog
 * Pre-configured models people can download with one command
 */
import os from 'os';

export interface CatalogModel {
  id: string;
  name: string;
  description: string;
  size: string;
  sizeBytes: number;
  minRAM: number;
  quantization: string;
  url: string;
  family: string;
}

export const MODEL_CATALOG: CatalogModel[] = [
  // ─── TINY (2-4GB RAM) ─────────────────────────────────────
  {
    id: 'qwen3-1.7b',
    name: 'Qwen 3 1.7B',
    description: 'Fast small model, good for chat and simple tasks',
    size: '1.1 GB',
    sizeBytes: 1_180_000_000,
    minRAM: 4,
    quantization: 'Q4_K_M',
    url: 'https://huggingface.co/bartowski/Qwen3-1.7B-GGUF/resolve/main/Qwen3-1.7B-Q4_K_M.gguf',
    family: 'Qwen',
  },
  {
    id: 'gemma3-1b',
    name: 'Gemma 3 1B',
    description: 'Google tiny model, fast responses',
    size: '0.8 GB',
    sizeBytes: 800_000_000,
    minRAM: 4,
    quantization: 'Q4_K_M',
    url: 'https://huggingface.co/bartowski/google_gemma-3-1b-it-GGUF/resolve/main/google_gemma-3-1b-it-Q4_K_M.gguf',
    family: 'Gemma',
  },

  // ─── SMALL (8GB RAM) ──────────────────────────────────────
  {
    id: 'qwen3-4b',
    name: 'Qwen 3 4B',
    description: 'Great balance of speed and quality',
    size: '2.7 GB',
    sizeBytes: 2_700_000_000,
    minRAM: 8,
    quantization: 'Q4_K_M',
    url: 'https://huggingface.co/bartowski/Qwen3-4B-GGUF/resolve/main/Qwen3-4B-Q4_K_M.gguf',
    family: 'Qwen',
  },
  {
    id: 'gemma3-4b',
    name: 'Gemma 3 4B',
    description: 'Google small model, good for most tasks',
    size: '3.0 GB',
    sizeBytes: 3_000_000_000,
    minRAM: 8,
    quantization: 'Q4_K_M',
    url: 'https://huggingface.co/bartowski/google_gemma-3-4b-it-GGUF/resolve/main/google_gemma-3-4b-it-Q4_K_M.gguf',
    family: 'Gemma',
  },
  {
    id: 'llama3.2-3b',
    name: 'Llama 3.2 3B',
    description: 'Meta small model, solid general purpose',
    size: '2.0 GB',
    sizeBytes: 2_000_000_000,
    minRAM: 8,
    quantization: 'Q4_K_M',
    url: 'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf',
    family: 'Llama',
  },

  // ─── MEDIUM (16GB RAM) ────────────────────────────────────
  {
    id: 'deepseek-r1-7b',
    name: 'DeepSeek R1 7B',
    description: 'Strong reasoning and chain-of-thought',
    size: '4.7 GB',
    sizeBytes: 4_700_000_000,
    minRAM: 16,
    quantization: 'Q4_K_M',
    url: 'https://huggingface.co/bartowski/DeepSeek-R1-Distill-Qwen-7B-GGUF/resolve/main/DeepSeek-R1-Distill-Qwen-7B-Q4_K_M.gguf',
    family: 'DeepSeek',
  },
  {
    id: 'mistral-7b',
    name: 'Mistral 7B',
    description: 'Fast and efficient, great quality for size',
    size: '4.1 GB',
    sizeBytes: 4_100_000_000,
    minRAM: 16,
    quantization: 'Q4_K_M',
    url: 'https://huggingface.co/bartowski/Mistral-7B-Instruct-v0.3-GGUF/resolve/main/Mistral-7B-Instruct-v0.3-Q4_K_M.gguf',
    family: 'Mistral',
  },
  {
    id: 'qwen3-8b',
    name: 'Qwen 3 8B',
    description: 'Strong reasoning, coding, and chat',
    size: '5.2 GB',
    sizeBytes: 5_200_000_000,
    minRAM: 16,
    quantization: 'Q4_K_M',
    url: 'https://huggingface.co/bartowski/Qwen3-8B-GGUF/resolve/main/Qwen3-8B-Q4_K_M.gguf',
    family: 'Qwen',
  },
  {
    id: 'gemma3-12b',
    name: 'Gemma 3 12B',
    description: 'Google medium model, excellent quality',
    size: '8.0 GB',
    sizeBytes: 8_000_000_000,
    minRAM: 16,
    quantization: 'Q4_K_M',
    url: 'https://huggingface.co/bartowski/google_gemma-3-12b-it-GGUF/resolve/main/google_gemma-3-12b-it-Q4_K_M.gguf',
    family: 'Gemma',
  },
  {
    id: 'llama3.1-8b',
    name: 'Llama 3.1 8B',
    description: 'Meta workhorse model, great all-rounder',
    size: '4.9 GB',
    sizeBytes: 4_900_000_000,
    minRAM: 16,
    quantization: 'Q4_K_M',
    url: 'https://huggingface.co/bartowski/Meta-Llama-3.1-8B-Instruct-GGUF/resolve/main/Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf',
    family: 'Llama',
  },

  // ─── LARGE (32GB RAM) ─────────────────────────────────────
  {
    id: 'phi4-14b',
    name: 'Phi-4 14B',
    description: 'Microsoft, excellent at coding and reasoning',
    size: '8.4 GB',
    sizeBytes: 8_400_000_000,
    minRAM: 32,
    quantization: 'Q4_K_M',
    url: 'https://huggingface.co/bartowski/phi-4-GGUF/resolve/main/phi-4-Q4_K_M.gguf',
    family: 'Phi',
  },
  {
    id: 'deepseek-r1-14b',
    name: 'DeepSeek R1 14B',
    description: 'Advanced reasoning, math, and analysis',
    size: '9.0 GB',
    sizeBytes: 9_000_000_000,
    minRAM: 32,
    quantization: 'Q4_K_M',
    url: 'https://huggingface.co/bartowski/DeepSeek-R1-Distill-Qwen-14B-GGUF/resolve/main/DeepSeek-R1-Distill-Qwen-14B-Q4_K_M.gguf',
    family: 'DeepSeek',
  },
  {
    id: 'mistral-small-24b',
    name: 'Mistral Small 24B',
    description: 'Mistral flagship small, strong across all tasks',
    size: '14.0 GB',
    sizeBytes: 14_000_000_000,
    minRAM: 32,
    quantization: 'Q4_K_M',
    url: 'https://huggingface.co/bartowski/Mistral-Small-24B-Instruct-2501-GGUF/resolve/main/Mistral-Small-24B-Instruct-2501-Q4_K_M.gguf',
    family: 'Mistral',
  },
  {
    id: 'qwen3-14b',
    name: 'Qwen 3 14B',
    description: 'High quality reasoning and coding',
    size: '9.0 GB',
    sizeBytes: 9_000_000_000,
    minRAM: 32,
    quantization: 'Q4_K_M',
    url: 'https://huggingface.co/bartowski/Qwen3-14B-GGUF/resolve/main/Qwen3-14B-Q4_K_M.gguf',
    family: 'Qwen',
  },
  {
    id: 'gemma3-27b',
    name: 'Gemma 3 27B',
    description: 'Google large model, near-GPT-4 quality',
    size: '16.1 GB',
    sizeBytes: 16_100_000_000,
    minRAM: 32,
    quantization: 'Q4_K_M',
    url: 'https://huggingface.co/bartowski/google_gemma-3-27b-it-GGUF/resolve/main/google_gemma-3-27b-it-Q4_K_M.gguf',
    family: 'Gemma',
  },

  // ─── XL (64GB+ RAM) ───────────────────────────────────────
  {
    id: 'qwen3-32b',
    name: 'Qwen 3 32B',
    description: 'Top tier open model, excellent at everything',
    size: '20.0 GB',
    sizeBytes: 20_000_000_000,
    minRAM: 64,
    quantization: 'Q4_K_M',
    url: 'https://huggingface.co/bartowski/Qwen3-32B-GGUF/resolve/main/Qwen3-32B-Q4_K_M.gguf',
    family: 'Qwen',
  },
];

/**
 * Get models that fit this machine's RAM
 */
export function getCompatibleModels(): CatalogModel[] {
  const totalGB = Math.round(os.totalmem() / (1024 * 1024 * 1024));
  return MODEL_CATALOG.filter(m => m.minRAM <= totalGB);
}

/**
 * Get the best model for this machine's RAM
 */
export function getRecommendedModel(): CatalogModel | null {
  const compatible = getCompatibleModels();
  if (compatible.length === 0) return null;
  // Return the largest model that fits
  return compatible[compatible.length - 1];
}

/**
 * Find a model by ID or partial name match
 */
export function findModel(query: string): CatalogModel | null {
  const q = query.toLowerCase();
  return MODEL_CATALOG.find(m => m.id === q) ||
    MODEL_CATALOG.find(m => m.name.toLowerCase().includes(q)) ||
    MODEL_CATALOG.find(m => m.id.includes(q)) ||
    null;
}
