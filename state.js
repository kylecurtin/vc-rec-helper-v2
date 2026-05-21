/* state.js — single source of truth + persistence */

export const STORAGE_KEY = 'strata.v2.engagement';
export const KEY_STORAGE = 'strata.v2.anthropic_key';
export const SETTINGS_KEY = 'strata.v2.settings';
export const USAGE_KEY = 'strata.v2.usage';

export function defaultProfile() {
  return {
    company: '', sector: '', geography: '',
    revenue: '', ebitda: '', headcount: '',
    holdPeriod: 5, discountRate: 12,
    author: '', businessModel: '', dealThesis: '',
  };
}

export function defaultRec(seed = {}) {
  return {
    id: seed.id || 'r_' + Math.random().toString(36).slice(2, 10),
    createdAt: seed.createdAt || Date.now(),
    aiGenerated: seed.aiGenerated ?? false,
    title: seed.title || 'New Recommendation',
    category: seed.category || 'energy',
    thesis: seed.thesis || '',
    assumptions: seed.assumptions || '',
    implementation: seed.implementation || '',
    value: {
      year1Ebitda: seed.value?.year1Ebitda ?? '',
      steadyStateEbitda: seed.value?.steadyStateEbitda ?? '',
      capex: seed.value?.capex ?? '',
      opex: seed.value?.opex ?? '',
      exitMultipleUplift: seed.value?.exitMultipleUplift ?? '',
    },
    feasibility: {
      strategicFit:         seed.feasibility?.strategicFit ?? 3,
      technicalFeasibility: seed.feasibility?.technicalFeasibility ?? 3,
      stakeholderAlignment: seed.feasibility?.stakeholderAlignment ?? 3,
      regulatoryTailwind:   seed.feasibility?.regulatoryTailwind ?? 3,
      timeToImplement:      seed.feasibility?.timeToImplement ?? '',
      confidence:           seed.feasibility?.confidence ?? 'medium',
      riskFactors:          seed.feasibility?.riskFactors ?? '',
      riskRating:           seed.feasibility?.riskRating ?? 'medium',
    },
    esg: {
      e: seed.esg?.e ?? 3,
      s: seed.esg?.s ?? 3,
      g: seed.esg?.g ?? 3,
    },
  };
}

export function defaultState() {
  return {
    profile: defaultProfile(),
    recommendations: [],
    chat: {
      messages: [],   // { id, role, content: [...blocks...], timestamp, usage? }
      documents: [],  // { id, filename, sizeBytes, base64, addedAt }
    },
    ui: {
      sortBy: 'npv',
      expanded: {},
      activeTab: 'company',
      mode: 'standard',
      companyEditing: false,
    },
  };
}

export function defaultSettings() {
  return {
    defaultMode: 'standard',
    bannerDismissed: false,
  };
}

export function defaultUsage() {
  return {
    session: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, cost: 0 },
    allTime: { cost: 0 },
  };
}

// Pricing per 1M tokens (USD)
export const PRICING = {
  'claude-sonnet-4-6': { input: 3.00, output: 15.00, cacheRead: 0.30, cacheWrite: 3.75 },
  'claude-opus-4-7':   { input: 5.00, output: 25.00, cacheRead: 0.50, cacheWrite: 6.25 },
};

export function calcCost(modelId, usage) {
  const p = PRICING[modelId];
  if (!p) return 0;
  return (
    ((usage.input_tokens || 0) * p.input +
     (usage.output_tokens || 0) * p.output +
     (usage.cache_read_input_tokens || 0) * p.cacheRead +
     (usage.cache_creation_input_tokens || 0) * p.cacheWrite) / 1_000_000
  );
}

// ---------- Persistence ----------
let saveTimer = null;

export function persistState(state) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      const toSave = {
        profile: state.profile,
        recommendations: state.recommendations,
        chat: state.chat,
        ui: state.ui,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch (e) {
      console.warn('[STRATA] persist failed:', e);
    }
  }, 350);
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const data = JSON.parse(raw);
    const s = defaultState();
    s.profile = { ...s.profile, ...(data.profile || {}) };
    s.recommendations = (data.recommendations || []).map(r => defaultRec(r));
    s.chat.messages = data.chat?.messages || [];
    s.chat.documents = data.chat?.documents || [];
    s.ui = { ...s.ui, ...(data.ui || {}) };
    return s;
  } catch (e) {
    console.warn('[STRATA] load failed:', e);
    return defaultState();
  }
}

export function loadKey() { return localStorage.getItem(KEY_STORAGE) || ''; }
export function saveKey(k) { localStorage.setItem(KEY_STORAGE, k || ''); }
export function clearKey() { localStorage.removeItem(KEY_STORAGE); }

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...defaultSettings(), ...JSON.parse(raw) } : defaultSettings();
  } catch { return defaultSettings(); }
}
export function saveSettings(s) { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); }

export function loadUsage() {
  try {
    const raw = localStorage.getItem(USAGE_KEY);
    if (!raw) return defaultUsage();
    const data = JSON.parse(raw);
    return { ...defaultUsage(), ...data, session: { ...defaultUsage().session, ...(data.session || {}) } };
  } catch { return defaultUsage(); }
}
export function saveUsage(u) { localStorage.setItem(USAGE_KEY, JSON.stringify(u)); }

export function resetUsageSession(usage) {
  usage.session = defaultUsage().session;
  saveUsage(usage);
}
