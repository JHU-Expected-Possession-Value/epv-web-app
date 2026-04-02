# EPV Web App (Next.js)

Presentation-focused dashboard for **Expected Possession Value (EPV)** tooling: an interactive **tactical board**, **turnover replay** with optional **recommendation overlays** (arrows + EPV context on real tracking frames), and public marketing pages.

## Implemented vs roadmap

| Area | Status |
|------|--------|
| Tactical board (drag players, formations, EPV-style recommendation) | Implemented |
| Per-player **threat heat map** overlay (synthetic surface from skills + position via API) | Implemented |
| Replay: real moments, original playback | Implemented |
| Replay “recommended” view | **Decision layer only**: same frames + EPV / arrow overlay; **no** full counterfactual re-simulation |
| Scenario editor | Removed from product scope |
| Live tracking board | Not used in current dashboard |

## Prerequisites

- **Node.js 20+** (LTS recommended)
- **Backend** running for API calls: see [`../epv-web-server/README.md`](../epv-web-server/README.md) (or your deployed API URL)

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_API_BASE_URL` | No (default `http://127.0.0.1:8000`) | Base URL of the FastAPI server (no trailing slash). Use your production API in Vercel. |

Example local `.env.local`:

```bash
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000
```

## Run locally

```bash
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The **Tools → Dashboard** page (`/tools/dashboard`) is the main demo surface.

Other scripts:

```bash
npm run lint    # ESLint (Next.js config)
npm run build   # Production build
npm start       # Serve production build (after build)
```

## Project structure (frontend)

```
app/                    # Next.js App Router: pages & layouts
  tools/dashboard/      # Tactical board + replay tabs
components/
  tactics/              # TacticsBoard (pitch SVG, formations, heat map)
  replay/               # PitchRenderer, replay visuals
lib/
  api.ts                # Typed fetch helpers for the FastAPI backend
```

## CI / deployment

- **CI:** GitHub Actions workflow `.github/workflows/ci.yml` runs `npm ci`, `npm run lint`, and `npm run build` on pushes and PRs to `main`.
- **Deploy:** `.github/workflows/deploy-both.yml` (on push to `main`) triggers **Render** and **Vercel** via repository secrets `RENDER_DEPLOY_HOOK_URL` and `VERCEL_DEPLOY_HOOK_URL`. Configure those in the repo settings.

## Reproducing demos

1. Start the backend with valid `EPV_DATA_DIR` if you need **replay** endpoints (see server README).
2. Start this app with `NEXT_PUBLIC_API_BASE_URL` pointing at that server.
3. Open **Dashboard → Tactical Board** for positioning / heat map / heuristic EPV.
4. Open **Dashboard → Replay** for turnover clips and optional recommendation overlay.

Presentation plots and batch analysis for the research codebase live in the separate **EPV_SARG** / research repo, not in this Next bundle.
