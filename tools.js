/* tools.js — tool definitions for Claude + categories */

export const CATEGORIES = [
  { id: 'energy',  label: 'Energy & Emissions',      color: '#2A4F40' },
  { id: 'human',   label: 'Human Capital',           color: '#B58A3E' },
  { id: 'ops',     label: 'Operations & Waste',      color: '#4D5E6F' },
  { id: 'supply',  label: 'Supply Chain',            color: '#A8513B' },
  { id: 'gov',     label: 'Governance & Compliance', color: '#1A1814' },
  { id: 'product', label: 'Product & Revenue',       color: '#7B2D3B' },
  { id: 'capital', label: 'Capital Access',          color: '#65713D' },
  { id: 'other',   label: 'Other',                   color: '#6E6A60' },
];
export const catById = id => CATEGORIES.find(c => c.id === id) || CATEGORIES[CATEGORIES.length - 1];

export const RISK_FACTORS = { low: 1.00, medium: 0.85, high: 0.65 };

export const TOOL_DEFINITIONS = [
  {
    name: 'set_company_profile',
    description: 'Set or update the target company profile in the workspace. Use this when you have extracted the company being analyzed from documents or user input. Always include as many fields as you can confidently fill in — the user can edit any of them after.',
    input_schema: {
      type: 'object',
      properties: {
        company:       { type: 'string', description: 'Target company name' },
        sector:        { type: 'string', description: 'Sector or sub-sector, e.g. "Consumer · Packaged Foods"' },
        geography:     { type: 'string', description: 'Primary geographic footprint, e.g. "North America"' },
        revenue:       { type: 'number', description: 'Annual revenue in USD (e.g. 450000000 for $450M)' },
        ebitda:        { type: 'number', description: 'Annual EBITDA in USD' },
        headcount:     { type: 'integer', description: 'Total employees' },
        holdPeriod:    { type: 'integer', description: 'Sponsor hold period in years (default 5)' },
        discountRate:  { type: 'number', description: 'Discount rate as a percent (e.g. 12 for 12%)' },
        businessModel: { type: 'string', description: '2–4 sentence summary of how the company makes money, key customers, cost drivers, and footprint' },
        dealThesis:    { type: 'string', description: '2–4 sentence sponsor investment thesis and sustainability lens' },
      },
    },
  },
  {
    name: 'add_recommendation',
    description: 'Add a value-creation recommendation to the portfolio. Call once per distinct recommendation. Be specific, quantitative, and grounded in the company\'s actual operations.',
    input_schema: {
      type: 'object',
      properties: {
        title:                { type: 'string', description: 'Concise, specific title — e.g. "On-Site Solar PPA + Plant Electrification", not "Reduce Energy"' },
        category:             { type: 'string', enum: ['energy', 'human', 'ops', 'supply', 'gov', 'product', 'capital', 'other'] },
        thesis:               { type: 'string', description: 'Why this recommendation, what changes operationally/financially/strategically, why now' },
        assumptions:          { type: 'string', description: 'Material assumptions behind the value estimates — adoption, pricing, regulatory environment' },
        implementation:       { type: 'string', description: 'Capex line items, partners, sequencing, dependencies' },
        year1Ebitda:          { type: 'number', description: 'Year-1 EBITDA impact in USD (can be 0 or negative during ramp)' },
        steadyStateEbitda:    { type: 'number', description: 'Steady-state annual EBITDA impact in USD' },
        capex:                { type: 'number', description: 'One-time capex in USD' },
        opex:                 { type: 'number', description: 'Ongoing opex change in USD (positive = increase)' },
        exitMultipleUplift:   { type: 'number', description: 'Exit multiple uplift in turns of EBITDA, e.g. 0.25 for +0.25x. Use 0 if no multiple impact.' },
        strategicFit:         { type: 'integer', minimum: 1, maximum: 5, description: '1 = off-thesis, 5 = central to thesis' },
        technicalFeasibility: { type: 'integer', minimum: 1, maximum: 5, description: '1 = unproven, 5 = mature/de-risked' },
        stakeholderAlignment: { type: 'integer', minimum: 1, maximum: 5, description: '1 = contested, 5 = aligned' },
        regulatoryTailwind:   { type: 'integer', minimum: 1, maximum: 5, description: '1 = headwind, 5 = tailwind' },
        timeToImplement:      { type: 'integer', description: 'Months to value' },
        confidence:           { type: 'string', enum: ['low', 'medium', 'high'], description: 'Confidence in the value estimates' },
        riskFactors:          { type: 'string', description: 'Material execution and thesis risks — be honest' },
        riskRating:           { type: 'string', enum: ['low', 'medium', 'high'], description: 'Overall execution risk — drives the NPV haircut' },
        esgE:                 { type: 'integer', minimum: 1, maximum: 5, description: 'Environmental materiality 1–5' },
        esgS:                 { type: 'integer', minimum: 1, maximum: 5, description: 'Social materiality 1–5' },
        esgG:                 { type: 'integer', minimum: 1, maximum: 5, description: 'Governance materiality 1–5' },
      },
      required: ['title', 'category', 'thesis'],
    },
  },
  {
    name: 'update_recommendation',
    description: 'Update one or more fields on an existing recommendation by id. Use the id shown in the artifact panel.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Recommendation id (e.g. r_a1b2c3)' },
        patch: {
          type: 'object',
          description: 'Object containing any fields from add_recommendation to update (e.g. {"steadyStateEbitda": 2500000, "riskRating": "high"}). Nested fields under value/feasibility/esg are flattened — use the same flat keys as add_recommendation.',
        },
      },
      required: ['id', 'patch'],
    },
  },
  {
    name: 'delete_recommendation',
    description: 'Remove a recommendation from the portfolio. Use when the user explicitly asks to drop one or you propose replacing it.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Recommendation id to remove' },
      },
      required: ['id'],
    },
  },
];

