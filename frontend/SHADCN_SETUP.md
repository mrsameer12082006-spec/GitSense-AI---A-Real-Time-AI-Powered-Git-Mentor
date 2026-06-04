# GitSense AI — Shadcn UI & TypeScript Setup Guide

This guide explains how to convert the current GitSense frontend to support a standard **Shadcn UI** structure, **Tailwind CSS**, and **TypeScript**.

---

## 1. Directory Structure & Path Analysis

Currently, GitSense uses the following path configuration:
* **Components Path**: `frontend/src/components`
* **UI Primitives Path**: `frontend/src/components/ui` (e.g., `liquid-glass-button.jsx` is placed here)
* **Global Styles Path**: `frontend/src/index.css`
* **Aliases**: Relative imports (e.g., `../../lib/utils` or `../components/ui/...`) are used instead of path aliases.

### Why `/components/ui` is Critical
Creating and using the `components/ui` folder is crucial for several reasons:
1. **CLI Automation**: The `shadcn-ui` CLI automatically downloads and updates primitives (buttons, inputs, dropdowns) directly into `components/ui` based on its configuration schema.
2. **Clean Separation of Concerns**: It separates primitive, layout-agnostic building blocks (in `components/ui`) from application layouts, page sections, and feature-specific components (in `components/`).
3. **Alias Configuration**: Clean paths like `@/components/ui/button` improve readability over deeply nested relative imports like `../../components/ui/button`.

---

## 2. Setup TypeScript

To migrate the JavaScript Vite codebase to TypeScript, follow these steps:

### Step 1: Install TypeScript Dependencies
Run the following command in the `frontend` directory:
```bash
npm install -D typescript @types/react @types/react-dom @types/node vite-tsconfig-paths
```

### Step 2: Create TypeScript Configuration Files
Create a `tsconfig.json` in the `frontend` folder:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["DOM", "DOM.Iterable", "ES2022"],
    "module": "ESNext",
    "skipLibCheck": true,

    /* Bundler mode */
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",

    /* Linting */
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,

    /* Path Aliases */
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"]
}
```

Create a `tsconfig.node.json` for Vite config compilation:
```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true
  },
  "include": ["vite.config.js"]
}
```

### Step 3: Configure Vite Aliases
Update `vite.config.js` to resolve `@/` to `src/`:
```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

### Step 4: Rename Files
Rename project source files to use TypeScript extensions:
* `src/main.jsx` -> `src/main.tsx`
* `src/App.jsx` -> `src/App.tsx`
* `src/components/ui/liquid-glass-button.jsx` -> `src/components/ui/liquid-glass-button.tsx` (and restore the TypeScript interfaces/types defined in the original specification)

---

## 3. Setup Tailwind CSS (v4)

Tailwind CSS v4 is already configured in GitSense. For manual setup in a new project, follow these commands:

### Step 1: Install Tailwind CSS v4
```bash
npm install tailwindcss @tailwindcss/vite
```

### Step 2: Add Tailwind Plugin to Vite
In `vite.config.js`:
```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
})
```

### Step 3: Import Tailwind in Global CSS
In `src/index.css`:
```css
@import "tailwindcss";
```

---

## 4. Setup Shadcn UI via CLI

To configure Shadcn UI in the workspace and allow automated component additions:

### Step 1: Initialize Shadcn UI
Run the init CLI command inside the `frontend` directory:
```bash
npx shadcn@latest init
```

### Step 2: Configure CLI Prompt Answers
Answer the CLI questionnaire as follows:
* **Style**: `Default`
* **Base color**: `Slate` (or matching custom color variables)
* **Global CSS file**: `src/index.css`
* **Use CSS variables for colors?**: `yes`
* **Import alias for components**: `@/components`
* **Import alias for utils**: `@/lib/utils`
* **Use React Server Components?**: `no`

### Step 3: Adding Components Automatically
Once initialized, you can add any primitive Shadcn component directly using:
```bash
npx shadcn@latest add button
npx shadcn@latest add dialog
npx shadcn@latest add dropdown-menu
```
The CLI will automatically place them inside the `src/components/ui/` folder!
