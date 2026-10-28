/**
 * 👑 BLESSING POWER GUIDE — MULTI-PROVIDER AI MODEL ROUTER
 * Seamlessly routes LLM queries between Groq, NVIDIA NIM, and Gemini
 * with automatic failover, vision/document routing, and zero-downtime resilience.
 */

export type ModelCapability = 'fast' | 'reasoning' | 'vision' | 'document';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | any[];
  name?: string;
  tool_call_id?: string;
}

export interface ModelCompletionOptions {
  messages: ChatMessage[];
  capability?: ModelCapability;
  temperature?: number;
  maxTokens?: number;
  tools?: any[];
  tool_choice?: any;
  preferredProvider?: 'groq' | 'nvidia' | 'auto';
}

export interface ModelCompletionResult {
  content: string;
  tool_calls?: any[];
  provider: 'groq' | 'nvidia' | 'gemini' | 'fallback';
  model: string;
}

const GROQ_FAST_MODEL = 'qwen/qwen3.8-27b';
const GROQ_INSTANT_MODEL = 'openai/gpt-oss-20b';
const NVIDIA_VISION_MODEL = 'meta/llama-3.2-11b-vision-instruct';

/**
 * Universal chat completion with multi-provider failover.
 */
export async function completeWithAI(options: ModelCompletionOptions): Promise<ModelCompletionResult> {
  const hasImage = options.messages.some(
    (m) => Array.isArray(m.content) && m.content.some((part: any) => part.type === 'image_url')
  );
  const capability = hasImage ? 'vision' : (options.capability || 'fast');
  const preferred = hasImage ? 'nvidia' : (options.preferredProvider || 'auto');

  const groqApiKey = process.env.GROQ_API_KEY;
  const nvidiaApiKey = process.env.NVIDIA_API_KEY || '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';

  // 1. If capability is vision or documents with images, route to NVIDIA Vision first
  if (capability === 'vision' && nvidiaApiKey) {
    try {
      const nvResult = await callNvidiaNim(options, nvidiaApiKey, NVIDIA_VISION_MODEL);
      if (nvResult) return nvResult;
    } catch (nvErr) {
      console.warn('[ModelRouter] NVIDIA Vision failed, falling back:', nvErr);
    }
  }

  // 2. If Groq is available and preferred/auto, use Groq for ultra-fast response
  if (groqApiKey && (preferred === 'groq' || preferred === 'auto')) {
    try {
      const model = capability === 'fast' ? GROQ_FAST_MODEL : GROQ_FAST_MODEL;
      const res = await callGroq(options, groqApiKey, model);
      if (res) return res;
    } catch (groqErr) {
      console.warn('[ModelRouter] Groq primary failed, failing over to NVIDIA NIM:', groqErr);
    }
  }

  // 3. Failover / Preferred: NVIDIA NIM
  if (nvidiaApiKey) {
    try {
      const nvResult = await callNvidiaNim(options, nvidiaApiKey, NVIDIA_VISION_MODEL);
      if (nvResult) return nvResult;
    } catch (nvErr) {
      console.warn('[ModelRouter] NVIDIA NIM failed:', nvErr);
    }
  }

  // 4. Secondary fallback to Groq Instant
  if (groqApiKey) {
    try {
      const res = await callGroq(options, groqApiKey, GROQ_INSTANT_MODEL);
      if (res) return res;
    } catch (_) {}
  }

  throw new Error('[ModelRouter] All configured LLM providers (Groq & NVIDIA NIM) were unavailable.');
}

async function callGroq(
  opts: ModelCompletionOptions,
  apiKey: string,
  model: string
): Promise<ModelCompletionResult | null> {
  const body: any = {
    model,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.2,
    max_tokens: opts.maxTokens ?? 1024,
  };
  if (opts.tools && opts.tools.length > 0) {
    body.tools = opts.tools;
    if (opts.tool_choice) body.tool_choice = opts.tool_choice;
  }

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) BlessingPowerGuide/1.0',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Groq error ${res.status}: ${errText.slice(0, 200)}`);
  }

  const json = await res.json();
  const choice = json.choices?.[0]?.message;
  if (!choice) return null;

  return {
    content: choice.content || '',
    tool_calls: choice.tool_calls || undefined,
    provider: 'groq',
    model,
  };
}

async function callNvidiaNim(
  opts: ModelCompletionOptions,
  apiKey: string,
  model: string
): Promise<ModelCompletionResult | null> {
  const body: any = {
    model,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.2,
    max_tokens: opts.maxTokens ?? 1024,
  };

  const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) BlessingPowerGuide/1.0',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`NVIDIA NIM error ${res.status}: ${errText.slice(0, 200)}`);
  }

  const json = await res.json();
  const choice = json.choices?.[0]?.message;
  if (!choice) return null;

  return {
    content: choice.content || '',
    tool_calls: choice.tool_calls || undefined,
    provider: 'nvidia',
    model,
  };
}
