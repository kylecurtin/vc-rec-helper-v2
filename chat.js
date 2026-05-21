/* chat.js — chat panel rendering, composer, streaming */

import { catById } from './tools.js';

const $ = (sel, root = document) => root.querySelector(sel);

function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) n.setAttribute(k, v);
  }
  for (const c of children) {
    if (c == null || c === false) continue;
    n.append(c.nodeType ? c : document.createTextNode(c));
  }
  return n;
}

function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// Minimal markdown-ish renderer: paragraphs, bold, italic, code, lists.
function renderInlineMd(text) {
  let s = escapeHTML(text);
  // Code spans
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Bold (greedy avoidance — non-** before/after)
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Italic
  s = s.replace(/(^|[^\*])\*([^\*]+)\*([^\*]|$)/g, '$1<em>$2</em>$3');
  return s;
}

function renderMarkdown(text) {
  if (!text) return '';
  // Split on blank lines for paragraphs
  const blocks = text.split(/\n{2,}/);
  return blocks.map(blk => {
    const trimmed = blk.trim();
    if (!trimmed) return '';
    // Bullet list
    if (/^[-*•] /.test(trimmed.split('\n')[0])) {
      const items = trimmed.split('\n').map(l => l.replace(/^[-*•]\s+/, '')).map(l => `<li>${renderInlineMd(l)}</li>`).join('');
      return `<ul>${items}</ul>`;
    }
    // Numbered list
    if (/^\d+[.)] /.test(trimmed.split('\n')[0])) {
      const items = trimmed.split('\n').map(l => l.replace(/^\d+[.)]\s+/, '')).map(l => `<li>${renderInlineMd(l)}</li>`).join('');
      return `<ol>${items}</ol>`;
    }
    // Paragraph (preserve internal single newlines as <br>)
    return `<p>${renderInlineMd(trimmed).replace(/\n/g, '<br>')}</p>`;
  }).join('');
}

/* =================================================================
   PUBLIC API
   ================================================================= */

export function renderChat(state) {
  const messagesEl = $('#chat-messages');
  const emptyEl = $('#chat-empty');
  messagesEl.innerHTML = '';

  const visibleMessages = state.chat.messages.filter(m => m.role !== 'tool_results');
  if (visibleMessages.length === 0) {
    emptyEl.style.display = '';
    return;
  }
  emptyEl.style.display = 'none';

  visibleMessages.forEach(m => messagesEl.append(renderMessage(state, m)));
  scrollChatToBottom();
}

export function renderMessage(state, msg) {
  if (msg.role === 'user') return renderUserMessage(state, msg);
  if (msg.role === 'assistant') return renderAssistantMessage(state, msg);
  return null;
}

function renderUserMessage(state, msg) {
  const wrap = el('div', { class: 'msg msg-user', 'data-msg-id': msg.id });
  wrap.append(el('div', { class: 'msg-meta' }, 'You'));

  const bubble = el('div', { class: 'msg-bubble' });

  // Doc chips
  const docs = msg.content.filter(b => b.type === 'document_ref');
  if (docs.length) {
    const chips = el('div', { style: 'margin-bottom: 8px;' });
    docs.forEach(d => {
      const doc = state.chat.documents.find(x => x.id === d.docId);
      const name = doc?.filename || 'document';
      chips.append(el('span', { class: 'msg-doc-chip' },
        el('span', { class: 'msg-doc-icon' }, '📄'),
        name,
      ));
    });
    bubble.append(chips);
  }

  const text = msg.content.find(b => b.type === 'text')?.text || '';
  const textEl = el('div', { class: 'msg-content' });
  textEl.innerHTML = renderMarkdown(text);
  bubble.append(textEl);

  wrap.append(bubble);
  return wrap;
}

