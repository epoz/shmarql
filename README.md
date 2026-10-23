# SHMARQL

A Linked Data publishing platform for semantic web professionals in a hurry. Make compelling queries and documentation of your RDF data, using an open-source, simple platform.

Documentation here: https://shmarql.com/

- **SPARQL proxy** for a list of backend triplestores ("profiles") defined in a YAML
  file. Each profile is keyed by a hash of its address and served at
  `/sparql/<key>`; one profile is also the default `/sparql` endpoint.
- **Query page** (`/query`) with a [CodeMirror](https://codemirror.net/5/) SPARQL
  editor and an autocomplete text box to pick the profile to query.
- **Documentation**: a directory of Markdown files rendered off the root URL.
- **Entity viewer** (`/entity?uri=…`): a human-friendly, tabular view of an RDF
  resource including its blank nodes, inverse relations, images and map — ported
  from [ldview](https://codeberg.org/renevoorburg/ldview).
- **Data stories** authored with [LODEON](https://gitlab.rlp.net/adwmainz/digicademy/lodeon/lodeon-core):
  their Markdown (front matter, `shmarql` queries, Plotly/RAWGraphs visualisations,
  IIIF, maps, graph explorer, embeds, music notation) renders as part of the docs.
- **Story editor** (`/lodeon/`): LODEON's visual authoring environment, without its
  AI Assistant, to write data stories against the configured profiles, preview them
  in the site's look and publish them into the docs.

Built and run with [uv](https://docs.astral.sh/uv/).

## Quick start

```shell
uv sync                    # create .venv and install dependencies
cp .env.example .env       # adjust settings (optional)
uv run shmarql            # serve on http://127.0.0.1:8000
```

Then open:

| URL                                                 | What                                                           |
| --------------------------------------------------- | -------------------------------------------------------------- |
| `/`                                                 | the Markdown docs in `docs/` (including an example data story) |
| `/query`                                            | the SPARQL editor                                              |
| `/entity?uri=http://dbpedia.org/resource/Rembrandt` | the entity viewer                                              |
| `/lodeon/`                                          | the story editor                                               |
| `/sparql?query=…`                                   | the default SPARQL endpoint                                    |
| `/sparql/<key>?query=…`                             | a specific profile (`uv run shmarql profiles` lists the keys)  |
| `/api/profiles`                                     | profiles as JSON (no upstream addresses)                       |
| `/api/docs`                                         | OpenAPI docs for the HTTP API                                  |

Development server with auto-reload: `uv run shmarql serve --reload`.
Or run uvicorn directly: `uv run uvicorn --factory shmarql.main:app_factory`.

## Docker

Build the container image (it installs the locked dependencies with [uv](https://docs.astral.sh/uv/) and serves on `0.0.0.0:8000`):

```shell
docker build -t shmarql .
docker run --rm -p 8000:8000 \
  -v "$PWD/profiles.yaml:/data/profiles.yaml:ro" \
  -e PROFILES_PATH=/data/profiles.yaml \
  -e ENDPOINT=https://query.wikidata.org/sparql \
  shmarql
```

Then open http://127.0.0.1:8000.

The image serves the Markdown docs from `/app/docs` and the API on port 8000
(override with `-e HOST=… -e PORT=…`).

A container image is built and pushed to the [GitHub Container Registry](https://github.com/epoz/shmarql/pkgs/container/shmarql)
by the [Docker workflow](.github/workflows/docker.yml) on every push to `main`.

## Configuration

Everything is configured through environment variables, read at startup by
[`src/shmarql/config.py`](src/shmarql/config.py). A `.env` file in the working
directory is loaded first (`SHMARQL_ENV_FILE` selects another file); real
environment variables win over the file. See [`.env.example`](.env.example).

| Variable                    | Default             | Meaning                                                                    |
| --------------------------- | ------------------- | -------------------------------------------------------------------------- |
| `SITE_TITLE`                | `SHMARQL`           | Title in the header and page titles                                        |
| `HOST`, `PORT`              | `127.0.0.1`, `8000` | Bind address for `uv run shmarql`                                          |
| `DEBUG`                     | `0`                 | Verbose logging                                                            |
| `PROFILES_PATH`             | `profiles.yaml`     | YAML file with the SPARQL profiles                                         |
| `ENDPOINT`                  | –                   | Endpoint address of the profile served at `/sparql` (e.g. `https://query.wikidata.org/sparql`); overrides the YAML `default`, and becomes the default used for queries. When no profiles are configured, it adds a single new profile for that backend |
| `SPARQL_TIMEOUT`            | `30`                | Upstream timeout in seconds                                                |
| `SPARQL_USER_AGENT`         | `shmarql/0.1 …`     | User-Agent sent upstream                                                   |
| `CORS_ORIGINS`              | –                   | Comma separated origins allowed to call the API (`*` = all)                |
| `DOCS_PATH`                 | `docs`              | Directory of Markdown documentation served at `/`                          |
| `LODEON_CONFIG_PATH`        | –                   | YAML overriding the LODEON renderer config (e.g. embed `allowedOrigins`)   |
| `LODEON_ASSETS_PATH`        | –                   | Directory replacing the bundled LODEON browser assets                      |
| `LODEON_EDITOR_ENABLED`     | `1`                 | Serve the story editor at `/lodeon/` and its API                           |
| `LODEON_EDITOR_TOKEN`       | –                   | Access token for the editor; required to publish (see below)               |
| `LODEON_EDITOR_SESSION_TTL` | `28800`             | Lifetime of an editor login, in seconds                                    |
| `LODEON_STORY_DIR`          | `story`             | Published stories go to `DOCS_PATH/<dir>/<slug>/index.md`                  |
| `LODEON_PREVIEW_PATH`       | temp dir            | Where previews are kept                                                    |
| `LODEON_PREVIEW_TTL`        | `3600`              | Seconds after which a preview is removed                                   |
| `LODEON_MAX_UPLOAD_MB`      | `100`               | Maximum size of a Preview/Publish request (story and media)                |
| `DEFAULT_LANGUAGE`          | `en`                | Fallback language for UI strings and labels                                |
| `SUPPORTED_LANGUAGES`       | `en,nl`             | Languages negotiated from `Accept-Language`                                |

### Profiles

```yaml
# profiles.yaml
default: wikidata # the profile behind /sparql (name, key or endpoint address)
display: {} # optional global entity-viewer settings
profiles:
  - name: wikidata # also usable as kg="wikidata" in data stories
    title: Wikidata
    description: The Wikidata Query Service
    endpoint: https://query.wikidata.org/sparql
    headers: { User-Agent: "my-site/1.0 (me@example.org)" } # optional
    timeout: 20 # optional, seconds
    allow_update: false # proxy SPARQL Update? (default false)
    uri_prefixes: # entity URIs that belong to this profile
      - http://www.wikidata.org/entity/
    display: # optional per-profile entity-viewer settings
      construct_query: "CONSTRUCT { {subject_uris} ?p ?o . } WHERE { {subject_uris} ?p ?o . }"
    sparnatural: shapes/wikidata.ttl # optional: enables the editor's visual query builder
    graph_explorer: { maxNodes: 200 } # optional: editor Graph Explorer settings
```

The key of a profile is the first 12 hex characters of the SHA-256 hash of its
`endpoint`. It's stable while the address stays the same and doesn't reveal the
upstream address to browsers. Two profiles with the same address are rejected.

The `/sparql` and `/sparql/<key>` endpoints implement the SPARQL 1.1 protocol
(GET with `query=`, POST form-encoded or `application/sparql-query`). The client's
`Accept` header is forwarded, profile `headers` are added, and the upstream status,
content type and body are returned unchanged. SPARQL Update is refused (403)
unless the profile sets `allow_update: true`. A browser that opens an endpoint
without a query is redirected to the query page.

The `display` settings are those of
[`entity/settings.py`](src/shmarql/entity/settings.py) — the ldview configuration
in lower case: `namespaces` (merged), `label_predicates`, `description_predicates`,
`hide_predicates`, `image_predicates`, `image_paths`, `iiif_image_predicates`,
`coordinate_paths`, `wkt_predicates`, `predicate_groups`, `skolem_uri_pattern`,
`bn_label_predicate_paths`, `construct_query`, `max_inverse_subjects`,
`show_inverse_relations`, `fetch_images`, `fetch_coordinates`, `fallback_languages`,
`label_batch_size`, …

### Documentation

Every `*.md` file below `DOCS_PATH` is a page: `index.md` → `/`, `guide.md` →
`/guide`, `guide/index.md` → `/guide/`. Links between Markdown files are rewritten
to these URLs, other files (images, …) are served as-is, and a navigation sidebar
and table of contents are generated. Titles come from front matter `title:` or the
first heading. Python-Markdown with tables, footnotes, `attr_list`, `md_in_html`,
syntax highlighting and pymdownx admonitions/details/tabs is used. SPARQL code
blocks (` ```sparql `) get a "▶ run" link to the query page.

### Entity viewer

`/entity?uri=<IRI>[&profile=<key or name>]` looks the IRI up in the given profile,
else in the profile whose `uri_prefixes` match it, else in the default profile.
Like ldview it shows:

- the label and description in the preferred language (from `Accept-Language`,
  with language tabs for multilingual values), type badges, images (also via IIIF
  and `image_paths`) and a Leaflet map for WKT / lat-long data;
- grouped, prefix-shortened property tables, with labels for linked resources;
- **blank nodes** (and skolemised IRIs) up to four levels deep, each as its own
  table with the predicate chain leading to it, and links from the parent table;
- **inverse relations**, also through one or two intermediate blank nodes, with a
  link to the query editor when there are more than `max_inverse_subjects`;
- RDF downloads: `?format=turtle|json-ld|xml|nt` or an RDF `Accept` header.

The CONSTRUCT query falls back to simpler queries for endpoints that can't run it.

### Data stories (LODEON)

Put a story's Markdown (as exported or published by LODEON) with its `assets/`
anywhere in the docs, e.g. `docs/story/<slug>/index.md`. A page is treated as a
data story when it has `lodeon:` front matter or contains `shmarql` / `lodeon-*`
fences. Then:

- the `lodeon.htmlMeta`, `openGraph` and `jsonLd` front matter become `<meta>`
  tags and JSON-LD in the page head;
- `lodeon-embed`, `lodeon-graph-explorer`, `lodeon-leaflet` and `lodeon-verovio`
  fences are projected to HTML on the server using LODEON's own (vendored) node
  renderers and configuration;
- `shmarql`, `lodeon-visualization`, `lodeon-rawgraphs` and `lodeon-iiif` fences
  become the same `<pre class="…-source" title=… kg=…>` shells as in LODEON's
  MkDocs build and are hydrated by the bundled LODEON browser runtime.

The runtime's API is provided: `POST /api/sparql/<profile>` (read-only; `kg`
attributes are resolved as profile _name_ or key, so name your profiles after the
LODEON knowledge-graph ids), `POST /shmarql/fragments/sparql` (HTML result table
for `shmarql` fences without `kg`), and `POST /api/explorer/<profile>/expand` for
the graph explorer.

### Story editor (LODEON)

`/lodeon/` serves the [LODEON](https://gitlab.rlp.net/adwmainz/digicademy/lodeon/lodeon-core)
editor (from [`editor/`](editor/)) with the AI Assistant and all calls to language
models removed. It runs in the main pane of the site (header, navigation — with a
_Story editor_ link — and footer as on every page) and uses the site's colours. Authors write a story in a visual editor that mixes text with
Special Nodes — SPARQL queries (with an optional visual query builder), Plotly and
RAWGraphs visualisations, Leaflet maps, Graph Explorer, IIIF, embeds, media assets,
music notation and story metadata — and run the queries against the profiles of
this site (profile _names_ are the knowledge-graph ids of the editor).

- Projects live in the browser (IndexedDB) and are exported/imported as
  `.lodeon.zip` packages that are compatible with LODEON in both directions;
  Assistant chats in a LODEON package are dropped on import.
- **Preview** stores the story temporarily and renders it at `/api/artefacts/<id>/`
  with exactly the pipeline used for the docs.
- **Publish** writes `index.md`, `assets/` and the optional project package to
  `DOCS_PATH/LODEON_STORY_DIR/<slug>/` (replacing an earlier version atomically);
  the story then appears at `/story/<slug>/` and in the navigation.

Publishing writes into the site, so it needs `LODEON_EDITOR_TOKEN`: authors log in
with that token in the editor, after which Preview and Publish are available for
the browser session. Without a token the editor and Preview are open to everyone
and Publish is disabled. Embed metadata is only fetched for
`nodes.embed.allowedOrigins` (set with `LODEON_CONFIG_PATH`). The visual query
builder is offered for profiles with a `sparnatural` (SHACL, Turtle) file.

The editor's API, next to `/api/sparql/<profile>` and `/api/explorer/<profile>/expand`:
`GET /api/config`, `GET /api/auth/status`, `POST /api/auth/login|logout`,
`GET /api/welcome-story`, `GET /api/knowledge-graphs/<profile>/sparnatural`,
`POST /api/embed/metadata`, `POST /api/preview`, `GET|DELETE /api/artefacts/<id>`
and `POST /api/publish`.

## Development

```shell
uv sync                         # includes the dev group (pytest, ruff)
uv run pytest                   # run the tests
uv run ruff check src tests     # lint
uv run ruff format src tests    # format
uv build                        # build sdist and wheel into dist/
```

The built story editor is part of the package (`src/shmarql/lodeon_editor/`), so
Node.js is only needed to change it:

```shell
cd editor
npm ci
npm test                        # vitest
npm run quality                 # eslint, prettier, tsc
npm run build                   # -> ../src/shmarql/lodeon_editor/
npm run build:shmarql-verovio   # -> ../src/shmarql/static/lodeon/verovio/ (story runtime)
npm run dev                     # Vite on :5173/lodeon/, API proxied to shmarql on :8000
```

The tests run the whole application against an in-process SPARQL endpoint backed
by rdflib (`tests/fake_endpoint.py`), so every generated SPARQL query is actually
executed. No network access is needed.

### Layout

```
src/shmarql/
  config.py            settings from environment / .env
  profiles.py          profile YAML loading, hash keys, default profile
  sparql_client.py     async upstream SPARQL client (httpx)
  main.py              FastAPI app factory
  routes/sparql.py     /sparql, /sparql/{key}, /api/profiles
  routes/pages.py      /query, /entity and the docs catch-all
  routes/lodeon_api.py API used by the LODEON runtime on story pages
  routes/lodeon_editor.py API of the story editor (config, auth, preview, publish)
  docs_site.py         Markdown directory -> URLs and navigation
  markdown_render.py   Markdown rendering (docs + story fences)
  entity/              entity viewer ported from ldview
  lodeon/              LODEON story support (vendored node renderers + resources,
                       editor configuration, preview/publish, welcome story)
  lodeon_editor/       the built story editor, served at /lodeon/
  templates/, static/  Jinja2 templates, CSS/JS, CodeMirror, LODEON assets
tests/                 pytest suite and fixtures
editor/                source of the story editor (TypeScript, Vite, vitest tests)
docs/                  the documentation served at / (replace with your own)
```

## Credits

The entity viewer is a port of [ldview](https://codeberg.org/renevoorburg/ldview)
by René Voorburg; data story rendering and the story editor reuse code and assets
from [LODEON](https://gitlab.rlp.net/adwmainz/digicademy/lodeon/lodeon-core). See
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## License

MIT, see [LICENSE](LICENSE).
