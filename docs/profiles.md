# SPARQL profiles

Backend triplestores are listed in the YAML file named by `PROFILES_PATH`. Each
entry is a *profile*:

```yaml
default: wikidata              # served at /sparql (name or key)
display: {}                    # global entity-viewer settings, optional
profiles:
  - name: wikidata             # used in the UI and in data stories (kg="wikidata")
    title: Wikidata
    description: The Wikidata Query Service
    endpoint: https://query.wikidata.org/sparql
    headers: {User-Agent: "my-site/1.0 (me@example.org)"}
    timeout: 20
    allow_update: false        # proxy SPARQL Update requests? (default: no)
    uri_prefixes:              # entity URIs that belong to this profile
      - http://www.wikidata.org/entity/
    display:                   # per-profile entity-viewer settings, optional
      show_inverse_relations: false
    sparnatural: shapes/wikidata.ttl  # story editor: visual query builder config, optional
    graph_explorer: {}         # story editor: Graph Explorer settings, optional
```

## Keys

Every profile is keyed by a hash of its endpoint address (the first 12 hex
characters of the SHA-256 of the URL). The key is stable as long as the address
doesn't change, does not reveal the upstream address, and is used in URLs:

- `/sparql/<key>` — SPARQL 1.1 protocol endpoint (GET and POST) proxied to the profile
- `/query?profile=<key>` — the query editor with that profile selected
- `/entity?uri=…&profile=<key>` — the entity viewer

List the keys with `uv run shmarql profiles` or `GET /api/profiles`.

## The default endpoint

`/sparql` proxies to the default profile: `DEFAULT_PROFILE` if set, otherwise the
`default:` entry of the YAML file, otherwise the first profile.

## Entity viewer settings

The `display` mappings accept the settings of
`src/shmarql/entity/settings.py` (ported from ldview), e.g. `namespaces`,
`label_predicates`, `description_predicates`, `image_predicates`,
`coordinate_paths`, `predicate_groups`, `construct_query`, `skolem_uri_pattern`,
`max_inverse_subjects`, `show_inverse_relations`, `fetch_images`.

## Story editor settings

The [story editor](datastories.md#writing-stories-in-the-editor) lists every
profile as a knowledge graph, identified by its `name`.

- `sparnatural` — a [Sparnatural](https://sparnatural.eu/) configuration (SHACL
  in Turtle), relative to the profiles file. It enables the *Visual Query Builder*
  of the editor's query nodes for this profile.
- `graph_explorer` — overrides for the editor's Graph Explorer node, using LODEON's
  setting names: `labelProperties`, `descriptionProperties`, `typeProperties`,
  `defaultDirection` (`outgoing`, `incoming`, `both`), `defaultDepth`, `maxDepth`,
  `maxNodes`, `maxEdgesPerNode`, `includeLiterals`, `includeBlankNodes`,
  `showPredicateLabels`, `showTypes`, `defaultColorScheme`, `colorSchemes`,
  `nodePopup`. Label and description properties default to the profile's `display`
  settings.
