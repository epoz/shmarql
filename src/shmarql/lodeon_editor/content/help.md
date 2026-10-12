# Help

The story editor is LODEON's visual authoring environment, built into SHMARQL.
It combines graph queries, notes, visualizations, media, and publication
workflows in one local-first workspace. Finished stories are published as
pages of this site.

## Projects

Use the top bar to manage local browser projects and the active graph context.

- **Knowledge graph selector** selects the SPARQL profile used by newly
  inserted graph-backed nodes.
- **Data story selector** switches between projects stored in this browser.
- **New** creates a new local project.
- **Import** loads a `.lodeon.zip` project package.
- **Export** downloads a `.lodeon.zip` package containing the editable project,
  generated Markdown, and local assets.
- **Delete** removes the current local browser project.
- **Save status** shows autosave state. Click the disk icon to trigger a manual
  save; autosave remains active.

Projects are autosaved in the browser. Export regularly when you want a
portable backup, want to move work to another machine, or want to share a
project.

## Metadata

The left metadata panel contains publication-oriented project information and
asset overview tools.

- The slug defines the public story folder when publishing.
- Structured authors can include name, role, affiliation, and identifiers such
  as ORCID URLs.
- Persistent identifiers can be recorded for published stories.
- Description, keywords, language, and license can be rendered as front matter,
  HTML metadata, Open Graph metadata, and schema.org JSON-LD according to the
  active renderer configuration.
- **Publish Story ZIP** creates a downloadable project ZIP beside the published
  story when publishing.
- The published story card shows the latest published URL and, if available,
  the published project ZIP.
- The local asset overview lists browser-local media assets used by the
  project.

Use the **Story Metadata** Special Node when selected metadata should also
appear visibly inside the rendered story body.

## Writing And Editing

Write notes, interpretations, and narrative text directly in the editor. The
toolbar supports headings, inline formatting, links, lists, block quotes, code
blocks, horizontal rules, images by URL, tables, undo/redo, and editor zoom.

Configured rich-text formats appear as editor controls. They can add semantic
block or inline styles that are stored in the project and rendered through the
active renderer engine.

## Special Blocks

Use **Special Blocks** for renderer-specific layout structures around editable
content. Examples can include tiles, details blocks, callouts, or other
configured containers.

Special Blocks are configured by the deployment. They can be moved, collapsed,
copied, hidden from rendered output, or deleted through the block header
controls.

## Special Nodes

Use **Special Nodes** for functional content blocks such as graph queries,
visualizations, media, embeds, IIIF viewers, and visible story metadata.

Most Special Nodes support shared header controls:

- drag handle for reordering
- collapse/expand
- move up/down
- copy
- hide from rendered output
- delete

Hidden nodes remain in the editable project, but are skipped in Markdown,
Preview, and Publish output.

## Knowledge Graph Query Nodes

SPARQL and visual query nodes execute read-only graph queries through the
selected SPARQL profile of this site. Queries are sent unchanged through the
SHMARQL SPARQL proxy; SPARQL Update requests are refused.

The visual query builder is available for profiles that have a Sparnatural
configuration (the `sparnatural` setting of the profile).

Result tables in Special Nodes support paging, page-size selection, filtering,
and CSV download where available.

## Graph Explorer

Use **Graph Explorer** to explore a knowledge graph neighborhood from direct
resource IRIs, blank node labels, or SPARQL results. SPARQL mode expects a
query result with a resource variable, plus optional label data.

Graph Explorer nodes store the KG profile that was active when the node was
inserted. The viewer can expand outgoing, incoming, or bidirectional
neighborhoods through the explorer API of this site, supports zoom, pan, fullscreen,
predicate labels, blank-node inclusion, and sticky dragged node positions.
Configured color schemes keep resource, blank-node, and literal colors stable
while allowing profile-specific type or predicate colors.
Hover a graph node to inspect its label, resource, type, and configured
profile-specific metadata without interrupting click-to-expand.

Preview and Publish render the same interactive D3 viewer.

Blank nodes can be expanded when they were returned by the active endpoint.
They remain exploration anchors, not persistent identifiers for citation.

## Plotly And RAWGraphs

Use **Plotly Visualization** to create charts from SPARQL results, pasted CSV or
TSV, or CORS-readable CSV/TSV URLs. Plotly nodes expose editable JSON for data,
layout, and config. Changes in the JSON editor update the visualization.

Use **RAWGraphs Visualization** when you already designed a chart in RAWGraphs.
Paste or upload a `.rawgraphs` project JSON file, render it in LODEON, and the
stored SVG is embedded in Preview and Publish output.

## Media Assets

Use **Media Asset** for local files that should travel with the project package.
Media asset nodes support images, video, and audio.

Local assets are stored as browser-local asset blobs and exported under
`assets/` in `.lodeon.zip` packages. They are not stored as Base64 inside the
ProseMirror document.

Metadata fields for local assets can be edited in grouped tabs. Extended
metadata is rendered only when enabled in the node settings.

## Remote Embeds

Use **Embed Remote Content** for controlled external iframe content.

Embed nodes support:

- direct URL mode with one or multiple URLs
- SPARQL result mode where the query returns embed URLs
- single-view or gallery display
- horizontal or vertical selector strips
- caption, height, sandbox, allow, referrer policy, and loading settings

Only configured origins are allowed. If an embed URL is not allowed, LODEON
shows a warning instead of rendering the iframe.

## IIIF Objects

Use **IIIF Object** to display external IIIF Image API `info.json` resources or
IIIF Presentation manifests.

IIIF nodes support:

- direct URL mode with one or multiple IIIF URLs
- SPARQL result mode where the query returns IIIF URLs
- OpenSeadragon viewing in the editor, Preview, and Publish
- single-view or sequence display
- horizontal or vertical reference strips
- optional metadata and rights display where available

IIIF resources remain external references. LODEON does not store remote IIIF
images or manifests inside the project package.

## Preview And Publish

Use **Preview** to render the current project exactly as it will appear on this
site, without publishing it. Preview is useful for checking final layout,
queries, visualizations, media, embeds, IIIF viewers, metadata, and theme
rendering. Previews are temporary and removed after a while.

Use **Publish** when the work is ready. Publishing writes the generated
Markdown, local assets, and the optional project ZIP into the story folder of
the site documentation. The story is then available at `/story/<slug>/` and
listed in the site navigation. Publishing again replaces the earlier version.

Publishing requires a login.

## Login And Authentication

When the site operator has configured an access token, use **Login** in the
top bar and enter it; Preview and Publish are then available for the rest of
the browser session. Without a configured token, Preview is available to
everyone and Publish is disabled.

## Day And Night Theme

Use the theme button in the top bar to switch between Day and Night mode. The
choice is remembered in the browser.

## Local-First Storage

The editor stores drafts locally in the browser. The browser project is the
active working copy; the server is used for previews, publishing, and read-only
SPARQL execution.

Because browser storage is local to the browser profile, use **Export** when
you need a portable backup or want to continue work elsewhere.
