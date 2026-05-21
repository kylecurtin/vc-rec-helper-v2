/* artifacts.js — Company, Recommendations, Dashboard, Report rendering */

import { CATEGORIES, catById, RISK_FACTORS } from './tools.js';
import { defaultRec, persistState } from './state.js';

/* =================================================================
   Formatters & calculations (carried over from V1)
   ================================================================= */
const nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

export function fmtUSD(v, opts = {}) {
  const n = Number(v);
  if (!isFinite(n) || v === '' || v === null || v === undefined) return '—';
  const abs = Math.abs(n);
  let str;
  if (abs >= 1e9) str = (n / 1e9).toFixed(abs >= 10e9 ? 1 : 2) + 'B';
  else if (abs >= 1e6) str = (n / 1e6).toFixed(abs >= 10e6 ? 1 : 2) + 'M';
  else if (abs >= 1e3) str = (n / 1e3).toFixed(abs >= 10e3 ? 0 : 1) + 'K';
  else str = nf0.format(n);
  return (opts.signed && n > 0 ? '+' : '') + '$' + str;
}
export function fmtUSDFull(v) {
  const n = Number(v);
  if (!isFinite(n)) return '—';
  return '$' + nf0.format(n);
}
export function fmtYears(v) {
  if (v === null || v === undefined || !isFinite(v)) return '—';
  if (v <= 0) return 'Immediate';
  if (v > 50) return '>50 yrs';
  return nf1.format(v) + ' yr' + (v >= 2 ? 's' : '');
}
export function fmtNum(v, d = 1) {
  const n = Number(v);
  if (!isFinite(n)) return '—';
  return n.toFixed(d);
}
function fmtDate() {
  return new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export function calcPayback(rec) {
  const capex = +rec.value.capex || 0;
  const ss = +rec.value.steadyStateEbitda || 0;
  const opex = +rec.value.opex || 0;
  const net = ss - opex;
  if (capex <= 0) return 0;
  if (net <= 0) return Infinity;
  return capex / net;
}
export function calcNPV(rec, profile) {
  const N = Math.max(1, +profile.holdPeriod || 5);
  const r = (+profile.discountRate || 0) / 100;
  const capex = +rec.value.capex || 0;
  const y1 = +rec.value.year1Ebitda || 0;
  const ss = +rec.value.steadyStateEbitda || 0;
  const opex = +rec.value.opex || 0;
  const uplift = +rec.value.exitMultipleUplift || 0;
  let npv = -capex;
  for (let t = 1; t <= N; t++) {
    npv += ((t === 1 ? y1 : ss) - opex) / Math.pow(1 + r, t);
  }
  if (uplift !== 0 && ss !== 0) npv += (ss * uplift) / Math.pow(1 + r, N);
  return npv * (RISK_FACTORS[rec.feasibility.riskRating] ?? 0.85);
}
export function calcFeasibility(rec) {
  const f = rec.feasibility;
  const vals = [+f.strategicFit, +f.technicalFeasibility, +f.stakeholderAlignment, +f.regulatoryTailwind]
    .filter(v => isFinite(v) && v > 0);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
}
export function calcESG(rec) {
  const { e, s, g } = rec.esg;
  return ((+e || 0) + (+s || 0) + (+g || 0)) / 3;
}
function calcComposite(rec, profile, ctx) {
  const npv = calcNPV(rec, profile);
  const maxAbs = ctx?.maxAbsNpv || Math.max(1, Math.abs(npv));
  const npvScore = Math.max(0, Math.min(5, (npv / maxAbs) * 2.5 + 2.5));
  return 0.45 * npvScore + 0.35 * calcFeasibility(rec) + 0.20 * calcESG(rec);
}

/* ---------- DOM helpers ---------- */
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
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/* =================================================================
   COMPANY PANEL
   ================================================================= */
export function renderCompanyPanel(state, onChange) {
  const panel = $('#panel-company');
  panel.innerHTML = '';
  const p = state.profile;
  const editing = state.ui.companyEditing;
  const empty = !p.company && !p.sector && !p.businessModel;

  if (empty && !editing) {
    panel.append(el('div', { class: 'empty-pane' },
      el('div', { class: 'empty-pane-rule' }),
      el('h3', {}, 'No company profile yet'),
      el('p', {}, 'Describe a target in the chat panel, attach a CIM, or click below to enter it manually.'),
      el('div', { class: 'empty-pane-rule', style: 'margin: 24px auto;' }),
      el('button', {
        class: 'btn-primary',
        onclick: () => { state.ui.companyEditing = true; onChange(); },
      }, 'Enter Manually'),
    ));
    return;
  }

  panel.append(buildCompanyHead(state, onChange));

  if (editing) {
    panel.append(buildCompanyEditForm(state, onChange));
  } else {
    panel.append(buildCompanyReadView(p));
  }
}

function buildCompanyHead(state, onChange) {
  const p = state.profile;
  return el('div', { class: 'company-head' },
    el('span', { class: 'company-num' }, '§ 01'),
    el('div', {},
      el('h2', { class: 'company-name' }, p.company || 'Untitled engagement'),
      el('div', { class: 'company-sub' }, [p.sector, p.geography].filter(Boolean).join(' · ') || 'No sector/geography'),
    ),
    el('button', {
      class: 'company-edit-btn',
      onclick: () => { state.ui.companyEditing = !state.ui.companyEditing; onChange(); },
    }, state.ui.companyEditing ? 'Done' : 'Edit'),
  );
}

function buildCompanyReadView(p) {
  const wrap = el('div', {});
  const grid = el('div', { class: 'company-readonly' });
  const row = (label, val) => el('div', { class: 'readonly-row' },
    el('span', { class: 'readonly-label' }, label),
    el('span', { class: 'readonly-value' + (typeof val === 'string' && /^\$/.test(val) ? ' mono' : '') }, val || '—'),
  );
  grid.append(
    row('Revenue', p.revenue ? fmtUSDFull(p.revenue) : null),
    row('EBITDA', p.ebitda ? fmtUSDFull(p.ebitda) : null),
    row('Headcount', p.headcount ? nf0.format(p.headcount) : null),
    row('Hold Period', p.holdPeriod ? p.holdPeriod + ' years' : null),
    row('Discount Rate', p.discountRate ? p.discountRate + '%' : null),
    row('Author', p.author),
  );
  wrap.append(grid);

  if (p.businessModel || p.dealThesis) {
    const prose = el('div', { class: 'company-prose' });
    if (p.businessModel) {
      prose.append(
        el('h4', {}, 'Business Model'),
        el('p', {}, p.businessModel),
      );
    }
    if (p.dealThesis) {
      prose.append(
        el('h4', {}, 'Deal Thesis & Sustainability Lens'),
        el('p', {}, p.dealThesis),
      );
    }
    wrap.append(prose);
  }
  return wrap;
}

function buildCompanyEditForm(state, onChange) {
  const p = state.profile;
  const form = el('div', { class: 'company-grid' });

  const bind = (k, n) => () => {
    let v = n.value;
    if (n.type === 'number') v = v === '' ? '' : Number(v);
    p[k] = v;
    onChange();
  };

  const field = (key, label, opts = {}) => {
    const f = el('div', { class: 'form-field ' + (opts.span || '') });
    f.append(el('label', {}, label, opts.unit ? el('span', { class: 'unit' }, opts.unit) : null));
    const input = opts.textarea
      ? el('textarea', { rows: String(opts.rows || 3), placeholder: opts.placeholder || '' })
      : el('input', { type: opts.type || 'text', placeholder: opts.placeholder || '', step: opts.step });
    if (p[key] !== undefined && p[key] !== null && p[key] !== '') input.value = p[key];
    input.addEventListener('input', bind(key, input));
    f.append(input);
    return f;
  };

  form.append(
    field('company',      'Target Company',  { span: 'span-3', placeholder: 'e.g., Atlas Foods, Inc.' }),
    field('sector',       'Sector',          { span: 'span-2', placeholder: 'e.g., Consumer · Packaged Foods' }),
    field('geography',    'Geography',       { placeholder: 'e.g., N. America' }),
    field('revenue',      'Revenue',         { type: 'number', step: '1000000', unit: 'USD', placeholder: '450000000' }),
    field('ebitda',       'EBITDA',          { type: 'number', step: '100000', unit: 'USD', placeholder: '65000000' }),
    field('headcount',    'Headcount',       { type: 'number', placeholder: '1200' }),
    field('holdPeriod',   'Hold Period',     { type: 'number', step: '1', unit: 'yrs', placeholder: '5' }),
    field('discountRate', 'Discount Rate',   { type: 'number', step: '0.5', unit: '%', placeholder: '12' }),
    field('author',       'Author',          { placeholder: 'K. Curtin' }),
    field('businessModel','Business Model',  { span: 'span-full', textarea: true, rows: 3,
      placeholder: 'Revenue model · customer base · key cost drivers · operating footprint…' }),
    field('dealThesis',   'Deal Thesis & Sustainability Lens', { span: 'span-full', textarea: true, rows: 3,
      placeholder: 'Sponsor\'s investment thesis · identified value-creation themes · sustainability priorities…' }),
  );
  return form;
}

/* =================================================================
   RECOMMENDATIONS PANEL
   ================================================================= */
function sortedRecs(state) {
  const recs = [...state.recommendations];
  const ctx = { maxAbsNpv: Math.max(1, ...recs.map(r => Math.abs(calcNPV(r, state.profile)))) };
  const score = {
    npv:         r => calcNPV(r, state.profile),
    composite:   r => calcComposite(r, state.profile, ctx),
    feasibility: r => calcFeasibility(r),
    esg:         r => calcESG(r),
    created:     r => -r.createdAt,
  }[state.ui.sortBy] || (() => 0);
  if (state.ui.sortBy === 'created') {
    recs.sort((a, b) => a.createdAt - b.createdAt);
  } else {
    recs.sort((a, b) => score(b) - score(a));
  }
  return recs;
}

export function renderRecommendationsPanel(state, onChange) {
  const panel = $('#panel-recommendations');
  panel.innerHTML = '';

  // Toolbar
  const toolbar = el('div', { class: 'recs-toolbar' },
    el('div', { class: 'recs-count' },
      el('span', { class: 'count-num' }, String(state.recommendations.length)),
      el('span', { class: 'count-label' }, 'in portfolio'),
    ),
    el('div', { class: 'recs-sort' },
      el('label', { for: 'sort-by' }, 'Sort'),
    ),
    el('button', {
      class: 'btn-primary',
      onclick: () => {
        const r = defaultRec({ title: 'New Recommendation', aiGenerated: false });
        state.recommendations.push(r);
        state.ui.expanded[r.id] = true;
        onChange();
      },
    }, '+ Add Recommendation'),
  );
  const sortSelect = el('select', { id: 'sort-by',
    onchange: (e) => { state.ui.sortBy = e.target.value; onChange(); },
  });
  ['npv', 'composite', 'feasibility', 'esg', 'created'].forEach(v => {
    const labels = { npv: 'Risk-Adj. NPV', composite: 'Composite Score', feasibility: 'Feasibility', esg: 'ESG Composite', created: 'Order Added' };
    const opt = el('option', { value: v }, labels[v]);
    if (v === state.ui.sortBy) opt.selected = true;
    sortSelect.append(opt);
  });
  toolbar.querySelector('.recs-sort').append(sortSelect);
  panel.append(toolbar);

  if (state.recommendations.length === 0) {
    panel.append(el('div', { class: 'empty-pane' },
      el('div', { class: 'empty-pane-rule' }),
      el('h3', {}, 'No recommendations yet'),
      el('p', {}, 'Ask the chat panel to generate recommendations from the company context, or add one manually with the button above.'),
      el('div', { class: 'empty-pane-rule', style: 'margin: 24px auto;' }),
    ));
    return;
  }

  const list = el('div', { class: 'recs-list' });
  sortedRecs(state).forEach((rec, i) => list.append(buildRecCard(state, rec, i + 1, onChange)));
  panel.append(list);
}

function buildRecCard(state, rec, displayIdx, onChange) {
  const cat = catById(rec.category);
  const expanded = !!state.ui.expanded[rec.id];
  const card = el('article', {
    class: 'rec-card' + (expanded ? ' expanded' : ''),
    'data-id': rec.id,
    style: `--cat-color:${cat.color}`,
  });

  // Head
  const head = el('div', { class: 'rec-head', onclick: (ev) => {
    if (ev.target.closest('button, input, select, .summary-stat')) return;
    state.ui.expanded[rec.id] = !state.ui.expanded[rec.id];
    onChange();
  }});

  head.append(
    el('div', { class: 'rec-num' }, String(displayIdx).padStart(2, '0')),
    buildTitleBlock(rec, expanded, cat, onChange),
    buildSummaryStats(state, rec),
  );
  head.append(el('div', { class: 'rec-head-actions' },
    el('button', { class: 'btn-tiny', onclick: () => {
      state.ui.expanded[rec.id] = !state.ui.expanded[rec.id];
      onChange();
    }}, expanded ? 'Collapse' : 'Edit'),
    el('button', { class: 'btn-tiny danger', onclick: () => {
      if (confirm('Delete this recommendation?')) {
        state.recommendations = state.recommendations.filter(r => r.id !== rec.id);
        onChange();
      }
    }}, 'Delete'),
  ));
  card.append(head);

  if (expanded) card.append(buildRecBody(state, rec, onChange));
  return card;
}

function buildTitleBlock(rec, expanded, cat, onChange) {
  const wrap = el('div', { class: 'rec-title-wrap' });
  if (expanded) {
    const input = el('input', {
      class: 'rec-title-input', type: 'text', value: rec.title,
      placeholder: 'Recommendation title',
      oninput: (e) => { rec.title = e.target.value; persistState(window.__strataState); },
    });
    wrap.append(input);
  } else {
    wrap.append(el('h3', { class: 'rec-title' }, rec.title || 'Untitled'));
  }
  wrap.append(el('div', { class: 'rec-meta-line' },
    el('span', { class: 'cat-marker' }),
    cat.label,
    el('span', { class: 'dot-sep' }, '·'),
    `Time to value · ${rec.feasibility.timeToImplement ? rec.feasibility.timeToImplement + ' mo' : '—'}`,
    el('span', { class: 'dot-sep' }, '·'),
    el('span', { class: 'pill ' + rec.feasibility.riskRating }, rec.feasibility.riskRating + ' risk'),
    rec.aiGenerated ? el('span', { class: 'ai-tag' }, 'AI') : null,
  ));
  return wrap;
}

function buildSummaryStats(state, rec) {
  const npv = calcNPV(rec, state.profile);
  const pay = calcPayback(rec);
  const feas = calcFeasibility(rec);
  const esg = calcESG(rec);
  return el('div', { class: 'rec-summary' },
    el('div', { class: 'summary-stat' },
      el('span', { class: 'stat-label' }, 'NPV'),
      el('span', { class: 'stat-value serif ' + (npv >= 0 ? 'npv-pos' : 'npv-neg') }, fmtUSD(npv, { signed: true })),
    ),
    el('div', { class: 'summary-stat' },
      el('span', { class: 'stat-label' }, 'Payback'),
      el('span', { class: 'stat-value' }, fmtYears(pay)),
    ),
    el('div', { class: 'summary-stat' },
      el('span', { class: 'stat-label' }, 'Feas'),
      el('span', { class: 'stat-value' }, fmtNum(feas, 1) + '/5'),
    ),
    el('div', { class: 'summary-stat' },
      el('span', { class: 'stat-label' }, 'ESG'),
      el('span', { class: 'stat-value' }, fmtNum(esg, 1) + '/5'),
    ),
  );
}

function buildRecBody(state, rec, onChange) {
  const body = el('div', { class: 'rec-body' });
  const grid = el('div', { class: 'rec-body-grid' });
  const left = el('div'), right = el('div');

  // LEFT: prose
  left.append(buildBlock('Category', buildCategorySelect(rec, onChange)));
  left.append(buildBlock('Thesis · What & Why',
    buildTextarea(rec, 'thesis', 'Describe the recommendation and the value-creation logic…', 4, onChange)));
  left.append(buildBlock('Key Assumptions',
    buildTextarea(rec, 'assumptions', 'Material assumptions behind the value estimates…', 3, onChange)));
  left.append(buildBlock('Implementation Requirements',
    buildTextarea(rec, 'implementation', 'Capex line items, partners, sequencing…', 3, onChange)));
  left.append(buildBlock('Risk Factors',
    buildRiskTextarea(rec, 'Material risks to thesis or execution…', 2, onChange)));

  // RIGHT: numbers + scoring
  const valuePairs = el('div', { class: 'block-pair-grid' });
  valuePairs.append(
    numField(rec, 'value.year1Ebitda',       'Year-1 EBITDA Impact', '$', onChange),
    numField(rec, 'value.steadyStateEbitda', 'Steady-State Annual',  '$', onChange),
    numField(rec, 'value.capex',             'One-Time Capex',       '$', onChange),
    numField(rec, 'value.opex',              'Ongoing Opex Δ',       '$', onChange),
    numField(rec, 'value.exitMultipleUplift','Exit Mult. Uplift',    'turns', onChange),
  );
  const valBlock = buildBlock('Value Lens · USD inputs', valuePairs);
  valBlock.append(buildValueReadouts(state, rec));
  right.append(valBlock);

  const feasInner = el('div');
  feasInner.append(
    buildScoreRow(rec, 'feasibility.strategicFit',         'Strategic Fit',         '1 = off-thesis · 5 = central', onChange),
    buildScoreRow(rec, 'feasibility.technicalFeasibility', 'Technical Feasibility', '1 = unproven · 5 = mature', onChange),
    buildScoreRow(rec, 'feasibility.stakeholderAlignment', 'Stakeholder Alignment', '1 = contested · 5 = aligned', onChange),
    buildScoreRow(rec, 'feasibility.regulatoryTailwind',   'Regulatory Tailwind',   '1 = headwind · 5 = tailwind', onChange),
  );
  const feasMeta = el('div', { class: 'block-pair-grid', style: 'margin-top: 18px;' });
  feasMeta.append(
    numField(rec, 'feasibility.timeToImplement', 'Time to Implement', 'months', onChange),
    buildPillToggle(rec, 'feasibility.confidence', 'Confidence', ['low', 'medium', 'high'], onChange),
  );
  feasInner.append(feasMeta);
  feasInner.append(el('div', { style: 'margin-top: 14px;' },
    buildPillToggle(rec, 'feasibility.riskRating', 'Overall Risk Rating', ['low', 'medium', 'high'], onChange),
  ));
  right.append(buildBlock('Feasibility Lens · 1 (low) – 5 (high)', feasInner));

  right.append(buildBlock('ESG Lens', buildEsgRow(rec, onChange)));

  grid.append(left, right);
  body.append(grid);
  return body;
}

function buildBlock(title, ...children) {
  const w = el('div', { class: 'body-block' });
  w.append(el('div', { class: 'block-title' }, title));
  children.forEach(c => w.append(c));
  return w;
}

function buildCategorySelect(rec, onChange) {
  const wrap = el('div', { class: 'cat-select-wrap', style: `--cat-color:${catById(rec.category).color}` });
  const sel = el('select', { class: 'cat-select', onchange: (e) => {
    rec.category = e.target.value;
    onChange();
  }});
  CATEGORIES.forEach(c => {
    const opt = el('option', { value: c.id }, c.label);
    if (c.id === rec.category) opt.selected = true;
    sel.append(opt);
  });
  wrap.append(sel);
  return wrap;
}

function buildTextarea(rec, key, placeholder, rows, onChange) {
  const ta = el('textarea', { rows: String(rows), placeholder,
    oninput: (e) => { rec[key] = e.target.value; persistState(window.__strataState); },
  });
  ta.value = rec[key] || '';
  return ta;
}
function buildRiskTextarea(rec, placeholder, rows, onChange) {
  const ta = el('textarea', { rows: String(rows), placeholder,
    oninput: (e) => { rec.feasibility.riskFactors = e.target.value; persistState(window.__strataState); },
  });
  ta.value = rec.feasibility.riskFactors || '';
  return ta;
}

function getPath(o, p) { return p.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o); }
function setPath(o, p, v) { const parts = p.split('.'); let x = o; for (let i = 0; i < parts.length - 1; i++) x = x[parts[i]]; x[parts.at(-1)] = v; }

