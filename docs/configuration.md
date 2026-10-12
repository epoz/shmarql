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
| `DEFAULT_PROFILE` | – | Profile (name or key) served at `/sparql`; overrides `default:` in the YAML |
| `SPARQL_TIMEOUT` | `30` | Upstream timeout in seconds (per-profile `timeout` overrides) |
| `SPARQL_USER_AGENT` | `shmarql/…` | User-Agent sent upstream |
| `CORS_ORIGINS` | – | Comma separated origins allowed to call the API (`*` for all) |
| `DOCS_PATH` | `docs` | Directory with the Markdown documentation |
| `LODEON_CONFIG_PATH` | – | YAML overriding the LODEON renderer configuration |
| `LODEON_ASSETS_PATH` | – | Directory replacing the bundled LODEON browser assets |
| `LODEON_EDITOR_ENABLED` | `1` | Serve the [story editor](datastories.md#writing-stories-in-the-editor) at `/lodeon/` |
| `LODEON_EDITOR_TOKEN` | – | Editor access token; needed to publish stories |
| `LODEON_EDITOR_SESSION_TTL` | `28800` | Lifetime of an editor login, in seconds |
| `LODEON_STORY_DIR` | `story` | Folder below `DOCS_PATH` that published stories are written to |
| `LODEON_PREVIEW_PATH` | temp dir | Where editor previews are kept |
| `LODEON_PREVIEW_TTL` | `3600` | Seconds after which a preview is removed |
| `LODEON_MAX_UPLOAD_MB` | `100` | Maximum size of a Preview/Publish upload |
| `DEFAULT_LANGUAGE` | `en` | Fallback UI / label language |
| `SUPPORTED_LANGUAGES` | `en,nl` | Languages negotiated from `Accept-Language` |
