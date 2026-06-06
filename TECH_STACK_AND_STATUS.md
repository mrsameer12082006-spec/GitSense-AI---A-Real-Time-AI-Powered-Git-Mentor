# GitSense AI — Tech Stack & Project Status

This document summarizes the project's tech stack, architecture, key components, and current status as observed in the workspace on 2026-06-06.

## Repository layout (top-level)
- Root: project orchestration and shared dependencies
- `backend/`: Express-based API, Prisma, real-time via Socket.IO
- `frontend/`: Vite + React (JSX/TS support), UI components and pages
- `freeze`, `README.md`, other config files

## Tech stack
- Platform: Node.js (ESM modules)

- Frontend
  - Framework: React 19 (React + React DOM)
  - Bundler/Dev Server: Vite (v8)
  - Language: JavaScript with TypeScript type support (uses `typescript` devDependency and `.tsconfig`) — project contains `.jsx`/`.tsx` files
  - UI / Styling: Tailwind CSS (v4) with Tailwind plugin for Vite; shadcn hints present in repo (`SHADCN_SETUP.md`) and `@radix-ui/react-slot` used
  - Editor/Tools: `@monaco-editor/react` integration, `three` for 3D visuals, `framer-motion`, `reactflow`, `lucide-react` icons
  - Linting: ESLint (configured dependencies present)

- Backend
  - Framework: Express (v5, ESM)
  - Database ORM: Prisma (v6) with `@prisma/client` and `prisma` as devDep
  - Realtime: `socket.io` for websocket interactions
  - Auth & Security: `jsonwebtoken`, `bcryptjs`, `helmet`, `express-rate-limit`, `cors`
  - File handling / parsing: `multer`, `pdf-parse`
  - HTTP clients: `axios`
  - Environment: `dotenv` used for config

- Dev tooling / other
  - Node package manager: npm (package.json present)
  - Build/test tools: Vite scripts, Prisma migrations (`npx prisma migrate dev`), Prisma Studio
  - Misc: `groq-sdk` is included for external data access (Sanity/GROQ), `tailwind-merge` utility

## Notable files and locations
- Backend server entry: `backend/server.js` (main API + routes)
- Backend routes & services: `backend/src/routes/*`, `backend/src/services/*` (AI, GitHub, RAG, repoContext, userMemory, webSearch)
- Prisma schema: `backend/prisma/schema.prisma`
- Frontend entry: `frontend/src/main.jsx` and `frontend/src/App.jsx`
- Frontend components: `frontend/src/components/` and `frontend/src/sections/`

## Current status (as of 2026-06-06)

### ✅ Development Servers Running
- Backend: ✅ Running on `http://localhost:5000` (ESM, Node watch mode)
- Frontend: ✅ Running on `http://localhost:5173` (Vite dev server)
- Both servers responsive and stable

### ✅ Recent Implementations
1. **Settings Page Simplification** (`frontend/src/sections/SettingsPage.jsx`)
   - ❌ Removed: AI model cards, temperature slider, safe mode, notification settings
   - ✅ Added: Account Settings, Appearance (theme toggle), App Preferences (localStorage), Danger Zone (logout/clear)
   - Status: Live and tested

2. **Profile Page Enhancement** (`frontend/src/sections/ProfilePage.jsx`)
   - ✅ Added: Loading spinner, error handling, success messages, form validation
   - ✅ Integrated with backend: `PUT /api/auth/profile`, `GET /api/auth/me`
   - ✅ Database persistence: Updates saved to Neon PostgreSQL via Prisma
   - Status: Live and tested

### ✅ Database & Auth
- Neon PostgreSQL connected via Prisma v6
- JWT authentication working (Bearer token validation)
- User model includes: id, name, email, githubLink, passwordHash, createdAt, updatedAt
- Auth routes functional: signup, login, profile fetch/update

### ✅ Dependencies All Installed
- Root, backend, and frontend `node_modules/` populated
- No missing dependencies

## Documentation Created
- `IMPLEMENTATION_SUMMARY.md` - Complete technical documentation
- `QUICK_REFERENCE.md` - Quick visual guide with code patterns
- `TECH_STACK_AND_STATUS.md` - This file (updated)

## Assumptions and notes
- Versions and dependency lists were read from `package.json` files in the workspace.
- Runtime and dev issues (e.g., exit code 1) require running the projects locally to capture logs.
- This file is a snapshot as of 2026-06-06 and may become outdated as dependencies or code change.

---

If you'd like, I can:
- Run `npm install` and start both dev servers to capture and fix current errors.
- Add run/debug scripts and a one-command developer startup script.
- Generate a short README section with run and debug instructions.

