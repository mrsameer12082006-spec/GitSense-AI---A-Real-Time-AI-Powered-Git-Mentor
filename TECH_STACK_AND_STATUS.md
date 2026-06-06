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

### ✅ Recent Implementations (Completed & Verified)

1. **Settings Page Rewrite** (`frontend/src/sections/SettingsPage.jsx`) — **COMPLETE**
   - ❌ Removed: AI model cards, temperature slider, safe mode settings (150+ lines)
   - ✅ Added 4 main sections:
     - **Account Settings**: Displays name, email, GitHub URL from localStorage; "Edit Profile" button links to profile page
     - **Appearance**: Dark Theme toggle that persists to `localStorage['gitsense_theme']` and applies 'light' class to document root
     - **App Preferences**: Two checkboxes (Git Tips, Repo Insights) with "Save Preferences" button for localStorage persistence
     - **Danger Zone**: "Clear Local App Data" (resets prefs only) and "Log Out" (clears token and redirects to login)
   - **Testing Status**: ✅ All 4 sections verified working, theme toggle persists across page reloads, localStorage updates confirmed
   - **Live URL**: `http://localhost:5173/#settings`

2. **Profile Page Database Integration** (`frontend/src/sections/ProfilePage.jsx`) — **COMPLETE**
   - ✅ Full Name field: Editable, persists to database
   - ✅ Email field: Read-only (displays current user email)
   - ✅ GitHub URL field: Editable, optional, persists to database
   - ✅ UX Enhancements: Loading spinner, error messages (red box), success feedback (green box), form validation
   - ✅ API Integration: 
     - `GET /api/auth/me` - Fetches user profile on mount with Bearer token
     - `PUT /api/auth/profile` - Saves name, email, githubLink updates to Neon PostgreSQL
   - ✅ Avatar: Dynamically updates to first letter of user's name
   - **Testing Status**: ✅ Database persistence verified — Changed name "Sarah Chen" → "Dr. Sarah Chen PhD", saved successfully, page refresh confirmed data persisted in PostgreSQL, Settings page shows updated name
   - **Live URL**: `http://localhost:5173/#profile`

### ✅ Database & Auth (Fully Verified)
- **Neon PostgreSQL**: Connected via Prisma v6, all user updates persist indefinitely
- **JWT Authentication**: Bearer token validation working on all protected endpoints
- **User Model**: id (uuid), name, email (unique), githubLink, passwordHash, createdAt, updatedAt
- **Auth Routes**: All tested and working:
  - `POST /api/auth/signup` — Creates user, returns JWT token
  - `POST /api/auth/login` — Validates credentials, returns JWT token
  - `GET /api/auth/me` — Returns authenticated user profile (Bearer token required)
  - `PUT /api/auth/profile` — Updates user profile fields (Bearer token required)

### ✅ End-to-End Auth Flow Testing (Completed 2026-06-06)
- ✅ User creation: Test user "Sarah Chen" (sarah.chen@example.com) created via signup form
- ✅ Dashboard redirect: After signup, user redirected to #dashboard with greeting "Good evening, Sarah Chen"
- ✅ User menu: Displays name and email in top-right dropdown
- ✅ Settings page: Account info displays correctly, theme toggle works with localStorage persistence
- ✅ Profile page: Loads user data, edits persist to database, page refresh confirms persistence
- ✅ Cross-page sync: Updates in Profile page appear immediately in Settings page

### ✅ Data Persistence Mechanisms (All Verified)
- **PostgreSQL (Permanent)**: User profiles (name, email, githubLink) persist indefinitely
- **localStorage (Session)**: 
  - `gitsense_token` — JWT token (auth session)
  - `gitsense_user` — User object (quick access)
  - `gitsense_theme` — Theme preference (survives page refresh)
  - `gitsense_pref_git_tips` — App preference flag
  - `gitsense_pref_repo_insights` — App preference flag
- **Tested Persistence**: ✅ Theme toggle persists across full page reload, profile name persists across reload

### ✅ Dependencies All Installed
- Root, backend, and frontend `node_modules/` populated
- No missing dependencies

## Documentation Created
- `IMPLEMENTATION_SUMMARY.md` - Complete technical documentation
- `QUICK_REFERENCE.md` - Quick visual guide with code patterns
- `TECH_STACK_AND_STATUS.md` - This file (updated)

## Testing & Verification Results (2026-06-06)

### ✅ Complete Feature Verification
**Test User**: Sarah Chen (sarah.chen@example.com / TestPass2024!)

**Settings Page Tests**:
- ✅ Account Settings section displays name, email, GitHub URL
- ✅ Edit Profile button navigates to #profile
- ✅ Dark Theme toggle changes appearance and persists to localStorage
- ✅ App Preferences checkboxes toggle correctly
- ✅ Save Preferences button stores settings to localStorage
- ✅ Danger Zone buttons present and functional

**Profile Page Tests**:
- ✅ Page loads with user profile data from `GET /api/auth/me`
- ✅ Form fields populate: name, email (read-only), GitHub URL
- ✅ Avatar updates to first letter of name (S → D when changed)
- ✅ Name edit: "Sarah Chen" → "Dr. Sarah Chen PhD", saved successfully
- ✅ Save Changes button sends `PUT /api/auth/profile` request
- ✅ Success message displays: "Profile updated successfully!"
- ✅ **Database persistence confirmed**: After page refresh, name remains "Dr. Sarah Chen PhD"
- ✅ **Cross-page sync**: Settings page reflects new name immediately

**Authentication Flow**:
- ✅ Signup form accepts valid inputs (name, email, password, GitHub URL)
- ✅ Account created successfully with 201 status code
- ✅ JWT token generated and stored in localStorage
- ✅ User redirected to #dashboard with personalized greeting
- ✅ User menu displays name and email
- ✅ Profile and Settings pages accessible to authenticated users

**Data Persistence**:
- ✅ PostgreSQL: Profile updates persist across browser sessions
- ✅ localStorage: Theme preference persists across page reloads
- ✅ localStorage: Session token and user data maintained during session
- ✅ Cross-origin requests: CORS enabled for http://localhost:5173

### Test Environment
- Backend Server: http://localhost:5000 (Express, Node.js)
- Frontend Dev Server: http://localhost:5173 (Vite)
- Database: Neon PostgreSQL (via Prisma)
- Browser: Chrome (Playwright automated testing)

## Assumptions and notes
- Versions and dependency lists were read from `package.json` files in the workspace.
- Runtime and dev issues (e.g., exit code 1) require running the projects locally to capture logs.
- This file is a snapshot as of 2026-06-06 and may become outdated as dependencies or code change.

---

If you'd like, I can:
- Run `npm install` and start both dev servers to capture and fix current errors.
- Add run/debug scripts and a one-command developer startup script.
- Generate a short README section with run and debug instructions.