function numField(rec, path, label, unit, onChange) {
  const f = el('div', { class: 'form-field' });
  f.append(el('label', {}, label, unit ? el('span', { class: 'unit' }, unit) : null));
  const input = el('input', { type: 'number', step: 'any', placeholder: unit === '$' ? '0' : (unit === 'turns' ? '0.0' : '0'),
    oninput: (e) => {
      const v = e.target.value === '' ? '' : Number(e.target.value);
      setPath(rec, path, v);
      onChange();
    },
  });
  const curr = getPath(rec, path);
  if (curr !== '' && curr !== null && curr !== undefined) input.value = curr;
  f.append(input);
  return f;
}

function buildScoreRow(rec, path, label, hint, onChange) {
  const wrap = el('div', { class: 'score-row' });
  wrap.append(el('div', { class: 'score-label' },
    el('span', {}, label),
    hint ? el('span', { class: 'score-hint' }, hint) : null,
  ));
  const current = +getPath(rec, path) || 0;
  const dots = el('div', { class: 'score-dots' });
  for (let i = 1; i <= 5; i++) {
    const dot = el('button', {
      class: 'score-dot' + (i <= current ? ' filled' : ''),
      'aria-label': `${i}`,
      onclick: () => {
        const cur = +getPath(rec, path) || 0;
        const nv = (cur === i) ? i - 1 : i;
        setPath(rec, path, nv);
        $$('.score-dot', dots).forEach((d, idx) => d.classList.toggle('filled', (idx + 1) <= nv));
        onChange();
      },
    });
    dots.append(dot);
  }
  wrap.append(dots);
  return wrap;
}

