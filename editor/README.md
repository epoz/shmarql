# Story editor

The browser editor behind SHMARQL's `/lodeon/`: the TypeScript/Vite/Tiptap
editor of [LODEON](https://gitlab.rlp.net/adwmainz/digicademy/lodeon/lodeon-core)
(`lodeon-core/editor/`), ported without the AI Assistant.

## What changed compared to LODEON

- **No Assistant.** The Assistant panel, chats, project memory, tool cards,
  proposals, suggestions, model selection and every `/api/assistant/*` call are
  removed, together with the Verovio `assistantContext` setting and the "export
  with/without chats" choice. The editor makes no calls to language models or
  other external tools.
- **Project packages stay compatible with LODEON.** Exported `.lodeon.zip`
  packages contain LODEON's empty default `assistant` block (LODEON's importer
  requires it), and Assistant data in imported LODEON packages is dropped
  (`src/project/package/lodeon-interop.ts`, `src/project/normalization.ts`).
- **No LODEON Package Registry.** The build-time package extension and public
  resource Vite plugins are gone; the LODEON branding lives in
  `public/resources/branding/`.
- **Backend.** The API is provided by shmarql (`src/shmarql/routes/lodeon_editor.py`):
  `/api/config` is assembled from the LODEON resources bundled in
  `src/shmarql/lodeon/resources/` and the SPARQL profiles, Preview renders through
  shmarql's own Markdown pipeline and Publish writes into the docs directory.
- **Runs inside the shmarql site.** `/lodeon/` is rendered by shmarql's
  `lodeon_editor.html` template, so the site header, navigation and footer stay in
  place and the editor fills the main pane (`.ld-app-shell` fills its container
  instead of the window). It uses the shmarql palette and font (tokens at the top
  of `src/styles.css`), has no LODEON logo or day/night toggle, and leaves the page
  title and favicon to the template.
- About/Help texts (`public/content/`) describe the shmarql setup.

Everything else — Special Nodes, metadata panel, Preview/Publish workflows,
import/export, local-first persistence, i18n and error registry — is LODEON's.

## Scripts

```bash
npm ci
npm test                       # vitest (tests/)
npm run quality                # eslint, prettier, tsc
npm run build                  # production build -> ../src/shmarql/lodeon_editor/
npm run build:shmarql-verovio  # story-page Verovio runtime -> ../src/shmarql/static/lodeon/verovio/
npm run dev                    # http://localhost:5173/lodeon/, API proxied to SHMARQL_URL
```

`npm run dev` proxies `/api`, `/static` and `/story` to a running shmarql
(`SHMARQL_URL`, default `http://127.0.0.1:8000`).

The build output is committed into the Python package so that shmarql runs
without Node.js; rebuild it after changing the editor. The Verovio runtime used
on published story pages is built from the same sources
(`src/nodes/verovio/shmarql-runtime.ts`) and must be rebuilt when the Verovio
node or its configuration schema changes.

## Layout

- `src/application/` — composition root and runtime
- `src/editor/`, `src/extensions/`, `src/ui/` — Tiptap editor, toolbar, panels, modals
- `src/nodes/` — Special Nodes (SPARQL/visual query, Plotly, RAWGraphs, Leaflet,
  Graph Explorer, IIIF, embeds, media assets, Verovio, story metadata)
- `src/markdown/` — ProseMirror → Markdown export through the renderer mappings
- `src/project/`, `src/persistence/` — project model, `.lodeon.zip` packages, IndexedDB
- `src/preview/`, `src/publish/`, `src/auth/` — Preview, Publish, token login
- `src/configuration/` — the validated `/api/config` contract
- `tests/` — vitest + jsdom tests (ported from `lodeon-core/tests/frontend/editor`)

Keep code close to LODEON so upstream changes can be ported; when doing so, leave
out anything under LODEON's `editor/src/assistant/`.
