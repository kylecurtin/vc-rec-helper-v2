/* main.js — entry point, init, event wiring */

import {
  loadState, persistState, loadKey, saveKey, loadSettings, saveSettings,
  loadUsage, saveUsage, calcCost, defaultState, defaultRec,
} from './state.js';
import { runTurn, testKey, MODELS, executeTool } from './api.js';
import { CATEGORIES, recFromInput } from './tools.js';
import {
  renderCompanyPanel, renderRecommendationsPanel, renderDashboardPanel, renderReportPanel,
  openReport, closeReport,
} from './artifacts.js';
import {
  renderChat, appendUserMessage, renderAttachedFiles,
  startStreamingMessage, appendStreamDelta, appendStreamToolCall, commitStreamingMessage, discardStreamingMessage,
  appendErrorMessage, scrollChatToBottom,
} from './chat.js';
import { DEMO_SCRIPT, DEMO_USER_PROMPT, DEMO_CHAR_DELAY_MS, DEMO_TOOL_DELAY_MS } from './demo.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

// Singletons exposed for cross-module access (used sparingly)
let state = defaultState();
let settings = loadSettings();
let usage = loadUsage();
let abortCtrl = null;

window.__strataState = state;

/* =================================================================
   INIT
   ================================================================= */
function init() {
  state = loadState();
  settings = loadSettings();
  usage = loadUsage();
  window.__strataState = state;

  renderAll();
  wireTopbar();
  wireTabs();
  wireComposer();
  wireSettingsModal();
  wireKeyBanner();
  wireReport();
  wireModeToggle();
  updateUsageMeter();
  updateKeyBannerVisibility();
  updateEngagementPill();
}

function renderAll() {
  renderChat(state);
  renderAttachedFiles(state);
  renderCompanyPanel(state, onArtifactChange);
  renderRecommendationsPanel(state, onArtifactChange);
  renderDashboardPanel(state);
  renderReportPanel(state);
  updateRecsBadge();
}

function onArtifactChange() {
  persistState(state);
  renderCompanyPanel(state, onArtifactChange);
  renderRecommendationsPanel(state, onArtifactChange);
  renderDashboardPanel(state);
  renderReportPanel(state);
  updateRecsBadge();
  updateEngagementPill();
}

function updateRecsBadge() {
  const b = $('#recs-badge');
  if (b) b.textContent = String(state.recommendations.length);
}

function updateEngagementPill() {
  const pill = $('#engagement-pill');
  pill.textContent = state.profile.company || '— Untitled engagement —';
}

/* =================================================================
   TABS
   ================================================================= */
function wireTabs() {
  $$('.tab').forEach(t => {
    t.addEventListener('click', () => activateTab(t.dataset.tab));
  });
  // Restore active tab
  if (state.ui.activeTab) activateTab(state.ui.activeTab);
}
function activateTab(name) {
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  $$('.tab-panel').forEach(p => p.classList.toggle('active', p.dataset.panel === name));
  state.ui.activeTab = name;
  persistState(state);
}

/* =================================================================
   TOP BAR
   ================================================================= */
function wireTopbar() {
  $('#btn-settings').addEventListener('click', openSettings);
  $('#btn-demo').addEventListener('click', runDemo);
  $('#btn-sample').addEventListener('click', loadSampleEngagement);
  $('#btn-export').addEventListener('click', exportJSON);
  $('#btn-import').addEventListener('click', () => $('#file-import').click());
  $('#file-import').addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (f) importJSON(f);
    e.target.value = '';
  });
  $('#btn-reset').addEventListener('click', resetEverything);
}

function wireModeToggle() {
  $$('.chat-head-mode .mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const m = btn.dataset.mode;
      state.ui.mode = m;
      $$('.chat-head-mode .mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === m));
      persistState(state);
    });
  });
  // Restore mode
  $$('.chat-head-mode .mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === state.ui.mode));
}

/* =================================================================
   COMPOSER
   ================================================================= */
function wireComposer() {
  const input = $('#composer-input');
  const sendBtn = $('#btn-send');
  const stopBtn = $('#btn-stop');
  const attachBtn = $('#btn-attach');
  const fileInput = $('#file-attach');
  const composer = $('.composer');

  input.addEventListener('input', () => autoresize(input));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      send();
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      send();
    }
  });

  sendBtn.addEventListener('click', send);
  stopBtn.addEventListener('click', () => {
    if (abortCtrl) abortCtrl.abort();
  });
  attachBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async (e) => {
    for (const f of e.target.files) await handleFileAttach(f);
    e.target.value = '';
  });

  // Hint clicks
  $$('.hint').forEach(h => {
    h.addEventListener('click', () => {
      input.value = h.dataset.prompt || '';
      autoresize(input);
      input.focus();
    });
  });

  // Drag & drop
  composer.addEventListener('dragover', (e) => { e.preventDefault(); composer.classList.add('drag-over'); });
  composer.addEventListener('dragleave', () => composer.classList.remove('drag-over'));
  composer.addEventListener('drop', async (e) => {
    e.preventDefault();
    composer.classList.remove('drag-over');
    for (const f of e.dataTransfer.files) await handleFileAttach(f);
  });
}