function buildPillToggle(rec, path, label, options, onChange) {
  const wrap = el('div', { class: 'form-field' });
  wrap.append(el('label', {}, label));
  const group = el('div', { class: 'pill-group' });
  const current = getPath(rec, path);
  options.forEach(opt => {
    const btn = el('button', {
      class: 'pill-toggle' + (current === opt ? ' active ' + opt : ''),
      onclick: () => {
        setPath(rec, path, opt);
        $$('.pill-toggle', group).forEach(b => b.className = 'pill-toggle');
        btn.className = 'pill-toggle active ' + opt;
        onChange();
      },
    }, opt);
    group.append(btn);
  });
  wrap.append(group);
  return wrap;
}

function buildEsgRow(rec, onChange) {
  const wrap = el('div', { class: 'esg-row' });
  [['e', 'E', 'Environmental'], ['s', 'S', 'Social'], ['g', 'G', 'Governance']].forEach(([k, letter, word]) => {
    const cell = el('div', { class: 'esg-cell' });
    cell.append(el('div', { class: 'esg-letter' }, letter, el('span', { class: 'esg-word' }, word)));
    const dots = el('div', { class: 'score-dots' });
    const current = +rec.esg[k] || 0;
    for (let i = 1; i <= 5; i++) {
      const dot = el('button', {
        class: 'score-dot' + (i <= current ? ' filled' : ''),
        onclick: () => {
          const cur = +rec.esg[k] || 0;
          const nv = (cur === i) ? i - 1 : i;
          rec.esg[k] = nv;
          $$('.score-dot', dots).forEach((d, idx) => d.classList.toggle('filled', (idx + 1) <= nv));
          onChange();
        },
      });
      dots.append(dot);
    }
    cell.append(dots);
    wrap.append(cell);
  });
  return wrap;
}

