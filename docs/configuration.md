# Configuration

All configuration comes from environment variables, read at startup by
`src/shmarql/config.py`. A `.env` file in the working directory is loaded first
(point `SHMARQL_ENV_FILE` at another file if needed); real environment variables
take precedence. See `.env.example` for a template.

| Variable | Default | Meaning |
|---|---|---|
| `SITE_TITLE` | `SHMARQL` | Title in the header and page titles |
| `HOST` / `PORT` | `127.0.0.1` / `8000` | Bind address for `uv run shmarql` |
| `DEBUG` | `0` | Verbose logging |
| `PROFILES_PATH` | `profiles.yaml` | YAML file with the SPARQL [profiles](profiles.md) |
| `ENDPOINT` | – | Endpoint address of the profile served at `/sparql` (e.g. `https://query.wikidata.org/sparql`); overrides the YAML `default`, and becomes the default used for queries. When no profiles are configured, it adds a single new profile for that backend |
| `SITE_URI` | – | Public base URL of this application (e.g. `https://kg.example.org`); when set, a request path that matches no documentation page is resolved as an entity IRI (site URL + path) and served via content negotiation (HTML → entity page, RDF/JSON → serialized) |
| `SPARQL_TIMEOUT` | `30` | Upstream timeout in seconds (per-profile `timeout` overrides) |
| `SPARQL_USER_AGENT` | `shmarql/…` | User-Agent sent upstream |
| `CORS_ORIGINS` | – | Comma separated origins allowed to call the API (`*` for all) |
| `REDIS_HOST` | – | Redis instance used to cache SPARQL query results (e.g. the entity viewer's CONSTRUCT and inverse/label lookups); when empty, no caching backend is used |
| `CACHE_TTL` | `300` | Time to live of cached query results, in seconds |
| `DOCS_PATH` | `docs` | Directory with the Markdown documentation |
| `LODEON_CONFIG_PATH` | – | YAML overriding the LODEON renderer configuration |
| `LODEON_ASSETS_PATH` | – | Directory replacing the bundled LODEON browser assets |
| `LODEON_EDITOR_ENABLED` | `1` | Serve the [story editor](datastories.md#writing-stories-in-the-editor) at `/lodeon/` |
| `SECRET_KEY` | `shmarql-dev-secret` | Secret key used to sign the editor access tokens (JWTs, HS256) |
| `ACCESS_TOKEN_EXPIRE_DAYS` | `30` | Lifetime of an editor access token, in days |
| `USERS_DB_PATH` | `editor_users.sqlite` | SQLite database with the editor users (username, name, bcrypt password, activation date); when it holds editor users, the site login is enabled and pages redirect to `/login` when not logged in |
| `LODEON_EDITOR_SESSION_TTL` | `28800` | Lifetime of an editor login, in seconds |
| `LODEON_STORY_DIR` | `story` | Folder below `DOCS_PATH` that published stories are written to |
| `LODEON_PREVIEW_PATH` | temp dir | Where editor previews are kept |
| `LODEON_PREVIEW_TTL` | `3600` | Seconds after which a preview is removed |
| `LODEON_MAX_UPLOAD_MB` | `100` | Maximum size of a Preview/Publish upload |
| `DEFAULT_LANGUAGE` | `en` | Fallback UI / label language |
| `SUPPORTED_LANGUAGES` | `en,nl` | Languages negotiated from `Accept-Language` |