function autoresize(input) {
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 240) + 'px';
}

async function handleFileAttach(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'pdf') {
    if (file.size > 30 * 1024 * 1024) {
      appendErrorMessage(`"${file.name}" is ${(file.size/1024/1024).toFixed(1)}MB — over 30MB inline limit. Consider splitting.`);
      return;
    }
    const base64 = await fileToBase64(file);
    state.chat.documents.push({
      id: 'doc_' + Math.random().toString(36).slice(2, 10),
      filename: file.name,
      sizeBytes: file.size,
      base64,
      addedAt: Date.now(),
    });
    renderAttachedFiles(state);
    persistState(state);
  } else if (ext === 'xlsx' || ext === 'xls') {
    try {
      const XLSX = await import('https://esm.sh/xlsx@0.18.5');
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheetTexts = wb.SheetNames.map(name => {
        const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name]);
        return `## ${name}\n\n${csv}`;
      });
      const combined = `# ${file.name} (Excel)\n\n${sheetTexts.join('\n\n')}`;
      // Append to composer input
      const input = $('#composer-input');
      input.value = input.value
        ? input.value + '\n\n--- Attached: ' + file.name + ' ---\n\n' + combined
        : combined;
      autoresize(input);
    } catch (err) {
      appendErrorMessage(`Could not parse "${file.name}": ${err.message}`);
    }
  } else {
    appendErrorMessage(`Unsupported file type "${ext}". Use PDF or Excel.`);
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result.split(',')[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

async function send() {
  const input = $('#composer-input');
  const text = input.value.trim();
  if (!text) return;

  const apiKey = loadKey();
  if (!apiKey) {
    appendErrorMessage('No Anthropic API key set. Open Settings (⚙) to add one, or click ▶ Demo to see a canned conversation.');
    return;
  }

  input.value = '';
  autoresize(input);
  setSendingUI(true);

  abortCtrl = new AbortController();
  await runTurn({
    state,
    apiKey,
    mode: state.ui.mode,
    userText: text,
    abortSignal: abortCtrl.signal,
    handlers: {
      onUserStored: (msg) => {
        appendUserMessage(state, msg);
        // Documents have been consumed by this turn — clear the chip tray
        renderAttachedFiles(state);
        persistState(state);
      },
      onAssistantStart: () => {
        startStreamingMessage(MODELS[state.ui.mode].id);
      },
      onTextDelta: (delta) => appendStreamDelta(delta),
      onToolCall: (call) => {
        appendStreamToolCall(call);
        // Re-render artifacts as state mutated
        renderCompanyPanel(state, onArtifactChange);
        renderRecommendationsPanel(state, onArtifactChange);
        renderDashboardPanel(state);
        renderReportPanel(state);
        updateRecsBadge();
        updateEngagementPill();
        persistState(state);
      },
      onAssistantStored: (msg) => {
        commitStreamingMessage(msg.usage);
        persistState(state);
      },
      onUsage: (u, modelId) => {
        accumulateUsage(u, modelId);
      },
      onError: (err) => {
        discardStreamingMessage();
        appendErrorMessage(formatApiError(err));
        setSendingUI(false);
      },
      onDone: () => {
        setSendingUI(false);
      },
    },
  });
}

function formatApiError(err) {
  const m = err.message || String(err);
  if (m.includes('401') || m.includes('authentication')) return 'Authentication failed — check your API key in Settings.';
  if (m.includes('429')) return 'Rate limit hit — wait a moment and try again.';
  if (m.includes('insufficient_quota') || m.includes('credit')) return 'Insufficient API credits — top up at console.anthropic.com.';
  return 'Error: ' + m;
}

function setSendingUI(sending) {
  $('#btn-send').hidden = sending;
  $('#btn-stop').hidden = !sending;
  $('#composer-input').disabled = sending;
  $('#composer-status').textContent = sending
    ? 'Generating… click ■ Stop to cancel'
    : 'Press Enter to send · Shift+Enter for newline';
}

/* =================================================================
   USAGE METER
   ================================================================= */
function accumulateUsage(u, modelId) {
  const cost = calcCost(modelId, u);
  usage.session.inputTokens += u.input_tokens || 0;
  usage.session.outputTokens += u.output_tokens || 0;
  usage.session.cacheReadTokens += u.cache_read_input_tokens || 0;
  usage.session.cacheWriteTokens += u.cache_creation_input_tokens || 0;
  usage.session.cost += cost;
  usage.allTime.cost += cost;
  saveUsage(usage);
  updateUsageMeter();
}
function updateUsageMeter() {
  const totalTokens = usage.session.inputTokens + usage.session.outputTokens + usage.session.cacheReadTokens + usage.session.cacheWriteTokens;
  const tk = totalTokens >= 1000 ? `${(totalTokens / 1000).toFixed(1)}k tok` : `${totalTokens} tok`;
  $('#usage-tokens').textContent = tk;
  $('#usage-cost').textContent = '$' + usage.session.cost.toFixed(2);
}

/* =================================================================
   SETTINGS MODAL
   ================================================================= */
function wireSettingsModal() {
  const modal = $('#settings-modal');
  modal.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => modal.hidden = true));

  $('#settings-key-toggle').addEventListener('click', () => {
    const input = $('#settings-key');
    input.type = input.type === 'password' ? 'text' : 'password';
  });

  $('#settings-key-test').addEventListener('click', async () => {
    const key = $('#settings-key').value.trim();
    if (!key) { setKeyStatus('Enter a key first', 'err'); return; }
    setKeyStatus('Testing…', '');
    const result = await testKey(key);
    if (result.ok) setKeyStatus(`✓ Connected · ${result.model}`, 'ok');
    else setKeyStatus(`Failed: ${result.error}`, 'err');
  });

  $('#settings-save').addEventListener('click', () => {
    const key = $('#settings-key').value.trim();
    saveKey(key);
    saveSettings(settings);
    updateKeyBannerVisibility();
    modal.hidden = true;
  });

  // Settings mode toggle
  $$('.settings-mode-toggle .mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const m = btn.dataset.setMode;
      settings.defaultMode = m;
      $$('.settings-mode-toggle .mode-btn').forEach(b => b.classList.toggle('active', b.dataset.setMode === m));
    });
  });

  // ESC to close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) modal.hidden = true;
  });
}
function openSettings() {
  $('#settings-key').value = loadKey();
  $('#settings-key').type = 'password';
  setKeyStatus('', '');
  $$('.settings-mode-toggle .mode-btn').forEach(b => b.classList.toggle('active', b.dataset.setMode === settings.defaultMode));
  $('#settings-session-tokens').textContent = `${usage.session.inputTokens} / ${usage.session.outputTokens}`;
  $('#settings-session-cost').textContent = '$' + usage.session.cost.toFixed(4);
  $('#settings-alltime-cost').textContent = '$' + usage.allTime.cost.toFixed(4);
  $('#settings-modal').hidden = false;
}
function setKeyStatus(text, cls) {
  const el = $('#settings-key-status');
  el.className = 'key-status' + (cls ? ' ' + cls : '');
  el.textContent = text;
}