function buildValueReadouts(state, rec) {
  const npv = calcNPV(rec, state.profile);
  const pay = calcPayback(rec);
  return el('div', { class: 'value-readouts' },
    el('div', { class: 'readout' },
      el('span', { class: 'readout-label' }, 'Risk-Adj. NPV'),
      el('span', { class: 'readout-value ' + (npv >= 0 ? 'pos' : 'neg') }, fmtUSDFull(npv)),
    ),
    el('div', { class: 'readout' },
      el('span', { class: 'readout-label' }, 'Payback'),
      el('span', { class: 'readout-value' }, fmtYears(pay)),
    ),
    el('div', { class: 'readout' },
      el('span', { class: 'readout-label' }, 'Hold · Disc.'),
      el('span', { class: 'readout-value' }, `${state.profile.holdPeriod || 5}y · ${state.profile.discountRate || 0}%`),
    ),
  );
}

/* =================================================================
   DASHBOARD PANEL
   ================================================================= */
export function renderDashboardPanel(state) {
  const panel = $('#panel-dashboard');
  panel.innerHTML = '';

  // Totals
  let totalNpv = 0, totalCapex = 0, totalEsg = 0, esgCount = 0;
  let wpNum = 0, wpDen = 0;
  state.recommendations.forEach(r => {
    totalNpv += calcNPV(r, state.profile);
    totalCapex += +r.value.capex || 0;
    const e = calcESG(r); if (e > 0) { totalEsg += e; esgCount += 1; }
    const cap = +r.value.capex || 0;
    const pay = calcPayback(r);
    if (cap > 0 && isFinite(pay)) { wpNum += pay * cap; wpDen += cap; }
  });

  const totals = el('div', { class: 'dash-totals' });
  totals.append(
    totalCard('Risk-Adj. NPV', state.recommendations.length ? fmtUSD(totalNpv, { signed: true }) : '—',
              'Aggregate across recommendations', totalNpv >= 0 ? 'pos' : 'neg'),
    totalCard('Capex Required', state.recommendations.length ? fmtUSD(totalCapex) : '—',
              'One-time investment'),
    totalCard('Blended Payback', wpDen > 0 ? fmtYears(wpNum / wpDen) : '—', 'Weighted by capex'),
    totalCard('Avg. ESG Score', esgCount > 0 ? fmtNum(totalEsg / esgCount, 1) + ' / 5' : '—',
              'E · S · G composite'),
  );
  panel.append(totals);

  if (state.recommendations.length === 0) {
    panel.append(el('div', { class: 'empty-pane' },
      el('div', { class: 'empty-pane-rule' }),
      el('h3', {}, 'No data to chart'),
      el('p', {}, 'Add recommendations to see ranked totals and the feasibility–value matrix.'),
      el('div', { class: 'empty-pane-rule', style: 'margin: 24px auto;' }),
    ));
    return;
  }

  const grid = el('div', { class: 'dash-grid' });

  // Table
  const tableWrap = el('div', {});
  tableWrap.append(el('h3', { class: 'dash-h3' }, 'Ranked Recommendations'));
  const table = el('table', { class: 'dash-table' });
  table.append(el('thead', {}, el('tr', {},
    el('th', { class: 'num' }, '#'),
    el('th', {}, 'Recommendation'),
    el('th', {}, 'Category'),
    el('th', { class: 'num' }, 'NPV'),
    el('th', { class: 'num' }, 'Capex'),
    el('th', { class: 'num' }, 'Payback'),
    el('th', { class: 'num' }, 'Feas.'),
    el('th', { class: 'num' }, 'ESG'),
    el('th', {}, 'Risk'),
  )));
  const tbody = el('tbody');
  sortedRecs(state).forEach((r, i) => {
    const cat = catById(r.category);
    const npv = calcNPV(r, state.profile);
    tbody.append(el('tr', {},
      el('td', { class: 'rank' }, String(i + 1).padStart(2, '0')),
      el('td', { class: 'rec-name' },
        el('span', { class: 'cat-marker', style: `background:${cat.color}` }),
        r.title || 'Untitled'),
      el('td', {}, cat.label),
      el('td', { class: 'num ' + (npv >= 0 ? 'npv-pos' : 'npv-neg') }, fmtUSD(npv, { signed: true })),
      el('td', { class: 'num' }, fmtUSD(+r.value.capex || 0)),
      el('td', { class: 'num' }, fmtYears(calcPayback(r))),
      el('td', { class: 'num' }, fmtNum(calcFeasibility(r), 1)),
      el('td', { class: 'num' }, fmtNum(calcESG(r), 1)),
      el('td', {}, el('span', { class: 'pill ' + r.feasibility.riskRating }, r.feasibility.riskRating)),
    ));
  });
  table.append(tbody);
  tableWrap.append(table);
  grid.append(tableWrap);

  // Bubble chart
  const chartWrap = el('div', {});
  chartWrap.append(el('h3', { class: 'dash-h3' }, 'Feasibility · Value Matrix'));
  chartWrap.append(buildBubbleChart(state));
  chartWrap.append(el('div', { class: 'chart-foot' }, 'Bubble area ∝ capex · Color = category'));
  chartWrap.append(buildChartLegend(state));
  grid.append(chartWrap);

  panel.append(grid);
}

