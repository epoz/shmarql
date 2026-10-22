# Data stories

Data stories authored with [LODEON](https://gitlab.rlp.net/adwmainz/digicademy/lodeon/lodeon-core)
are Markdown files with YAML front matter and fenced *Special Nodes*. Drop the
exported (or published) `index.md`, plus its `assets/` folder, anywhere below
`DOCS_PATH`, for example `docs/story/<slug>/index.md`.

Supported:

- **Front matter** — `title`, and the `lodeon:` block whose `htmlMeta`, `openGraph`
  and `jsonLd` entries become `<meta>` tags and JSON-LD in the page head.
- **```` ```shmarql {title="…" kg="profile"} ````** — SPARQL results, run in the
  browser against the profile whose *name* (or key) equals `kg`. Without `kg`
  the default profile is used.
- **```` ```lodeon-visualization ````, `lodeon-rawgraphs`, `lodeon-iiif`** —
  hydrated in the browser by the LODEON runtime.
- **```` ```lodeon-embed ````, `lodeon-graph-explorer`, `lodeon-leaflet`,
  `lodeon-verovio`** — projected to HTML on the server with LODEON's own node
  renderers. Embeds are only shown for origins listed in
  `nodes.embed.allowedOrigins` of the file named by `LODEON_CONFIG_PATH`.
- **Media assets** referenced relative to the story.

So that `kg` attributes resolve, name your profiles after the LODEON knowledge
graph profile ids. See the [example story](story/example/index.md).

## Writing stories in the editor

The story editor at [/lodeon/](/lodeon/) is the authoring environment of LODEON,
without its AI Assistant. Write text, then add *Special Nodes* from the toolbar:
SPARQL queries, Plotly and RAWGraphs charts, Leaflet maps, Graph Explorer views,
IIIF objects, embeds, local images/audio/video, music notation and a story
metadata block. Queries run against the [profiles](profiles.md) of this site.

Projects are kept in your browser; **Export** downloads a `.lodeon.zip` package
that can be imported again here or in any LODEON instance. **Preview** shows the
story exactly as this site will render it. **Publish** writes it to
`DOCS_PATH/story/<slug>/`, where it appears in the navigation; publishing again
replaces the earlier version.

Publishing requires the site to set `LODEON_EDITOR_TOKEN`; log in with that token
using the **Login** button of the editor. See the [configuration](configuration.md).
