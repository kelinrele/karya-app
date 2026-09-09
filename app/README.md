# Karya web app

The React rebuild of Karya. This directory will become the application root
once the migration finishes.

Until then the original build at the repository root is still the working app.
Both live side by side on purpose, so every commit leaves something runnable.

## Stack

| Concern | Choice |
|---|---|
| Build | Vite 8 |
| UI | React 19 |
| Language | TypeScript 5.9, strict |
| Styling | Tailwind CSS 4 via the Vite plugin |
| Linting | ESLint 10, flat config |
| Formatting | Prettier 3 |

TypeScript is pinned to 5.9 rather than 7.x because `typescript-eslint` accepts
`>=4.8.4 <6.1.0`. Type-aware linting is worth more here than the newest
compiler. Revisit when the plugin catches up.

## Getting started

```bash
cd app
npm install
npm run dev
```

The dev server runs on `http://localhost:5173`.

Copy `.env.example` to `.env` and fill it in before working on anything that
talks to Supabase or the assistant.

## Scripts

| Script | Does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Type check, then production build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | Type check only, no emit |
| `npm run lint` | ESLint over the whole directory |
| `npm run lint:fix` | ESLint with autofix |
| `npm run format` | Prettier write |
| `npm run format:check` | Prettier check, for CI |

## Environment variables

Anything prefixed `VITE_` is **inlined into the client bundle and is public**.
Only the Supabase project URL and anon key belong there, both of which are
designed to be public and are protected by Row Level Security.

Secrets have no prefix and are read only by serverless functions:

- `GEMINI_API_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

The service role key bypasses Row Level Security. It must never reach the
browser, and any function using it has to filter by user id explicitly.

## Conventions

- **Strict TypeScript.** `noUncheckedIndexedAccess` and
  `exactOptionalPropertyTypes` are on. Indexing an array yields `T | undefined`,
  which is deliberate.
- **Path alias.** `@/` resolves to `src/`. Configured in both `tsconfig.json`
  and `vite.config.ts`; changing one means changing the other.
- **Brand tokens live in CSS.** `--color-brand` is `#1554de`, defined in
  `src/index.css` under `@theme`. Use `text-brand` and friends rather than
  repeating the hex.
- **Prettier owns formatting.** `eslint-config-prettier` is last in the ESLint
  config so the two never fight. Do not add formatting rules to ESLint.

## Layout

```
app/
├── index.html          Vite entry document
├── src/                application source, see src/README.md
├── vite.config.ts      build config and the @ alias
├── tsconfig.json       single project, no references
├── eslint.config.js    flat config
└── .env.example        variable names, no values
```
