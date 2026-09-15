# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

A course project (see `reference.txt` for the full assignment rubric, in Korean) that walks through five stages of doing a small original research paper with AI assistance: (1) turn a question into a testable hypothesis, (2) build supporting argument/literature, (3) design and run an experiment, (4) interpret results, (5) assemble the final paper. Progress and decisions for each stage are written up in `docs/` as `01_질문을_가설로.md`, `02_논거세우기.md`, etc. — **read the relevant `docs/NN_*.md` file before making research-design changes**; the reasoning behind every design choice (why this hypothesis, why these citations, why this maze layout) lives there, not in code comments.

The current hypothesis: whether the number of fixed, uniquely-timbred auditory landmarks (0/2/3) in a 3D maze affects wayfinding time and path efficiency, and whether this effect is larger for people with poor self-reported sense of direction (measured via the R-SOD scale). The experiment is implemented as a browser-based simulator in `sim/`.

## Running the simulator

No build step for the front-end. `sim/` is plain HTML/CSS/JS loaded via `<script>` tags (Three.js pulled from a CDN in `index.html`); every `.js` file in `sim/` shares one global scope (there is no module system), so load order in `index.html` matters and is the way files depend on each other.

```
node sim/devserver.js
```

Serves `sim/` at `http://localhost:5173` using only Node's built-in `http`/`fs` modules (no `npm install` needed for the static site itself). Open the URL in a browser to run through the experiment flow manually. Locally, `devserver.js` also fakes the two API endpoints (`/api/submit`, `/api/results`) with file storage under `sim/data/raw/` (gitignored) so the full save-and-review flow works without real database credentials — the local admin key is the fixed string `dev` (see `admin.html`).

`sim/api/` (deployed as Vercel serverless functions) has one real dependency, `@neondatabase/serverless` (`sim/package.json`) — Vercel installs it automatically at deploy time; it's not needed to run or edit anything else in `sim/`.

There is no lint or test command. To sanity-check a `.js` file after editing, `node --check sim/<file>.js` catches syntax errors (the files reference browser globals like `window`/`document`/`THREE`, so they can't be executed directly under Node — `--check` only parses them).

To validate maze/grid logic changes in isolation (since the grid files are plain JS with no browser-only APIs), eval `maps.js` together with a small analysis script rather than running it in a browser — e.g. BFS-checking that `MAPS[0..2]` all have identical path length/turn count/dead-end count after the rotate/mirror transform. There's no permanent test file for this; write a throwaway script when you need to re-verify.

## Architecture of `sim/`

Script load order in `index.html` reflects the dependency chain:

1. **`config.js`** — all tunable constants (cell size, move speed, fog distance, timeouts, audio falloff, and the per-participant counterbalancing tables). Change numbers here before touching logic elsewhere.
2. **`maps.js`** — defines one maze as a hand-authored grid (`buildBaseGrid()`), then derives the other two maps by rotating/mirroring it (`rotate90`, `mirrorH`). Start, goal, dead-end cells, and the 3 landmark points are all transformed together via the same coordinate transform, so all `MAPS[i]` are structurally identical in difficulty (path length, turn count, dead-end count) by construction — this is deliberate (see `docs/02_논거세우기.md`, He et al. 2024 citation) and should not be replaced with independently-hand-authored maps. `shortestPathCellCount()` (BFS) is used at trial runtime to compute path-efficiency.
3. **`survey.js`** — renders the 4-item R-SOD sense-of-direction questionnaire and scores it (`scoreRSOD`). Item 4 is reverse-scored; see the comment for why. The score is used as a continuous variable, not split into groups (the paper's clinical cutoff doesn't apply to this non-clinical sample size — decided in `docs/01_질문을_가설로.md`).
4. **`audio.js`** (`LandmarkAudio`) — synthesizes three fixed 3D-positioned sound landmarks with the Web Audio API (`PannerNode`, HRTF), one per timbre: metallic clang, water-drop, machine hum. Landmarks intentionally do **not** point toward the goal — they're fixed reference points a player must triangulate from, not a "follow this" beacon. Which landmarks are active for a trial (0/2/3 of them) is controlled from outside this class via `activeIndices` passed to `init()`.
5. **`trial.js`** (`runTrial`) — owns one Three.js scene/run of the maze: builds wall/floor/ceiling meshes from the grid (uniform materials + fog, deliberately no textures — visual landmarks would confound the audio manipulation), handles WASD+pointer-lock movement and wall collision, and logs elapsed time, distance traveled, path efficiency, dead-end entries, and reorientation time (time spent stationary while rotating the camera — a proxy for "listening to figure out direction"). **The WebGLRenderer is created once and reused across trials** (`getSharedRenderer`) — recreating it per trial previously caused the canvas to hang on the second trial.
6. **`main.js`** — orchestrates screen flow (intro → survey → instructions → warmup → 3 main trials → done) and assigns each participant a row from `CONFIG.ASSIGNMENT_TABLE` via a `localStorage` counter, so participants tested sequentially on the same machine automatically get a counterbalanced order without manual bookkeeping. On finishing, it `POST`s the result JSON to `/api/submit` (auto-saved server-side); a JSON download button remains as a manual backup if the request fails.
7. **`api/submit.js`** — Vercel serverless function. Inserts one row per participant into a `submissions` table in Neon Postgres (`DATABASE_URL` env var); creates the table with `CREATE TABLE IF NOT EXISTS` on first use, so there's no separate migration step.
8. **`api/results.js`** — Vercel serverless function. Returns all rows as JSON, gated by a `?key=` query param matched against the `ADMIN_KEY` env var. Not linked from any participant-facing screen.
9. **`admin.html`** — password-gated (same `ADMIN_KEY`) researcher-only page that calls `/api/results` and renders a sortable table (per-trial badges, expandable raw JSON per row) plus CSV/JSON export buttons.

Required Vercel env vars: `DATABASE_URL` (Neon Postgres connection string) and `ADMIN_KEY` (a password you choose for `/admin.html`). Vercel's **Root Directory** project setting must be `sim` — see `docs/03_실험설계와실행.md` §6 for the full deploy steps.

When changing the experiment design (adding a condition, changing what's logged, changing counterbalancing), update the corresponding `docs/NN_*.md` file in the same change — the docs are the record of *why*, required by the assignment rubric, and are expected to stay in sync with what the code actually does.
