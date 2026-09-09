# `app/src/`

Application source. Currently a placeholder shell; screens arrive one at a time
as they are ported from the original build.

## Current contents

| File | Role |
|---|---|
| `main.tsx` | Entry point. Mounts React onto `#root` and throws loudly if the element is missing. |
| `App.tsx` | Placeholder shell. Replaced screen by screen. |
| `index.css` | Tailwind import plus the brand design tokens. |

## Planned layout

Directories are created as they are needed, not up front. Each one gets a
`README.md` when it appears.

```
src/
├── main.tsx
├── App.tsx
├── index.css
├── components/   shared presentational components
├── features/     one directory per screen, colocated logic and UI
├── lib/          data layer, clients, pure helpers
└── hooks/        shared hooks
```

## Rules

1. **Feature-first, not type-first.** A screen's component, its hooks, and its
   local types live together under `features/<screen>/`. Only genuinely shared
   code moves up into `components/` or `hooks/`.
2. **No data access inside components.** Components call hooks; hooks call the
   data layer in `lib/`. This is what keeps the guest and signed-in storage
   backends from leaking conditionals into the UI.
3. **No API keys in this directory.** Any call needing a secret goes through a
   serverless function. If a key would have to be read here, the design is
   wrong.
4. **Match the existing app's behaviour and appearance.** This is a
   re-platform. Improvements are welcome but belong in their own change, raised
   separately, so a regression is never hidden inside a redesign.
5. **Use the `@/` alias for cross-directory imports.** Relative paths are fine
   within a feature, but `../../../lib/x` is not.
