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

## Admonitions

Admonitions follow the Material for MkDocs syntax: a block starts with `!!!`,
followed by a single keyword used as a type qualifier, with the content of the
block on the next line, indented by four spaces:

```markdown
!!! note
    This is a note.
```

The title defaults to the type qualifier in titlecase (`Note` here), and can be
changed by adding a quoted string after the type qualifier. The quoted string
may contain any Markdown, including links and formatting:

```markdown
!!! abstract "Custom Title"
    Content here.
```

Adding an empty string directly after the type qualifier omits the title
(`!!! warning ""` here), which notably does not work for collapsible blocks.

Admonitions can be nested by indenting the admonition blocks of the desired ones.

Collapsible admonitions start with `???` instead of `!!!`, and render as an
expandable block with a small toggle; adding a `+` after the `???` token renders
the block expanded:

```markdown
??? tip
    Collapsible tip.

???+ danger
    Expanded danger.
```

Admonitions can also be rendered as inline blocks (e.g. for sidebars) by adding
the `inline` modifier, or `inline end` to place one to the right.

The supported type qualifiers are `note`, `abstract`, `info`, `tip`, `success`,
`question`, `warning`, `failure`, `danger`, `bug` and `quote`; unknown type
qualifiers fall back to the default type, `note`.