function totalCard(label, value, foot, cls = '') {
  return el('div', { class: 'total-card' },
    el('span', { class: 'total-label' }, label),
    el('span', { class: 'total-value ' + cls }, value),
    el('span', { class: 'total-foot' }, foot),
  );
}

function buildBubbleChart(state) {
  const container = el('div', { class: 'bubble-chart' });
  const recs = state.recommendations;
  if (!recs.length) return container;

  const W = 500, H = 500;
  const pad = { l: 56, r: 28, t: 28, b: 56 };
  const innerW = W - pad.l - pad.r, innerH = H - pad.t - pad.b;
  const npvs = recs.map(r => calcNPV(r, state.profile));
  const maxNpv = Math.max(0, ...npvs);
  const minNpv = Math.min(0, ...npvs);
  const range = (maxNpv - minNpv) || 1;
  const capexes = recs.map(r => +r.value.capex || 0);
  const maxCapex = Math.max(1, ...capexes);

  const xOf = f => pad.l + ((f - 0.5) / 4.5) * innerW;
  const yOf = n => pad.t + (1 - (n - minNpv) / range) * innerH;
  const rOf = c => 6 + Math.sqrt(c / maxCapex) * 28;
  const xMid = pad.l + innerW * (3 - 0.5) / 4.5;
  const yMid = pad.t + (1 - (0 - minNpv) / range) * innerH;

  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

  const addNS = (tag, attrs = {}) => {
    const e = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
  };

  svg.append(addNS('rect', { x: xMid, y: pad.t, width: pad.l + innerW - xMid, height: yMid - pad.t, fill: 'rgba(31,58,46,0.05)' }));
  svg.append(addNS('rect', { x: pad.l, y: pad.t, width: xMid - pad.l, height: yMid - pad.t, fill: 'rgba(181,138,62,0.04)' }));

  svg.append(addNS('line', { x1: pad.l, y1: pad.t + innerH, x2: pad.l + innerW, y2: pad.t + innerH, class: 'axis-line' }));
  svg.append(addNS('line', { x1: pad.l, y1: pad.t, x2: pad.l, y2: pad.t + innerH, class: 'axis-line' }));
  svg.append(addNS('line', { x1: xMid, y1: pad.t, x2: xMid, y2: pad.t + innerH, class: 'quad-divider' }));
  svg.append(addNS('line', { x1: pad.l, y1: yMid, x2: pad.l + innerW, y2: yMid, class: 'quad-divider' }));

  const qLabel = (x, y, anchor, baseline, text) => {
    const t = addNS('text', { x, y, 'text-anchor': anchor, 'dominant-baseline': baseline, class: 'quad-label' });
    t.textContent = text;
    svg.append(t);
  };
  qLabel(pad.l + innerW - 6, pad.t + 10, 'end', 'hanging', 'Quick Wins');
  qLabel(pad.l + 6,          pad.t + 10, 'start', 'hanging', 'Strategic Bets');
  qLabel(pad.l + innerW - 6, pad.t + innerH - 6, 'end',   'baseline', 'Easy Adds');
  qLabel(pad.l + 6,          pad.t + innerH - 6, 'start', 'baseline', 'Deprioritize');

  const ax = addNS('text', { x: pad.l + innerW / 2, y: H - 16, 'text-anchor': 'middle', class: 'axis-label' });
  ax.textContent = 'FEASIBILITY  →';
  svg.append(ax);
  const ay = addNS('text', { x: 16, y: pad.t + innerH / 2, 'text-anchor': 'middle',
    transform: `rotate(-90 16 ${pad.t + innerH / 2})`, class: 'axis-label' });
  ay.textContent = 'RISK-ADJ. NPV  →';
  svg.append(ay);

  recs.forEach(r => {
    const cat = catById(r.category);
    const feas = calcFeasibility(r) || 1;
    const npv = calcNPV(r, state.profile);
    const cap = +r.value.capex || 0;
    const cx = xOf(feas), cy = yOf(npv), rr = rOf(cap);
    const c = addNS('circle', {
      cx, cy, r: rr,
      fill: cat.color, 'fill-opacity': '0.32', stroke: cat.color, 'stroke-width': '1.4',
      class: 'bubble',
    });
    c.dataset.title = r.title || 'Untitled';
    c.dataset.npv = fmtUSDFull(npv);
    c.dataset.cap = fmtUSDFull(cap);
    c.dataset.feas = fmtNum(feas, 1);
    c.addEventListener('mouseenter', showTooltip);
    c.addEventListener('mousemove', moveTooltip);
    c.addEventListener('mouseleave', hideTooltip);
    svg.append(c);
  });

  container.append(svg);
  return container;
}

