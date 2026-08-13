# AGENTS.md — media-journal

Obsidian plugin for tracking books, movies, TV, and shows from daily notes with tags, comments, and monthly statistics.

## Layout

Single-file plugin — `main.ts` is the only TypeScript source. Companion files:
- `manifest.json` / `versions.json` / `config.json` / `styles.css` / `esbuild.config.mjs` / `eslint.config.mjs` / `tsconfig.json`
- `deploy.mjs` / `release.mjs` — maintainer scripts

## Commands

```bash
npm run dev      # esbuild watch -> dist/main.js
npm run build    # lint + rm -rf dist + esbuild production + cp manifest.json styles.css dist/
npm run lint     # eslint "**/*.{ts,tsx}"
npm run deploy   # build + copy to author's local vaults, then delete dist/
npm run release  # gh release create from manifest.json version
```

`build` enforces lint before bundling. No `tsc` typecheck in the build pipeline. Note: `rm -rf dist` is run before each build to ensure clean output.

## Build

- esbuild, entry `main.ts`, format `cjs`, target `es2018`
- externals: `obsidian`, `electron`, `@codemirror/*`, `@lezer/*`, Node builtins
- Copies `manifest.json` and `styles.css` to `dist/` via shell cp

## Versioning

Keep `package.json`, `manifest.json`, and `versions.json` versions in sync. `release.mjs` reads version from `manifest.json`.

## Marketplace / Scorecard

Marketplace, manifest, and release conventions live in the parent `obsidian-plugins-parent/AGENTS.md`. Read it before touching `manifest.json`, release flow, or marketplace-facing code.