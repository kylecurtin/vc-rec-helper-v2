/* api.js — Anthropic client + streaming + tool loop */

import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.68.0';
import { TOOL_DEFINITIONS, recFromInput, applyRecPatch } from './tools.js';
import { SYSTEM_PROMPT } from './prompts.js';

export const MODELS = {
  standard: {
    id: 'claude-sonnet-4-6',
    maxTokens: 16000,
    effort: 'medium',
    label: 'Standard · Sonnet 4.6',
  },
  deep: {
    id: 'claude-opus-4-7',
    maxTokens: 32000,
    effort: 'xhigh',
    label: 'Deep · Opus 4.7',
  },
};

let _client = null;
let _lastKey = '';

export function getClient(apiKey) {
  if (!apiKey) return null;
  if (_client && _lastKey === apiKey) return _client;
  _client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  _lastKey = apiKey;
  return _client;
}

/** Quick connectivity test via Models API. Returns {ok, error}. */
export async function testKey(apiKey) {
  try {
    const c = getClient(apiKey);
    const m = await c.models.retrieve('claude-sonnet-4-6');
    return { ok: true, model: m.display_name };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}

/** Render company profile to a compact text block for the system prompt. */
function renderProfile(p) {
  const lines = [];
  if (p.company)      lines.push(`Company: ${p.company}`);
  if (p.sector)       lines.push(`Sector: ${p.sector}`);
  if (p.geography)    lines.push(`Geography: ${p.geography}`);
  if (p.revenue)      lines.push(`Revenue: $${(p.revenue / 1e6).toFixed(1)}M`);
  if (p.ebitda)       lines.push(`EBITDA: $${(p.ebitda / 1e6).toFixed(1)}M`);
  if (p.headcount)    lines.push(`Headcount: ${p.headcount}`);
  if (p.holdPeriod)   lines.push(`Hold Period: ${p.holdPeriod} years`);
  if (p.discountRate) lines.push(`Discount Rate: ${p.discountRate}%`);
  if (p.businessModel) lines.push(`\nBusiness Model: ${p.businessModel}`);
  if (p.dealThesis)    lines.push(`\nDeal Thesis: ${p.dealThesis}`);
  return lines.length ? `# Active Engagement Profile\n\n${lines.join('\n')}` : '';
}

/** Render current recommendations as a compact reference for Claude. */
function renderCurrentRecs(recs) {
  if (!recs?.length) return '';
  const lines = recs.map((r, i) => {
    const ss = Number(r.value?.steadyStateEbitda) || 0;
    const note = ss > 0 ? ` (~$${(ss / 1e6).toFixed(1)}M SS EBITDA)` : '';
    return `${i + 1}. [${r.id}] ${r.title} · ${r.category}${note}`;
  });
  return `# Current Recommendation Portfolio\n\nFor reference. When updating or deleting, use the bracketed id.\n\n${lines.join('\n')}`;
}

/** Build the system content array with cache breakpoints. */
function buildSystem(state) {
  const blocks = [{
    type: 'text',
    text: SYSTEM_PROMPT,
    cache_control: { type: 'ephemeral', ttl: '1h' },
  }];
  const profileText = renderProfile(state.profile);
  if (profileText) {
    blocks.push({
      type: 'text',
      text: profileText,
      cache_control: { type: 'ephemeral', ttl: '1h' },
    });
  }
  const recsText = renderCurrentRecs(state.recommendations);
  if (recsText) {
    // No cache breakpoint — this churns as recs are added
    blocks.push({ type: 'text', text: recsText });
  }
  return blocks;
}

/**
 * Convert stored chat history into API message format.
 * - Resolves document_ref blocks back to full document blocks (base64).
 * - Adds cache_control to: last document block (per message), last block of last message.
 */
function buildApiMessages(state) {
  const messages = [];
  const lastIdx = state.chat.messages.length - 1;

  for (let i = 0; i <= lastIdx; i++) {
    const m = state.chat.messages[i];
    const isLast = i === lastIdx;

    if (m.role === 'assistant') {
      messages.push({ role: 'assistant', content: m.content });
      continue;
    }

    // user or tool_results — both become user-role on the wire
    const sourceContent = m.role === 'tool_results' ? m.content : m.content;

    const content = sourceContent
      .map(b => {
        if (b.type === 'document_ref' && b.docId) {
          const doc = state.chat.documents.find(d => d.id === b.docId);
          if (!doc) return null;
          return {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: doc.base64 },
            title: doc.filename,
          };
        }
        return { ...b };
      })
      .filter(Boolean);

    if (content.length === 0) continue;

    // Cache the last document block in this message (covers preceding docs too)
    let lastDocIdx = -1;
    for (let j = 0; j < content.length; j++) {
      if (content[j].type === 'document') lastDocIdx = j;
    }
    if (lastDocIdx >= 0) {
      content[lastDocIdx].cache_control = { type: 'ephemeral' };
    }

    // Cache the last block of the last message (multi-turn cache anchor)
    if (isLast) {
      content[content.length - 1].cache_control = { type: 'ephemeral' };
    }

    messages.push({ role: 'user', content });
  }

  return messages;
}