function buildChartLegend(state) {
  const wrap = el('div', { class: 'chart-legend' });
  const present = [...new Set(state.recommendations.map(r => r.category))];
  present.forEach(cid => {
    const cat = catById(cid);
    wrap.append(el('span', { class: 'legend-item' },
      el('span', { class: 'legend-swatch', style: `background:${cat.color}` }),
      cat.label,
    ));
  });
  return wrap;
}

let tooltipEl = null;
function ensureTip() {
  if (tooltipEl) return tooltipEl;
  tooltipEl = el('div', { class: 'bubble-tooltip' });
  document.body.append(tooltipEl);
  return tooltipEl;
}
function showTooltip(e) {
  const t = ensureTip();
  const d = e.target.dataset;
  t.innerHTML = `<div class="tt-title">${escapeHTML(d.title)}</div>
    <div class="tt-data">NPV ${escapeHTML(d.npv)} · CAPEX ${escapeHTML(d.cap)} · FEAS ${escapeHTML(d.feas)}</div>`;
  t.classList.add('show');
  moveTooltip(e);
}
function moveTooltip(e) {
  if (!tooltipEl) return;
  tooltipEl.style.left = (e.pageX + 14) + 'px';
  tooltipEl.style.top = (e.pageY - 10) + 'px';
}
function hideTooltip() { if (tooltipEl) tooltipEl.classList.remove('show'); }

/* =================================================================
   REPORT PANEL + OVERLAY
   ================================================================= */
export function renderReportPanel(state) {
  const panel = $('#panel-report');
  panel.innerHTML = '';
  panel.append(el('div', { class: 'report-launcher' },
    el('div', { class: 'report-launcher-rule' }),
    el('h3', {}, 'Generate IC-Ready Report'),
    el('p', {}, 'Open a paginated, print-optimized view of the engagement — cover, executive summary, company snapshot, ranked recommendations, per-recommendation detail pages, and methodology. Use the browser\'s Print → Save as PDF to export.'),
    el('div', { class: 'report-launcher-rule' }),
    el('button', { class: 'btn-primary', onclick: () => openReport(state) }, 'Generate Report →'),
  ));
}

export function openReport(state) {
  buildReport(state);
  $('#report-overlay').hidden = false;
  document.body.style.overflow = 'hidden';
}
export function closeReport() {
  $('#report-overlay').hidden = true;
  document.body.style.overflow = '';
}

function buildReport(state) {
  const cont = $('#report-content');
  cont.innerHTML = '';
  cont.append(reportCover(state));
  cont.append(reportExec(state));
  cont.append(reportSnapshot(state));
  cont.append(reportRanked(state));
  const ordered = sortedRecs(state);
  for (let i = 0; i < ordered.length; i += 2) {
    cont.append(reportDetailPage(state, ordered.slice(i, i + 2), Math.floor(i / 2) + 1, ordered.length));
  }
  cont.append(reportMethodology(state));
}

function rphead(num, title, rail) {
  return el('div', { class: 'report-page-head' },
    el('span', { class: 'report-page-num' }, '§ ' + num),
    el('h2', { class: 'report-page-title' }, title),
    el('span', { class: 'report-page-rail' }, rail),
  );
}
function rpfoot(label) {
  return el('div', { class: 'report-foot' },
    el('span', {}, 'STRATA · Value Creation Analysis'),
    el('span', {}, label),
  );
}