/* =================================================================
   KEY BANNER
   ================================================================= */
function wireKeyBanner() {
  $('#banner-settings-link').addEventListener('click', openSettings);
  $('#banner-demo-link').addEventListener('click', runDemo);
  $('#key-banner-close').addEventListener('click', () => {
    settings.bannerDismissed = true;
    saveSettings(settings);
    $('#key-banner').hidden = true;
  });
}
function updateKeyBannerVisibility() {
  const hasKey = !!loadKey();
  $('#key-banner').hidden = hasKey || settings.bannerDismissed;
}

/* =================================================================
   REPORT
   ================================================================= */
function wireReport() {
  $('#btn-close-report').addEventListener('click', closeReport);
  $('#btn-print').addEventListener('click', () => window.print());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#report-overlay').hidden) closeReport();
  });
}

/* =================================================================
   DEMO MODE
   ================================================================= */
async function runDemo() {
  // Clear existing state for clean demo
  if (state.recommendations.length || state.chat.messages.length) {
    if (!confirm('Demo will clear the current engagement. Continue?')) return;
  }
  state.profile = defaultState().profile;
  state.recommendations = [];
  state.chat.messages = [];
  state.chat.documents = [];
  renderAll();

  // Append user message
  const userMsg = {
    id: 'm_' + Math.random().toString(36).slice(2, 10),
    role: 'user',
    timestamp: Date.now(),
    content: [{ type: 'text', text: DEMO_USER_PROMPT }],
  };
  state.chat.messages.push(userMsg);
  appendUserMessage(state, userMsg);
  persistState(state);

  // Play the script
  setSendingUI(true);
  startStreamingMessage('claude-sonnet-4-6');

  for (const step of DEMO_SCRIPT) {
    if (step.type === 'text') {
      for (let i = 0; i < step.text.length; i++) {
        appendStreamDelta(step.text[i]);
        await sleep(DEMO_CHAR_DELAY_MS);
      }
    } else if (step.type === 'tool') {
      await sleep(DEMO_TOOL_DELAY_MS);
      const resultText = executeTool(state, step.name, step.input);
      appendStreamToolCall({ name: step.name, input: step.input, ok: !resultText.startsWith('Error:') });
      // Re-render artifacts
      renderCompanyPanel(state, onArtifactChange);
      renderRecommendationsPanel(state, onArtifactChange);
      renderDashboardPanel(state);
      renderReportPanel(state);
      updateRecsBadge();
      updateEngagementPill();
      persistState(state);
    }
  }

  // Commit and persist
  commitStreamingMessage(null);
  // Store as a fake assistant message in state so it survives reload
  // Reconstruct content from the script
  const content = [];
  let textBuffer = '';
  for (const step of DEMO_SCRIPT) {
    if (step.type === 'text') {
      textBuffer += step.text;
    } else if (step.type === 'tool') {
      if (textBuffer) { content.push({ type: 'text', text: textBuffer }); textBuffer = ''; }
      content.push({ type: 'tool_use', id: 'demo_' + Math.random().toString(36).slice(2, 10), name: step.name, input: step.input });
    }
  }
  if (textBuffer) content.push({ type: 'text', text: textBuffer });
  state.chat.messages.push({
    id: 'm_' + Math.random().toString(36).slice(2, 10),
    role: 'assistant',
    timestamp: Date.now(),
    content,
    model: 'demo',
  });
  persistState(state);

  setSendingUI(false);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* =================================================================
   SAMPLE / EXPORT / IMPORT / RESET
   ================================================================= */
function loadSampleEngagement() {
  if (state.recommendations.length || state.chat.messages.length) {
    if (!confirm('Replace current engagement with sample data?')) return;
  }
  state.profile = {
    company: 'Atlas Foods, Inc.',
    sector: 'Consumer · Packaged Foods',
    geography: 'North America',
    revenue: 450000000, ebitda: 65000000, headcount: 1200,
    holdPeriod: 5, discountRate: 12,
    author: 'K. Curtin',
    businessModel: 'Mid-market frozen ready-meals manufacturer. Branded + private-label through major grocery and club retailers; growing DTC subscription. Three production facilities (Ohio, Texas, California).',
    dealThesis: 'Sponsor targets ~$95M pro-forma EBITDA by Year 5 via DTC expansion, co-manufacturing consolidation, and margin + multiple uplift from a credible sustainability narrative.',
  };
  state.recommendations = [];
  state.chat.messages = [];
  state.chat.documents = [];
  DEMO_SCRIPT.forEach(step => {
    if (step.type === 'tool' && step.name === 'add_recommendation') {
      const rec = recFromInput(step.input);
      rec.aiGenerated = false;
      state.recommendations.push(rec);
    }
  });
  renderAll();
  updateEngagementPill();
  persistState(state);
}

function exportJSON() {
  const blob = new Blob([JSON.stringify({
    _meta: { app: 'STRATA Workspace', version: 2, exportedAt: new Date().toISOString() },
    profile: state.profile,
    recommendations: state.recommendations,
    chat: state.chat,
    ui: state.ui,
  }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const slug = (state.profile.company || 'engagement').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  a.download = `strata-v2-${slug || 'engagement'}-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function importJSON(file) {
  const r = new FileReader();
  r.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      state.profile = { ...defaultState().profile, ...(data.profile || {}) };
      state.recommendations = (data.recommendations || []).map(rec => defaultRec(rec));
      state.chat = data.chat || { messages: [], documents: [] };
      state.ui = { ...defaultState().ui, ...(data.ui || {}) };
      window.__strataState = state;
      renderAll();
      updateEngagementPill();
      persistState(state);
    } catch (err) {
      alert('Could not import: ' + err.message);
    }
  };
  r.readAsText(file);
}

function resetEverything() {
  if (!confirm('Reset everything? This clears the engagement, chat history, and attached documents. (Your API key and settings are kept.)')) return;
  state = defaultState();
  window.__strataState = state;
  localStorage.removeItem('strata.v2.engagement');
  renderAll();
  updateEngagementPill();
}

/* =================================================================
   BOOTSTRAP
   ================================================================= */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
