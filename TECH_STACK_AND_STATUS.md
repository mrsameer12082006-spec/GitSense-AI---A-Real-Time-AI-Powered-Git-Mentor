# GitSense AI — Tech Stack & Current Status

Last updated: 2026-06-10

This file documents the project's tech stack, architecture, notable files, recent changes, current runtime status (development), known issues, and quick-start / troubleshooting steps. It is intended to be the single-source snapshot of the app and its environment for local development.

**Repository layout (top-level)**
- Root: orchestration, top-level scripts and docs
- `backend/`: Express-based API, Prisma schema and client, ingestion and GitHub integration, Socket.IO for realtime features
- `frontend/`: Vite + React application (JSX/TS types present), UI components, sections and static assets
- `prisma/`: Prisma schema and generated client (backend/prisma/schema.prisma)
- `scratch/`, `IMPLEMENTATION_SUMMARY.md`, `QUICK_REFERENCE.md`, README files and helpers

**Tech stack (overview)**
- Platform: Node.js (ESM)

Frontend
- Framework: React 19
- Bundler / Dev server: Vite (v8)
- Language: JavaScript with TypeScript type hints (typescript devDependency, .tsconfig present)
- Styling / UI: Tailwind CSS (v4), shadcn patterns referenced, `@radix-ui/react-slot` used
- Libraries: `@monaco-editor/react`, `three`, `framer-motion`, `reactflow`, `lucide-react`, `tailwind-merge`
- Linting: ESLint configured

Backend
- Framework: Express (v5, ESM)
- ORM: Prisma (v6)
- Default datasource (development): SQLite (see `backend/prisma/schema.prisma`) — configured via `DATABASE_URL` env
- Optional production DB: can point `DATABASE_URL` to a Postgres/Neon instance
- Realtime: `socket.io`
- Auth / security: `jsonwebtoken`, `bcryptjs`, `helmet`, `express-session`, `express-rate-limit`, `cors`
- File parsing / upload: `multer`, `pdf-parse`
- HTTP client: `axios`
- AI integrations: `@xenova/transformers`, GROQ/TrueGen hooks (conditional on env keys)

Dev tooling / other
- Package manager: npm
- Prisma migrate / studio available via npm scripts
- Dev servers use `node --watch` (backend) and `vite` (frontend)

Notable files and locations
- Backend entry: `backend/server.js`
- Prisma schema: `backend/prisma/schema.prisma` (default provider: `sqlite`)
- Backend routes: `backend/src/routes/*` (auth.routes.js, github.js, repositories.js, ingestion.js, etc.)
- Backend services: `backend/src/services/*` (ai.js, github.js, ingestionService, userMemory)
- Frontend entry: `frontend/src/main.jsx`, `frontend/src/App.jsx`
- Frontend sections: `frontend/src/sections/*` (SettingsPage.jsx, ProfilePage.jsx, Dashboard.jsx, VisualizerPage.jsx)
- Frontend components: `frontend/src/components/*`

Current runtime status (development) — 2026-06-10
- Local terminals show recent `npm run dev` attempts for both backend and frontend that exited with error (Exit Code: 1). Both dev servers are currently NOT running.
  - Backend: `npm run dev` (script: `node --watch server.js`) → exit code 1 (startup failure observed)
  - Frontend: `npm run dev` (script: `vite`) → exit code 1 (startup failure observed)
- Health endpoints / quick checks:
  - Backend health route: `GET /api/health` (defined in `backend/server.js`) — reachable only when server runs
  - AI test route: `GET /api/test-ai` (tests configured AI provider keys)

Recent major implementations (already in repo)
- Settings page rewrite: `frontend/src/sections/SettingsPage.jsx` — Account Settings, Appearance (theme toggle persisted to `localStorage`), App Preferences, Danger Zone
- Profile page DB integration: `frontend/src/sections/ProfilePage.jsx` — reads `GET /api/auth/me` and updates `PUT /api/auth/profile`; avatar derived from name
- GitHub profile lookup (OAuth-free): backend `POST /api/github/link-profile`, `GET /api/github/repos` to fetch public repos for a linked username/profile URL; frontend sidebar and `RepoConnectModal` updated to support profile linking and import
- Repo import / ingestion flow: `POST /api/github/import` launches background ingestion via `ingestionService.ingestRepository` and records ingestion jobs
- Visualizer fixes: `frontend/src/sections/VisualizerPage.jsx` runtime crash fixed (missing icon imports adjusted)

Database & Auth (current codebase)
- Prisma schema (backend/prisma/schema.prisma) specifies SQLite as the datasource provider by default. The schema contains User, Repository, Conversation, Message, RepoChunk, IngestionJob, KnowledgeChunk, Activity models.
- Auth is implemented via JWT + password hashing (`bcryptjs`). Relevant routes in `backend/src/routes/auth.routes.js`.
- Note: the project can be configured to use a Postgres/Neon database by setting `DATABASE_URL` to a Postgres connection string and running Prisma migrations; the codebase supports both but the default dev schema file is SQLite.