function reportCover(state) {
  const p = state.profile;
  return el('div', { class: 'report-page cover-page' },
    el('div', { class: 'report-cover-top' },
      el('span', { class: 'report-cover-mark' }, 'STRATA'),
      el('span', { class: 'report-cover-eyebrow' }, 'Sustainability Value Creation Studio'),
    ),
    el('div', { class: 'report-cover-mid' },
      el('div', { class: 'report-cover-kicker' }, 'Value Creation Analysis · Sustainability Practice'),
      el('h1', { class: 'report-cover-title' }, p.company || 'Untitled Engagement'),
      el('div', { class: 'report-cover-sub' }, [p.sector, p.geography].filter(Boolean).join(' · ') || '—'),
      el('div', { class: 'report-cover-divider' }),
      el('div', { class: 'report-cover-stats' },
        coverStat('Revenue', p.revenue ? fmtUSD(p.revenue) : '—'),
        coverStat('EBITDA', p.ebitda ? fmtUSD(p.ebitda) : '—'),
        coverStat('Headcount', p.headcount ? nf0.format(p.headcount) : '—'),
        coverStat('Hold · Disc.', `${p.holdPeriod || '—'}y · ${p.discountRate || '—'}%`),
      ),
    ),
    el('div', { class: 'report-cover-bottom' },
      el('span', {}, 'Prepared by ' + (p.author || '—')),
      el('span', {}, fmtDate()),
    ),
  );
}
function coverStat(label, value) {
  return el('div', {},
    el('div', { class: 'cover-stat-label' }, label),
    el('div', { class: 'cover-stat-value' }, value),
  );
}

function reportExec(state) {
  const ordered = sortedRecs(state);
  let totalNpv = 0, totalCapex = 0;
  ordered.forEach(r => { totalNpv += calcNPV(r, state.profile); totalCapex += +r.value.capex || 0; });
  const lead = ordered.length
    ? `Across ${ordered.length} recommendations, this analysis identifies an aggregate ${fmtUSD(totalNpv, {signed:true})} in risk-adjusted NPV against ${fmtUSD(totalCapex)} of capital investment over a ${state.profile.holdPeriod || 5}-year hold.`
    : 'No recommendations have been entered. This document is a template for the analysis to come.';
  return el('div', { class: 'report-page' },
    rphead('I', 'Executive Summary', 'Investment Committee Read-Out'),
    el('p', { class: 'lead' }, lead),
    el('p', {}, state.profile.dealThesis || 'Deal thesis and sustainability lens — to be summarized here.'),
    el('p', {}, 'The recommendations in this dossier span the operational, commercial, human-capital, and capital-structure dimensions of value creation. Each is scored on a multi-lens framework: dollar EBITDA impact, capital intensity, payback, risk-adjusted NPV, feasibility, and ESG materiality.'),
    rpfoot('Page I'),
  );
}

function reportSnapshot(state) {
  const p = state.profile;
  const row = (l, v) => el('div', { class: 'snapshot-row' },
    el('span', { class: 'snapshot-label' }, l),
    el('span', { class: 'snapshot-value' }, v || '—'),
  );
  return el('div', { class: 'report-page' },
    rphead('II', 'Company Snapshot', 'CIM Excerpt'),
    el('div', { class: 'report-snapshot-grid' },
      row('Target', p.company),
      row('Sector', p.sector),
      row('Geography', p.geography),
      row('Headcount', p.headcount ? nf0.format(p.headcount) : null),
      row('Revenue', p.revenue ? fmtUSDFull(p.revenue) : null),
      row('EBITDA', p.ebitda ? fmtUSDFull(p.ebitda) : null),
      row('Hold Period', p.holdPeriod ? p.holdPeriod + ' years' : null),
      row('Discount Rate', p.discountRate ? p.discountRate + '%' : null),
    ),
    el('div', {}, el('h4', { style: 'font-family:var(--sans);font-size:10px;letter-spacing:0.22em;text-transform:uppercase;color:var(--forest);font-weight:600;margin:8px 0 8px;' }, 'Business Model'),
      el('p', {}, p.businessModel || '—')),
    el('div', { style: 'margin-top: 18px;' }, el('h4', { style: 'font-family:var(--sans);font-size:10px;letter-spacing:0.22em;text-transform:uppercase;color:var(--forest);font-weight:600;margin:8px 0 8px;' }, 'Deal Thesis & Sustainability Lens'),
      el('p', {}, p.dealThesis || '—')),
    rpfoot('Page II'),
  );
}

function reportRanked(state) {
  const ordered = sortedRecs(state);
  let totalNpv = 0, totalCapex = 0;
  const table = el('table', { class: 'report-summary-table' });
  table.append(el('thead', {}, el('tr', {},
    el('th', {}, '#'), el('th', {}, 'Recommendation'), el('th', {}, 'Category'),
    el('th', { class: 'num' }, 'NPV'), el('th', { class: 'num' }, 'Capex'), el('th', { class: 'num' }, 'Payback'),
    el('th', { class: 'num' }, 'Feas.'), el('th', { class: 'num' }, 'ESG'), el('th', {}, 'Risk'),
  )));
  const tbody = el('tbody');
  ordered.forEach((r, i) => {
    const cat = catById(r.category);
    const npv = calcNPV(r, state.profile);
    totalNpv += npv;
    totalCapex += +r.value.capex || 0;
    tbody.append(el('tr', {},
      el('td', {}, String(i + 1).padStart(2, '0')),
      el('td', { class: 'rec-name' }, r.title || '—'),
      el('td', {}, cat.label),
      el('td', { class: 'num' }, fmtUSD(npv, { signed: true })),
      el('td', { class: 'num' }, fmtUSD(+r.value.capex || 0)),
      el('td', { class: 'num' }, fmtYears(calcPayback(r))),
      el('td', { class: 'num' }, fmtNum(calcFeasibility(r), 1)),
      el('td', { class: 'num' }, fmtNum(calcESG(r), 1)),
      el('td', {}, r.feasibility.riskRating),
    ));
  });
  if (ordered.length) {
    tbody.append(el('tr', { style: 'border-top:1px solid var(--ink);' },
      el('td', { colspan: '3', style: 'font-weight:500;text-transform:uppercase;letter-spacing:0.16em;font-size:10px;color:var(--ink-3);' }, 'Portfolio Total'),
      el('td', { class: 'num', style: 'font-weight:600;' }, fmtUSD(totalNpv, { signed: true })),
      el('td', { class: 'num', style: 'font-weight:600;' }, fmtUSD(totalCapex)),
      el('td', { colspan: '4' }, ''),
    ));
  }
  table.append(tbody);
  return el('div', { class: 'report-page' },
    rphead('III', 'Recommendations · Ranked Summary', 'Sorted by ' + sortLabel(state)),
    el('p', {}, 'The table below ranks each recommendation against the configured sort lens. Detail pages follow.'),
    table,
    rpfoot('Page III'),
  );
}
function sortLabel(state) {
  return ({ npv: 'risk-adjusted NPV', composite: 'composite score', feasibility: 'feasibility', esg: 'ESG composite', created: 'order added' })[state.ui.sortBy] || 'risk-adjusted NPV';
}

