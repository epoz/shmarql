
# 2025-04-24

## Added

- Add fabio, swirl and dcat default prefixes

- Add mkdocs-nfdi4culture to the installed packages in requirements.txt

# 2025-04-24

## Removed

- Remove the debug output of rewritten query on each execution

- The old documentation explaining what SHMARQL is and its configuration has been removed from the repository. It is now hosted in a separate repository at https://github.com/epoz/shmarql_site

- Disable the bikidata support for now, until the Fizzysearch port is completely done.

## Added

- Show schema:logo, schema:image and schema:description as special cases in Resource view. Also take the http vs https problematics of schema.org into account

- Treat .owl path specified in DATA_LOAD_PATHS loaded as application/rdf+xml

- A new boolean config item WATCH_DOCS. When set to true, it monitors the ./docs directory for changes and rebuilds the documentation when a change is detected. This is useful for local development, but by default should be set to false in production environments.

- Plotly for charts integrated, driven by the comments in the SPARQL queries.

- Startup screen is now simpler, showing some statistics about the attached triplestore data. (and old docs moved to separate repo)

## Changed

- Make field links in Resource view internal links to another Resource view

- For fields with more than 50 data values in resource view, only show the first 50, and add button to show all.

- Increase the timeout to 180s when downloading data using DATA_LOAD_PATHS config, and also allow loading .nt.gz suffixed paths

# 2025-03-24

## Added

- Start using [scriv](https://scriv.readthedocs.io/) for changelog.