/**
 * Run one chat turn.
 *
 * handlers:
 *   onUserStored(msg)
 *   onAssistantStart()
 *   onTextDelta(delta)
 *   onToolCall({name, input, ok, resultText, id})
 *   onAssistantStored(msg)
 *   onUsage(usage, modelId)
 *   onError(err)
 *   onDone()
 */
export async function runTurn({ state, apiKey, mode, userText, handlers, abortSignal }) {
  const client = getClient(apiKey);
  if (!client) {
    handlers.onError?.(new Error('No API key set.'));
    return;
  }

  const model = MODELS[mode] || MODELS.standard;

  // Determine if this is the first user turn AND there are unsent documents
  const isFirstUserTurn = !state.chat.messages.some(m => m.role === 'user');
  const attachDocs = isFirstUserTurn && state.chat.documents.length > 0;

  // Build & store the user message
  const userMsg = {
    id: 'm_' + Math.random().toString(36).slice(2, 10),
    role: 'user',
    timestamp: Date.now(),
    content: [
      ...(attachDocs
        ? state.chat.documents.map(d => ({ type: 'document_ref', docId: d.id }))
        : []),
      { type: 'text', text: userText },
    ],
  };
  state.chat.messages.push(userMsg);
  handlers.onUserStored?.(userMsg);

  // Tool-call loop
  let guard = 0;
  while (guard++ < 20) {
    if (abortSignal?.aborted) {
      handlers.onError?.(new Error('Cancelled.'));
      return;
    }

    handlers.onAssistantStart?.();

    let stream;
    try {
      stream = client.messages.stream({
        model: model.id,
        max_tokens: model.maxTokens,
        thinking: { type: 'adaptive' },
        output_config: { effort: model.effort },
        system: buildSystem(state),
        tools: TOOL_DEFINITIONS,
        messages: buildApiMessages(state),
      });
    } catch (err) {
      handlers.onError?.(err);
      return;
    }

    stream.on('text', (delta) => {
      if (abortSignal?.aborted) return;
      handlers.onTextDelta?.(delta);
    });

    let finalMsg;
    try {
      finalMsg = await stream.finalMessage();
    } catch (err) {
      handlers.onError?.(err);
      return;
    }

    const assistantMsg = {
      id: 'm_' + Math.random().toString(36).slice(2, 10),
      role: 'assistant',
      timestamp: Date.now(),
      content: finalMsg.content,
      usage: finalMsg.usage,
      model: model.id,
    };
    state.chat.messages.push(assistantMsg);
    handlers.onAssistantStored?.(assistantMsg);
    handlers.onUsage?.(finalMsg.usage, model.id);

    if (finalMsg.stop_reason === 'end_turn') {
      handlers.onDone?.();
      return;
    }

    if (finalMsg.stop_reason === 'tool_use') {
      const toolUses = finalMsg.content.filter(b => b.type === 'tool_use');
      const toolResults = [];
      for (const tu of toolUses) {
        let resultText = '';
        let isError = false;
        try {
          resultText = executeTool(state, tu.name, tu.input);
          if (resultText.startsWith('Error:')) isError = true;
        } catch (err) {
          resultText = `Error: ${err.message}`;
          isError = true;
        }
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          content: resultText,
          ...(isError ? { is_error: true } : {}),
        });
        handlers.onToolCall?.({ name: tu.name, input: tu.input, ok: !isError, resultText, id: tu.id });
      }
      state.chat.messages.push({
        id: 'm_' + Math.random().toString(36).slice(2, 10),
        role: 'tool_results',
        timestamp: Date.now(),
        content: toolResults,
      });
      continue;
    }

    if (finalMsg.stop_reason === 'pause_turn') continue;

    handlers.onError?.(new Error(`Stopped: ${finalMsg.stop_reason || 'unknown'}`));
    return;
  }

  handlers.onError?.(new Error('Loop guard exceeded (too many tool-use iterations).'));
}

/** Execute a tool client-side; returns a brief result string for the model. */
export function executeTool(state, name, input) {
  switch (name) {
    case 'set_company_profile': {
      Object.assign(state.profile, sanitizeProfile(input));
      return `Profile set for ${input.company || 'target'}.`;
    }
    case 'add_recommendation': {
      const rec = recFromInput(input);
      state.recommendations.push(rec);
      return `Added "${rec.title}" with id ${rec.id}.`;
    }
    case 'update_recommendation': {
      const rec = state.recommendations.find(r => r.id === input.id);
      if (!rec) return `Error: no recommendation with id ${input.id}.`;
      applyRecPatch(rec, input.patch || {});
      return `Updated ${input.id}.`;
    }
    case 'delete_recommendation': {
      const before = state.recommendations.length;
      state.recommendations = state.recommendations.filter(r => r.id !== input.id);
      return state.recommendations.length < before
        ? `Deleted ${input.id}.`
        : `Error: no recommendation with id ${input.id}.`;
    }
    default:
      return `Error: unknown tool ${name}.`;
  }
}

function sanitizeProfile(input) {
  const out = {};
  for (const [k, v] of Object.entries(input || {})) {
    if (v === null || v === undefined || v === '') continue;
    out[k] = v;
  }
  return out;
}