function reportDetailPage(state, recs, pn, total) {
  const page = el('div', { class: 'report-page' });
  page.append(rphead('IV.' + pn, 'Recommendation Detail', `${recs.length} of ${total}`));
  recs.forEach((r, i) => page.append(reportRecBlock(state, r, (pn - 1) * 2 + i + 1)));
  page.append(rpfoot('Page IV.' + pn));
  return page;
}

function reportRecBlock(state, r, idx) {
  const cat = catById(r.category);
  const npv = calcNPV(r, state.profile);
  const pay = calcPayback(r);
  const block = el('div', { class: 'rec-detail-block' });
  block.append(el('div', { class: 'rec-detail-head' },
    el('span', { class: 'rec-detail-num' }, String(idx).padStart(2, '0')),
    el('div', {},
      el('h3', { class: 'rec-detail-title' }, r.title || 'Untitled'),
      el('div', { class: 'rec-detail-meta' },
        el('span', { class: 'cat-marker', style: `background:${cat.color}` }),
        cat.label,
        el('span', { class: 'dot-sep' }, '·'),
        r.feasibility.timeToImplement ? `${r.feasibility.timeToImplement} mo to value` : 'Time-to-value —',
      ),
    ),
    el('span', { class: 'pill ' + r.feasibility.riskRating }, r.feasibility.riskRating + ' risk'),
  ));
  block.append(el('div', { class: 'rec-detail-body' },
    el('div', { class: 'rec-detail-prose' },
      el('h5', {}, 'Thesis'),       el('p', {}, r.thesis || '—'),
      el('h5', {}, 'Assumptions'),  el('p', {}, r.assumptions || '—'),
      el('h5', {}, 'Implementation'), el('p', {}, r.implementation || '—'),
      el('h5', {}, 'Risk Factors'), el('p', {}, r.feasibility.riskFactors || '—'),
    ),
    el('div', { class: 'rec-detail-numbers' },
      el('span', { class: 'nl' }, 'Year-1 EBITDA'), el('span', { class: 'nv' }, fmtUSD(+r.value.year1Ebitda || 0, { signed: true })),
      el('span', { class: 'nl' }, 'Steady-State'),  el('span', { class: 'nv' }, fmtUSD(+r.value.steadyStateEbitda || 0, { signed: true })),
      el('span', { class: 'nl' }, 'Capex'),         el('span', { class: 'nv' }, fmtUSD(+r.value.capex || 0)),
      el('span', { class: 'nl' }, 'Opex Δ'),         el('span', { class: 'nv' }, fmtUSD(+r.value.opex || 0)),
      el('span', { class: 'nl' }, 'Mult. Uplift'),  el('span', { class: 'nv' }, (+r.value.exitMultipleUplift || 0).toFixed(2) + 'x'),
      el('span', { class: 'nl' }, 'Payback'),       el('span', { class: 'nv' }, fmtYears(pay)),
      el('span', { class: 'nl' }, 'Risk-Adj. NPV'), el('span', { class: 'nv ' + (npv >= 0 ? 'pos' : 'neg') }, fmtUSDFull(npv)),
      el('span', { class: 'nl' }, 'Confidence'),    el('span', { class: 'nv' }, r.feasibility.confidence.toUpperCase()),
      el('span', { class: 'nl' }, 'Feasibility'),   el('span', { class: 'nv' }, fmtNum(calcFeasibility(r), 1) + ' / 5'),
      el('span', { class: 'nl' }, 'ESG · E·S·G'),   el('span', { class: 'nv' }, `${r.esg.e}·${r.esg.s}·${r.esg.g} (${fmtNum(calcESG(r), 1)})`),
    ),
  ));
  return block;
}

function reportMethodology(state) {
  let totalNpv = 0, totalCapex = 0, esgSum = 0, esgCount = 0;
  state.recommendations.forEach(r => {
    totalNpv += calcNPV(r, state.profile);
    totalCapex += +r.value.capex || 0;
    const e = calcESG(r); if (e > 0) { esgSum += e; esgCount += 1; }
  });
  return el('div', { class: 'report-page' },
    rphead('V', 'Portfolio Summary & Methodology', 'Calculation Notes'),
    el('p', { class: 'lead' }, state.recommendations.length
      ? `The portfolio aggregates to ${fmtUSD(totalNpv, {signed:true})} risk-adjusted NPV, requiring ${fmtUSD(totalCapex)} in capital. Average ESG composite: ${esgCount ? fmtNum(esgSum/esgCount,1) + ' / 5' : '—'}.`
      : 'No portfolio totals to summarize.'),
    el('p', {}, 'Sequencing is informed by the feasibility–value matrix. Items in the "Quick Wins" quadrant — high feasibility and high value — are candidates for 100-day plan inclusion. "Strategic Bets" warrant deeper validation but represent meaningful upside. "Easy Adds" are low-risk supplements. Items in "Deprioritize" should be reconsidered or shelved.'),
    el('div', { class: 'report-methodology' },
      el('strong', { style: 'font-style:normal;font-family:var(--sans);font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:var(--forest);display:block;margin-bottom:8px;' }, 'Methodology'),
      'Risk-adjusted NPV = discounted cash-flow stream of Year-1 EBITDA + steady-state EBITDA (net of opex change) over the hold period, less capex at t = 0, plus terminal exit-multiple uplift (steady-state × turns) at year N. The NPV is then multiplied by a risk haircut (Low 1.00, Med 0.85, High 0.65). Feasibility is the average of four 1–5 scores. ESG composite is the average of three 1–5 scores. Composite blend: 45% normalized NPV, 35% feasibility, 20% ESG. Payback = capex / (steady-state EBITDA − opex).',
    ),
    rpfoot('Page V · Final'),
  );
}
