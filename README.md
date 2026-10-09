# CodeShield — Developer Suite

A local-first React + Vite application for inspecting code text for invisible Unicode characters and reviewing selected cleanup operations.

## Requirements
- Node.js 18+ (Node.js 20+ recommended)
- npm

## Run locally
```bash
npm install
npm run dev
```
Open the local URL printed by Vite.

## Production build
```bash
npm run build
npm run preview
```

## Features
- Monaco code editor with basic language detection
- Scan for configured zero-width, Unicode format/control characters, and a conservative mixed-script lookalike heuristic
- Selective cleanup preview with removal locations and explicit apply step
- Pattern analysis panel that clearly distinguishes observable Unicode findings from AI-authorship claims
- Side-by-side text snapshot comparison
- Local scan-history summaries stored in browser `localStorage`
- Responsive dark developer-tool UI

## Scope and limitations
- This app does **not** detect or remove token-distribution watermarks such as SynthID-Text. It does not claim to attribute code to an AI system.
- Mixed-script detection is a heuristic and may flag legitimate multilingual text. Removal of lookalike characters is off by default and requires explicit opt-in.
- Some Unicode format characters can be meaningful in human languages. Inspect the cleanup preview before applying changes.
- History stores scan summaries and short previews, not full source code. All analysis is performed client-side; no application backend or upload endpoint is configured. Third-party package installation and the optional Google Fonts import require network access during setup/runtime respectively.