/**
 * Apply a recommendation patch object (flat keys like add_recommendation) to a rec.
 * Maps year1Ebitda etc. into rec.value, score keys into rec.feasibility, esgE/S/G into rec.esg.
 */
export function applyRecPatch(rec, patch) {
  const valueKeys = ['year1Ebitda', 'steadyStateEbitda', 'capex', 'opex', 'exitMultipleUplift'];
  const feasKeys = ['strategicFit', 'technicalFeasibility', 'stakeholderAlignment', 'regulatoryTailwind', 'timeToImplement', 'confidence', 'riskFactors', 'riskRating'];
  const esgMap = { esgE: 'e', esgS: 's', esgG: 'g' };
  for (const [k, v] of Object.entries(patch || {})) {
    if (valueKeys.includes(k)) rec.value[k] = v;
    else if (feasKeys.includes(k)) rec.feasibility[k] = v;
    else if (esgMap[k]) rec.esg[esgMap[k]] = v;
    else if (k in rec) rec[k] = v;
  }
  return rec;
}

/** Build a fresh recommendation from a flat input (as Claude provides via add_recommendation). */
export function recFromInput(input) {
  const rec = {
    id: 'r_' + Math.random().toString(36).slice(2, 10),
    createdAt: Date.now(),
    aiGenerated: true,
    title: input.title || 'New Recommendation',
    category: input.category || 'other',
    thesis: input.thesis || '',
    assumptions: input.assumptions || '',
    implementation: input.implementation || '',
    value: { year1Ebitda: '', steadyStateEbitda: '', capex: '', opex: '', exitMultipleUplift: '' },
    feasibility: {
      strategicFit: 3, technicalFeasibility: 3, stakeholderAlignment: 3, regulatoryTailwind: 3,
      timeToImplement: '', confidence: 'medium', riskFactors: '', riskRating: 'medium',
    },
    esg: { e: 3, s: 3, g: 3 },
  };
  applyRecPatch(rec, input);
  return rec;
}
