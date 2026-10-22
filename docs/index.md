---
title: SHMARQL
---
# SHMARQL

Welcome! This site is rendered from the Markdown files in the `docs/` directory
(configurable with `DOCS_PATH`). Replace these pages with your own documentation.

What you can do here:

- **[Query](/query)** any of the configured SPARQL profiles with a CodeMirror editor.
- **[Look up an entity](/entity)** and see it as a readable table, including blank nodes and
  inverse relations.
- Use **`/sparql`** (default profile) or **`/sparql/<key>`** as standard SPARQL endpoints.
- Publish **[data stories](story/example/index.md)** written with LODEON, or write them
  in the **[story editor](/lodeon/)**.

Read more:

- [Configuration](configuration.md)
- [SPARQL profiles](profiles.md)
- [Writing documentation](writing-docs.md)
- [Data stories](datastories.md)

Try a query — the ▶ link on SPARQL code blocks opens it in the editor:

```sparql
SELECT ?item ?itemLabel WHERE {
  ?item wdt:P31 wd:Q146 .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
LIMIT 10
```