function renderAssistantMessage(state, msg) {
  const wrap = el('div', { class: 'msg msg-assistant', 'data-msg-id': msg.id });
  const meta = el('div', { class: 'msg-meta' }, 'STRATA');
  if (msg.model) meta.append(' · ', el('span', { style: 'color: var(--forest);' }, modelShort(msg.model)));
  wrap.append(meta);

  // Render content blocks in order — text becomes a bubble, tool_use becomes a card
  for (const block of msg.content) {
    if (block.type === 'text') {
      const bubble = el('div', { class: 'msg-bubble' });
      const textEl = el('div', { class: 'msg-content' });
      textEl.innerHTML = renderMarkdown(block.text);
      bubble.append(textEl);
      wrap.append(bubble);
    } else if (block.type === 'tool_use') {
      wrap.append(renderToolCallCard({ name: block.name, input: block.input, ok: true }));
    } else if (block.type === 'thinking') {
      // Optional: show summarized thinking if non-empty
      if (block.thinking && block.thinking.trim()) {
        const tBubble = el('details', { class: 'msg-thinking', style: 'margin-bottom: 6px; font-family: var(--mono); font-size: 11px; color: var(--ink-3);' });
        tBubble.append(el('summary', { style: 'cursor: pointer; color: var(--ink-4); letter-spacing: 0.08em; text-transform: uppercase; font-size: 10px;' }, 'thinking ⌄'));
        tBubble.append(el('div', { style: 'padding: 8px 12px; background: var(--paper-3); margin-top: 4px; border-left: 2px solid var(--ink-4);' }, block.thinking));
        wrap.append(tBubble);
      }
    }
  }

  // Usage chip
  if (msg.usage) {
    const u = msg.usage;
    const tin = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
    const tout = u.output_tokens || 0;
    const cacheNote = u.cache_read_input_tokens
      ? ` · cache ${(u.cache_read_input_tokens / 1000).toFixed(1)}k`
      : '';
    wrap.append(el('div', { class: 'msg-usage' }, `${(tin/1000).toFixed(1)}k in · ${(tout/1000).toFixed(1)}k out${cacheNote}`));
  }
  return wrap;
}

function modelShort(modelId) {
  if (modelId === 'claude-opus-4-7') return 'opus 4.7';
  if (modelId === 'claude-sonnet-4-6') return 'sonnet 4.6';
  if (modelId === 'claude-haiku-4-5') return 'haiku 4.5';
  return modelId;
}

function renderToolCallCard({ name, input, ok, resultText }) {
  // Detail text describes the tool call
  let categoryColor = 'var(--forest)';
  let detail = '';
  let displayName = name;
  switch (name) {
    case 'set_company_profile':
      displayName = 'Set company profile';
      detail = input.company
        ? `${input.company}${input.sector ? ' · ' + input.sector : ''}`
        : 'Updated company profile';
      break;
    case 'add_recommendation':
      displayName = 'Add recommendation';
      const cat = catById(input.category);
      categoryColor = cat.color;
      detail = input.title || 'Untitled';
      break;
    case 'update_recommendation':
      displayName = 'Update recommendation';
      detail = `${input.id} · ${Object.keys(input.patch || {}).length} field${Object.keys(input.patch || {}).length === 1 ? '' : 's'}`;
      break;
    case 'delete_recommendation':
      displayName = 'Delete recommendation';
      categoryColor = 'var(--terra)';
      detail = input.id;
      break;
    default:
      detail = JSON.stringify(input).slice(0, 80);
  }
  return el('div', {
    class: 'tool-call' + (ok ? '' : ' tool-call-error'),
    style: `--cat-color:${categoryColor}`,
  },
    el('span', { class: 'tool-call-icon' }, '⚙'),
    el('div', { class: 'tool-call-body' },
      el('div', { class: 'tool-call-name' }, displayName),
      el('div', { class: 'tool-call-detail' }, detail),
    ),
    el('span', { class: 'tool-call-status' }, ok ? '✓' : '!'),
  );
}

/* =================================================================
   STREAMING ASSISTANT MESSAGE
   ================================================================= */
let _streamingMsgEl = null;
let _streamingTextEl = null;
let _streamingBubbleEl = null;

export function startStreamingMessage(modelId) {
  const messagesEl = $('#chat-messages');
  $('#chat-empty').style.display = 'none';

  _streamingMsgEl = el('div', { class: 'msg msg-assistant' });
  const meta = el('div', { class: 'msg-meta' }, 'STRATA');
  if (modelId) meta.append(' · ', el('span', { style: 'color: var(--forest);' }, modelShort(modelId)));
  _streamingMsgEl.append(meta);

  _streamingBubbleEl = el('div', { class: 'msg-bubble' });
  _streamingTextEl = el('div', { class: 'msg-content streaming' });
  _streamingBubbleEl.append(_streamingTextEl);
  _streamingMsgEl.append(_streamingBubbleEl);

  messagesEl.append(_streamingMsgEl);
  scrollChatToBottom();
}

export function appendStreamDelta(delta) {
  if (!_streamingTextEl) return;
  // Streaming: don't re-render markdown on every chunk; just append text
  // We'll convert to markdown on commit. For now, escape and use innerText accumulator.
  const current = _streamingTextEl.getAttribute('data-raw') || '';
  const next = current + delta;
  _streamingTextEl.setAttribute('data-raw', next);
  // Use textContent to avoid HTML injection during streaming
  _streamingTextEl.textContent = next;
  scrollChatToBottom();
}

