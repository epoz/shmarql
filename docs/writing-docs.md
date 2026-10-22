# Writing documentation

Every `*.md` file below `DOCS_PATH` becomes a page:

| File | URL |
|---|---|
| `index.md` | `/` |
| `guide.md` | `/guide` |
| `guide/index.md` | `/guide/` |

Links to other Markdown files (`[setup](guide/setup.md)`) are rewritten to these
URLs, and other files (images, downloads) are served as they are. The page title
comes from a `title:` in the YAML front matter or from the first `# Heading`.

The usual extensions are available: tables, footnotes, definition lists,
`attr_list`, `md_in_html`, syntax highlighting, task lists and the
`pymdownx.blocks` admonitions, details and tabs:

/// note | A note
Admonitions use the `///` block syntax.
///

/// tab | First
Tab one.
///

/// tab | Second
Tab two.
///
