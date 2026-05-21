# STRATA Workspace

*AI-driven sustainability value creation studio for PE/VC due diligence.*

V2 of the STRATA tooling. Chat with Claude about a target company, attach CIM PDFs and Excel files, watch as Claude extracts a company profile and proposes quantified value-creation recommendations into a structured artifact panel. Generate the same IC-ready printable report as V1.

- **Pure static** — HTML + CSS + ES modules. No build step, no backend.
- **Bring your own API key** — paste your Anthropic key in Settings. Stored only in `localStorage`, sent directly to Anthropic. Never to any third party.
- **Tool-driven** — Claude populates the workspace by emitting tool calls (`set_company_profile`, `add_recommendation`, `update_recommendation`, `delete_recommendation`). Every action is visible and editable.
- **Demo mode** — runs without an API key. A canned conversation populates the workspace so you can see the full flow before deciding to commit any credits.

---

## Quick start

V2 uses ES modules, which browsers won't load over `file://`. Run a local server from the project folder:

```bash
python3 -m http.server 8765
```

Then open <http://localhost:8765/>. Any static server works — `npx serve`, `php -S`, etc.

**Without an API key:**

1. Click **▶ Demo** in the top bar. Watch a 5-recommendation analysis populate from a canned conversation.
2. Click around the tabs — Company, Recommendations, Dashboard, Report.
3. Click any recommendation card to edit it inline, exactly like V1.
4. Generate Report → Print → Save as PDF.

**With an API key:**

1. Get a key at <https://console.anthropic.com/> (load a small prepaid balance — $10–$20 is plenty for testing).
2. Click **⚙ Settings**, paste the key, click **Test**, then **Save**.
3. Type a company description in the chat panel, attach a PDF/Excel if you have one, and hit **Send**.
4. Watch Claude stream a response and emit tool calls that populate the artifact panel live.

---

## What's where

- **Top bar** — engagement name, session token/cost meter, Demo / Sample / Export / Import / Reset / Settings.
- **Left pane** — conversation. Mode toggle (Standard / Deep). Composer with file attach and drag-drop.
- **Right pane** — four tabs:
  - **Company** — extracted CIM context, editable
  - **Recommendations** — cards with full inline editing (same as V1)
  - **Dashboard** — totals + ranked table + feasibility–value matrix
  - **Report** — launches the print-ready IC memo overlay

---

## Models & cost

| Mode | Model | Per-1M input | Per-1M output | When to use |
|---|---|---|---|---|
| Standard | `claude-sonnet-4-6` | $3 | $15 | Default — iterative chat, recommendation generation |
| Deep | `claude-opus-4-7` | $5 | $25 | Stress-testing assumptions, complex multi-step reasoning, deep document analysis |

**Prompt caching** is on by default. The system prompt with methodology is cached for 1 hour. The active company profile is cached for 1 hour once set. Attached PDFs are cached for 5 minutes within the session. Cache reads cost ~10% of regular input tokens, so iterative chat over a long CIM is meaningfully cheaper than it looks.

**Realistic per-session cost** for a CIM-driven analysis generating ~10 recommendations:
- Standard mode: ~$0.30–$0.80
- Deep mode: ~$1.00–$2.50

The top-bar usage meter tracks the running session cost. Settings shows session and all-time totals. Anthropic's console is authoritative for actual billing.

---

## Data & privacy

Everything stays in your browser:

- API key, engagement state, chat history, attached documents → `localStorage`
- API calls go directly from your browser to `api.anthropic.com` (CORS-allowed)
- No telemetry, no backend, no third parties

`localStorage` keys used:

- `strata.v2.engagement` — profile, recommendations, chat history, documents
- `strata.v2.anthropic_key` — your API key
- `strata.v2.settings` — default mode, banner dismissal
- `strata.v2.usage` — token + cost tracking

Clear browser storage to wipe everything.

---

## File layout

```
index.html      Workspace shell — top bar, chat pane, artifacts pane, modals
styles.css      All styling (workspace, chat, artifacts, modal, print)
main.js         Entry point — init, wiring, top-bar/modal handlers
state.js        State shape, persistence, cost calculation
api.js          Anthropic client, streaming, tool-use loop
prompts.js      System prompt that defines the analyst persona
tools.js        Tool definitions (4 tools) + categories + apply patch helpers
chat.js         Chat panel rendering, markdown, streaming, tool-call cards
artifacts.js    Company / Recommendations / Dashboard / Report rendering
demo.js         Canned conversation for the Demo Mode button
README.md       This file
```

No build tooling, no `package.json`, no bundler config.

---

## Customization

Most domain-specific dials are at the top of their respective files.

**`api.js → MODELS`** — change the default model IDs, `max_tokens`, or `effort` levels per mode.

**`prompts.js → SYSTEM_PROMPT`** — adjust the analyst's voice, methodology constraints, or category set.

**`tools.js → TOOL_DEFINITIONS`** — modify what fields Claude is allowed to set on a recommendation, or add new tools (e.g. `add_milestone`, `set_assumption`).

**`tools.js → CATEGORIES`** — rename or add categories. Update colors here too.

**`tools.js → RISK_FACTORS`** — change the NPV risk haircut multipliers.

**`styles.css → :root`** — visual tokens (palette, typography, spacing).

---

## V1 vs V2

V1 (the `vc-rec-helper` repo) is a pure structured framework. V2 (this repo) adds AI on top:

| | V1 | V2 |
|---|---|---|
| AI chat | — | Yes (BYO key) |
| Document ingestion | — | PDF + Excel |
| Recommendation generation | Manual | Conversational |
| Company profile entry | Manual form | Manual + AI extracted |
| Calculation methodology | Same | Same |
| Manual editing | Yes | Yes (all artifacts editable) |
| Print-ready report | Yes | Yes (same layout) |
| Static HTML/CSS/JS | Yes | Yes (with ES modules) |
| Needs HTTP server | Optional | **Required** (ES modules) |

V1 still works for engagements where you'd rather do the analyst work yourself.

---

## Roadmap

Honest list of what's not built and could be:

- **Engagement switcher** — only one engagement at a time. Use Export/Import to swap.
- **Undo** — every edit is autosaved, no history. Add a snapshot ring buffer if it bites.
- **Sensitivity analysis** — risk haircuts approximate this. A tornado chart per rec would be nice.
- **Word/PDF export** — print-to-PDF works fine for now. A real `.docx` export via mammoth would help when the deliverable needs to be edited by a non-tool user.
- **Multi-currency** — USD only. Reformatting `fmtUSD` call sites is straightforward.
- **Shareable links** — URL-encode state. Limited by URL length on big portfolios.
- **Web search / fetch tools** — let Claude pull comp data from the open web during the conversation. Reserve for after the core flow is solid.
- **Claude Files API** — for engagements with VDR-sized document sets, switch from inline base64 PDFs to the Files API.

---

*Built locally. Runs locally. Your data and your API key never leave your browser except to call Anthropic directly.*