export function appendStreamToolCall(call) {
  if (!_streamingMsgEl) return;
  // Close current text bubble if it had content; start a new one after the tool call
  if (_streamingTextEl) {
    const raw = _streamingTextEl.getAttribute('data-raw') || '';
    if (raw) {
      // Convert to rendered markdown now
      _streamingTextEl.innerHTML = renderMarkdown(raw);
    }
    _streamingTextEl.classList.remove('streaming');
  }
  _streamingMsgEl.append(renderToolCallCard(call));

  // New bubble for subsequent text
  _streamingBubbleEl = el('div', { class: 'msg-bubble', style: 'margin-top: 6px;' });
  _streamingTextEl = el('div', { class: 'msg-content streaming' });
  _streamingBubbleEl.append(_streamingTextEl);
  _streamingMsgEl.append(_streamingBubbleEl);
  scrollChatToBottom();
}

export function commitStreamingMessage(usage) {
  if (!_streamingTextEl) return;
  // Convert raw text to markdown
  const raw = _streamingTextEl.getAttribute('data-raw') || '';
  if (raw) {
    _streamingTextEl.innerHTML = renderMarkdown(raw);
  } else {
    // Empty trailing bubble — remove it
    _streamingBubbleEl.remove();
  }
  _streamingTextEl.classList.remove('streaming');

  if (usage && _streamingMsgEl) {
    const tin = (usage.input_tokens || 0) + (usage.cache_read_input_tokens || 0) + (usage.cache_creation_input_tokens || 0);
    const tout = usage.output_tokens || 0;
    const cacheNote = usage.cache_read_input_tokens
      ? ` · cache ${(usage.cache_read_input_tokens / 1000).toFixed(1)}k`
      : '';
    _streamingMsgEl.append(el('div', { class: 'msg-usage' }, `${(tin/1000).toFixed(1)}k in · ${(tout/1000).toFixed(1)}k out${cacheNote}`));
  }

  _streamingMsgEl = null;
  _streamingTextEl = null;
  _streamingBubbleEl = null;
}

export function discardStreamingMessage() {
  if (_streamingMsgEl) _streamingMsgEl.remove();
  _streamingMsgEl = null;
  _streamingTextEl = null;
  _streamingBubbleEl = null;
}

/* =================================================================
   USER MESSAGE APPEND (immediate, before API call)
   ================================================================= */
export function appendUserMessage(state, msg) {
  $('#chat-empty').style.display = 'none';
  const messagesEl = $('#chat-messages');
  messagesEl.append(renderUserMessage(state, msg));
  scrollChatToBottom();
}

/* =================================================================
   SCROLL
   ================================================================= */
export function scrollChatToBottom() {
  const s = $('#chat-scroll');
  if (s) s.scrollTop = s.scrollHeight;
}

/* =================================================================
   ATTACHED FILES UI
   ================================================================= */
export function renderAttachedFiles(state) {
  const wrap = $('#attached-files');
  wrap.innerHTML = '';
  if (state.chat.documents.length === 0) {
    wrap.hidden = true;
    return;
  }
  wrap.hidden = false;
  state.chat.documents.forEach(doc => {
    wrap.append(el('div', { class: 'attached-chip' },
      el('span', { class: 'msg-doc-icon' }, '📄'),
      el('span', { class: 'attached-chip-name' }, doc.filename),
      el('span', { class: 'attached-chip-size' }, `${(doc.sizeBytes / 1024 / 1024).toFixed(1)}MB`),
      el('button', {
        class: 'attached-chip-remove',
        'aria-label': 'Remove',
        onclick: () => {
          state.chat.documents = state.chat.documents.filter(d => d.id !== doc.id);
          renderAttachedFiles(state);
        },
      }, '×'),
    ));
  });
}

/* =================================================================
   ERROR MESSAGES (system-level)
   ================================================================= */
export function appendErrorMessage(text) {
  const messagesEl = $('#chat-messages');
  $('#chat-empty').style.display = 'none';
  const m = el('div', { class: 'msg msg-system' });
  m.append(el('div', {
    style: 'background: var(--terra-tint); color: var(--terra); border: 1px solid var(--terra); padding: 10px 14px; border-radius: var(--radius); font-family: var(--sans); font-size: 12.5px; max-width: 90%;',
  }, text));
  messagesEl.append(m);
  scrollChatToBottom();
}