GitHub OAuth & profile integration status
- Profile-linking fallback (direct profile URL or username) is implemented and tested to list public repositories.
- OAuth flow endpoints are implemented (`/api/github/connect`, `/api/github/callback`, `/api/github/status`, `/api/github/repos`, `/api/github/import`) but token exchange has reported intermittent failures during manual testing.
- Observed token-exchange failure: backend logs returned `{"error":"Failed to obtain access token from GitHub."}` in some runs. Typical causes: mismatched `GITHUB_CLIENT_ID` or `GITHUB_CLIENT_SECRET`, callback URL mismatch in GitHub App settings, or re-used/expired authorization codes.

Known issues (short list)
- Dev servers failing to start locally (both backend and frontend `npm run dev` exited with code 1 in recent terminal runs). Investigate startup logs to determine exact exceptions.
- GitHub OAuth token exchange intermittently fails — requires valid `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` in `backend/.env` and correct Authorization callback URL set to `http://localhost:<BACKEND_PORT>/api/github/callback` in the GitHub app settings.
- Some earlier documentation references `Neon PostgreSQL` as the production DB — that is an optional production configuration. The live schema file is configured for SQLite by default in development.
- Socket.io is configured but not yet actively used by UI features — ready for realtime work.

Testing notes & verification (recent)
- Settings/Profile/GitHub profile lookup and single-click import flows have been implemented and manually tested in earlier runs (see `IMPLEMENTATION_SUMMARY.md` and commit history). However, the current workspace snapshot shows dev servers not running, so re-testing is required after resolving startup errors.

Quick start (development)
1) Backend (dev)
```bash
cd backend
# ensure .env exists and DATABASE_URL is set (default sqlite file or Postgres URL)
npm install
npm run dev
```
- Backend dev script runs: `node --watch server.js` (PORT defaults to `process.env.PORT` or 5001 in `server.js`). If you want the backend on port 5000, set `PORT=5000` in `backend/.env` or in the shell.

2) Frontend (dev)
```bash
cd frontend
npm install
npm run dev
```
- Vite will print the dev server URL (default `http://localhost:5173`). If you previously configured `VITE_API_URL` to `http://localhost:5000`, ensure ports match the backend's `PORT`.

Health & debug commands
- Check backend health (when server running):
```bash
curl http://localhost:5001/api/health
```
- Check AI test route (requires TRUGEN_API_KEY or GROQ_API_KEY in `.env`):
```bash
curl http://localhost:5001/api/test-ai
```
- Prisma: generate client and open studio
```bash
cd backend
npx prisma generate
npx prisma studio
```

Troubleshooting checklist (when `npm run dev` fails with exit code 1)
- Inspect the terminal output for the stack trace; common immediate issues:
  - Missing `.env` variables required at startup (SESSION_SECRET, DATABASE_URL, any provider API keys)
  - Port already in use (`EADDRINUSE`) — either set a different `PORT` or kill the occupying PID
  - Syntax or import errors from new files — check the file referenced in the stack
- Useful commands on Windows:
```powershell
# find process using a port
netstat -ano | findstr :5001
# kill a PID
taskkill /PID <PID> /F
```

GitHub OAuth troubleshooting
- Verify GitHub App settings at https://github.com/settings/developers
  - Authorization callback URL should exactly match `http://localhost:<BACKEND_PORT>/api/github/callback`
- Ensure `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` are present in `backend/.env`
- Re-run the OAuth flow immediately after consenting (authorization codes expire quickly)
- If callback returns `bad_verification_code`, restart the flow and ensure server clock is correct

Project status summary — concise
- Implementation: core UI pages (Settings, Profile, Dashboard, Visualizer) and backend endpoints (auth, repos, ingestion, github linking) are present in the repo and were previously validated.
- Current blocker(s): local dev servers are failing to start (both frontend and backend need fixes), and GitHub OAuth token exchange requires proper credentials to fully validate end-to-end OAuth import flows.
- Next recommended actions: run backend and frontend dev commands, capture startup logs, fix missing env vars or runtime errors, then re-run end-to-end tests (signup, profile update, repo import).

Files changed recently (high level)
- Frontend: `frontend/src/sections/SettingsPage.jsx`, `frontend/src/sections/ProfilePage.jsx`, `frontend/src/components/RepoConnectModal.jsx`, `frontend/src/sections/VisualizerPage.jsx` (various fixes and UX updates)
- Backend: `backend/src/routes/github.js` added/updated, `backend/server.js` updated to mount routes and include health/test endpoints, `backend/prisma/schema.prisma` extended user model

If you want, I can now:
- Run the dev servers locally (capture and share the startup errors),
- Update this file further with exact startup error text, or
- Reconcile and convert the project to use Postgres/Neon by updating `DATABASE_URL` and running Prisma migrations.

What would you like me to do next? (I can start the backend dev server and paste the logs.)
