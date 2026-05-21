/* demo.js — canned conversation that plays without an API key */

export const DEMO_USER_PROMPT = `I'm looking at a $450M mid-market frozen meals manufacturer in North America. Three plants, 1,200 FTEs, $65M EBITDA, 5-year hold, 12% discount rate. What sustainability-led value creation should I prioritize?`;

// Sequence of "events" — text chunks (streamed) and tool calls (executed against state).
export const DEMO_SCRIPT = [
  { type: 'text', text: 'Let me set up the profile and walk through what I see as the priority moves. Mid-market packaged food with three plants is a good shape for sustainability-led value creation — energy is a meaningful operating cost line, the workforce story is real, and there\'s genuine consumer demand for category-relevant innovation.\n\n' },

  { type: 'tool', name: 'set_company_profile', input: {
    company: 'Atlas Foods, Inc.',
    sector: 'Consumer · Packaged Foods',
    geography: 'North America',
    revenue: 450000000,
    ebitda: 65000000,
    headcount: 1200,
    holdPeriod: 5,
    discountRate: 12,
    author: 'Demo',
    businessModel: 'Mid-market frozen ready-meals manufacturer. Branded + private-label distribution through major grocery and club retailers, with a growing DTC subscription channel. Three production facilities (Ohio, Texas, California). Top-10 customer concentration ~52% of revenue.',
    dealThesis: 'Sponsor sees a path to ~$95M pro-forma EBITDA by Year 5 through (i) DTC margin expansion, (ii) consolidation of co-manufacturing footprint, and (iii) margin + multiple uplift from a credible sustainability narrative — particularly energy efficiency, workforce stabilization, and plant-forward product expansion responsive to category demand shifts.',
  }},

  { type: 'text', text: 'Here are the five recommendations I\'d sequence for the 100-day plan and through Year 2.\n\n' },

  // 1. Energy
  { type: 'tool', name: 'add_recommendation', input: {
    title: 'On-Site Solar PPA + Plant Electrification',
    category: 'energy',
    thesis: 'Execute power purchase agreements for on-site solar across all three production facilities, paired with selective boiler-to-heat-pump conversion for low-temperature processes. Reduces Scope 1 & 2 emissions ~38% while locking in below-grid energy economics for the hold period.',
    assumptions: 'PPA at $0.058/kWh against current blended grid of $0.092/kWh. Heat-pump capex includes ducting retrofits. IRA Section 48 ITC ~30% offset on owned components; no other incentive program assumed.',
    implementation: 'Phase 1: RFP for PPA developer (Q1). Phase 2: Ohio plant electrification pilot (Q2–Q3). Phase 3: TX/CA rollout (Y2). Requires dedicated facilities PM and energy consultant retainer.',
    year1Ebitda: 800000, steadyStateEbitda: 2400000, capex: 8500000, opex: 300000, exitMultipleUplift: 0.25,
    strategicFit: 5, technicalFeasibility: 3, stakeholderAlignment: 4, regulatoryTailwind: 5,
    timeToImplement: 18, confidence: 'medium',
    riskFactors: 'Interconnection delays at California facility. Heat-pump performance in high-throughput environments not fully de-risked. PPA counterparty credit risk over 15-yr term.',
    riskRating: 'low',
    esgE: 5, esgS: 2, esgG: 3,
  }},
  { type: 'text', text: '**Energy is the cleanest move.** Solar PPAs in particular are a structural margin improvement, not a story — locking in below-grid rates for the hold period is real money. The heat-pump piece carries more execution risk but has IRA tailwinds.\n\n' },

  // 2. Product
  { type: 'tool', name: 'add_recommendation', input: {
    title: 'Plant-Forward Product Line Expansion',
    category: 'product',
    thesis: 'Develop eight new plant-protein SKUs targeting the growing category (~15% CAGR) and command premium pricing vs. legacy meat-based portfolio. Leverages existing extrusion capacity at Texas facility with modest retooling.',
    assumptions: '~$22M incremental retail revenue by Year 3 at 26% gross margin vs. 19% legacy. Cannibalization estimated at 15%. Exit multiple uplift reflects category re-rating of food businesses with credible plant-protein platforms.',
    implementation: 'R&D partnership with a plant-protein ingredient supplier. Texas line modification (~$1.4M). Sales activation through existing retail relationships. Marketing co-investment with two anchor retailers.',
    year1Ebitda: 1200000, steadyStateEbitda: 5800000, capex: 3000000, opex: 600000, exitMultipleUplift: 0.5,
    strategicFit: 5, technicalFeasibility: 4, stakeholderAlignment: 4, regulatoryTailwind: 4,
    timeToImplement: 14, confidence: 'medium',
    riskFactors: 'Consumer adoption uncertainty. Ingredient supply concentrated in ~3 global producers. Retailer slotting fees may compress Year-1 economics.',
    riskRating: 'medium',
    esgE: 4, esgS: 4, esgG: 2,
  }},
  { type: 'text', text: '**The product line is the highest-NPV swing** — it\'s also where exit multiple uplift is most defensible. Food businesses with credible plant-protein platforms have rerated 1.5–2 turns in recent transactions; even a conservative 0.5 turns here is material.\n\n' },

  // 3. Human capital
  { type: 'tool', name: 'add_recommendation', input: {
    title: 'Workforce Retention & Stabilization Program',
    category: 'human',
    thesis: 'Reduce plant turnover from 38% to ~22% via predictable scheduling, modest wage uplift, supervisor training, and a structured internal mobility track. Lower turnover compounds into recruiting savings, training cost avoidance, and quality improvements that reduce scrap.',
    assumptions: 'Wage uplift of $1.80/hr blended across 850 plant FTEs (~$3.2M annual). Recruiting + onboarding savings $2.4M annually at steady state. Quality-driven scrap reduction $0.9M.',
    implementation: 'HR-led design with plant managers (Q1). Pilot at Ohio (Q2). Rollout at Texas + California (Q3–Q4). Supervisor training contract.',
    year1Ebitda: 0, steadyStateEbitda: 2100000, capex: 1200000, opex: 0, exitMultipleUplift: 0.1,
    strategicFit: 4, technicalFeasibility: 5, stakeholderAlignment: 3, regulatoryTailwind: 3,
    timeToImplement: 9, confidence: 'high',
    riskFactors: 'Wage uplift pressures margin pre-savings. Union dynamics at California facility introduce timing risk.',
    riskRating: 'low',
    esgE: 1, esgS: 5, esgG: 3,
  }},

  // 4. Capital access
  { type: 'tool', name: 'add_recommendation', input: {
    title: 'Supplier Engagement & ESG-Linked Refinancing',
    category: 'capital',
    thesis: 'Engage top-25 suppliers (~80% of spend) on emissions disclosure and 5% YoY reduction commitments. Qualifies the company for sustainability-linked refinancing on the existing $180M term loan at a 50bp coupon reduction, contingent on hitting KPIs.',
    assumptions: 'Refinancing executable in Year 2 conditional on disclosure framework completion. KPI step-ups achievable based on supplier baseline data. Annual program cost $0.6M for dedicated procurement-sustainability resource and external verification.',
    implementation: 'Supplier scorecard rollout (Q1–Q2). External verification partner. Refinancing process in Q3 of Year 2 with existing lender syndicate.',
    year1Ebitda: 100000, steadyStateEbitda: 300000, capex: 400000, opex: 600000, exitMultipleUplift: 0.15,
    strategicFit: 3, technicalFeasibility: 4, stakeholderAlignment: 2, regulatoryTailwind: 4,
    timeToImplement: 12, confidence: 'low',
    riskFactors: 'Supplier participation rates uncertain at lower tiers. Lender willingness to honor coupon step-down not yet confirmed. Program may be net-negative if KPIs aren\'t hit.',
    riskRating: 'medium',
    esgE: 5, esgS: 3, esgG: 5,
  }},
  { type: 'text', text: '**Be honest about the supplier engagement piece** — the unit economics here are thin and the program-cost-vs-coupon-savings is a coin flip if KPIs miss. I\'ve marked it medium risk and low confidence. Worth doing for the optionality and the disclosure infrastructure, but not a load-bearing piece of the thesis.\n\n' },

  // 5. Ops
  { type: 'tool', name: 'add_recommendation', input: {
    title: 'Cold-Chain Route Optimization & EV Last-Mile Pilot',
    category: 'ops',
    thesis: 'Deploy AI-driven route optimization across the company-controlled distribution leg, paired with a 20-truck EV pilot for last-mile in two metro markets. Reduces fuel and maintenance opex while building a credible Scope 3 reduction story for the next refinancing.',
    assumptions: 'Route optimization yields ~12% mileage reduction at $0.41/mi blended cost. EV fleet capex includes depot charging infrastructure. Federal + state incentives offset ~22% of EV capex.',
    implementation: 'Software vendor selection (Q1). Pilot deployment Q2. EV procurement and depot upfit Q2–Q4. Driver training and dispatcher workflow redesign.',
    year1Ebitda: 400000, steadyStateEbitda: 1600000, capex: 4200000, opex: 200000, exitMultipleUplift: 0.1,
    strategicFit: 4, technicalFeasibility: 3, stakeholderAlignment: 4, regulatoryTailwind: 4,
    timeToImplement: 15, confidence: 'medium',
    riskFactors: 'EV range and reliability in cold-chain duty cycle not fully proven. Charging infrastructure permitting timeline variable by metro.',
    riskRating: 'medium',
    esgE: 4, esgS: 2, esgG: 3,
  }},

  { type: 'text', text: '\n**Portfolio shape:** energy and product are the highest-NPV recs — sequence those first. Workforce stabilization is the lowest-risk and pays back compounding. Treat the capital access rec as optionality, not core thesis.\n\nWant me to deepen any of these, stress-test the assumptions, or explore a Scope 3 / packaging recommendation I haven\'t added yet?' },
];

// Streaming speed for demo
export const DEMO_CHAR_DELAY_MS = 8;
export const DEMO_TOOL_DELAY_MS = 600;
