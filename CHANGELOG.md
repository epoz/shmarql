# 2025-10-27

## Changed

- Use the `lenient=true` flag for Oxigraph bulk_load calls when loading data from DATA_LOAD_PATHS

- Also allow loading of .trig files for named graphs

- Use prefixes declared in SPARQL queries in the result display pages

# 2025-10-21

## Added

- User management via an 'admin' account, which is created and set to a random password shown in console when server is started with an empty admin database first time.

# 2025-10-17

## Added

The config option ADMIN_DATABASE specifies a path to a sqlite database used for access management and general admin.
A new module `am.py` to handle access management and admin

# 2025-10-10

## Changed

### Major

- Remove the default mkdocs rendering of query and info pages, and switch to using MonsterUI.
  Still possible to make mkdocs(-material) sites using shmarql, but the default markdown rendering is now done with mistletoe.

## Removed

The WATCH_DOCS config option is superflous and removed

# 2025-06-26

## Added

- Add Mermaid charts support for docs to default mkdocs.yml

# 2025-06-04

## Changed

- Better support for `{MOUNT}sparql` endpoints to handle HTTP OPTIONS methods.
  These are done by third-party services that would like to call the SPARQL endpoint without actually executing a query, to check CORS support.

- Install Fizzysearch and Bikidata libraries from the Github repos while development is in flux, in stead of from PyPI. This will be reverted later to published packages once the interface settles down a bit more.

# 2025-05-14

## Added

- Map chart type added

- Support for BIKIDATA_DB, this allows fulltext and semantic search via the BIKIDATA DuckDb.

## Deprecated

- FTS_FILEPATH is deprecated. This is replaced by the BIKIDATA_DB path

- RDF2VEC_FILEPATH is deprecated. This is now replaced by the RDF2VEC boolean flag, and also requires the BIKIDATA_DB path to also be set.

# 2025-04-28

## Added

- Add a @papp to shmarfql namespace which comes from the prepend_route decorator in the ./src/ext.py file. This can be used to add new routes to apps which import shmarql as a module buit adds new functionality not present in the core shmarql app. This is useful for creating custom shmarql instances.

# 2025-04-24

## Added

- Add fabio, swirl and dcat default prefixes
- Add mkdocs-nfdi4culture to the installed packages in requirements.txt
- Show schema:logo, schema:image and schema:description as special cases in Resource view. Also take the http vs https problematics of schema.org into account
- Treat .owl path specified in DATA_LOAD_PATHS loaded as application/rdf+xml
- A new boolean config item WATCH_DOCS. When set to true, it monitors the ./docs directory for changes and rebuilds the documentation when a change is detected. This is useful for local development, but by default should be set to false in production environments.
- Plotly for charts integrated, driven by the comments in the SPARQL queries.
- Startup screen is now simpler, showing some statistics about the attached triplestore data. (and old docs moved to separate repo)

## Removed

- Remove the debug output of rewritten query on each execution
- The old documentation explaining what SHMARQL is and its configuration has been removed from the repository. It is now hosted in a separate repository at https://github.com/epoz/shmarql_site
- Disable the bikidata support for now, until the Fizzysearch port is completely done.

## Changed

- Make field links in Resource view internal links to another Resource view
- For fields with more than 50 data values in resource view, only show the first 50, and add button to show all.
- Increase the timeout to 180s when downloading data using DATA_LOAD_PATHS config, and also allow loading .nt.gz suffixed paths

# 2025-03-24

## Added

- Start using [scriv](https://scriv.readthedocs.io/) for changelog.

# 2024-05-15

## Changed

- bugfix for the XML serializations when queries are "application/sparql-results+xml"
- pin scipy==1.10.1 version due to deprecated methods in newer versions causing problems
- allow loading datafiles (.nt.gz and .ttl.gz) from DATA_LOAD_PATHS that are gzipped
- add locking to the FTS index creation
