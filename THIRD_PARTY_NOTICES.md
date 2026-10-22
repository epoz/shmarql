# Third-Party Notices

SHMARQL is licensed under the MIT License. It includes code and assets from the
following projects, which remain governed by their own licenses.

| Component | Where | License |
| --- | --- | --- |
| [ldview](https://codeberg.org/renevoorburg/ldview) (René Voorburg) | `src/shmarql/entity/`, `templates/entity.html`, `static/css/entity.css`, `static/js/langtabs.js` (ported/adapted) | MIT |
| [LODEON core](https://gitlab.rlp.net/adwmainz/digicademy/lodeon/lodeon-core) (Torsten Schrade and LODEON contributors) | `editor/` (the LODEON editor, with the AI Assistant removed) and its build in `src/shmarql/lodeon_editor/`, `src/shmarql/lodeon/nodes/`, `lodeon/metadata.py`, `lodeon/resources/` (vendored), `static/lodeon/scripts`, `static/lodeon/styles`, `static/lodeon/verovio/lodeon-verovio.*`; ported from its API and renderer: `lodeon/editor_config.py`, `lodeon/publishing.py`, `lodeon/embed_metadata.py` | MIT |
| [SHMARQL](https://github.com/epoz/shmarql) | CodeMirror bundle and SPARQL mode in `static/codemirror/` | Unlicense |
| [CodeMirror 5](https://codemirror.net/5/) | `static/codemirror/` | MIT |
| [jQuery](https://jquery.com/) 3.7.1 | `static/lodeon/vendor/jquery/` | MIT |
| [DataTables](https://datatables.net/) | `static/lodeon/vendor/datatables/` | MIT |
| [Plotly.js](https://plotly.com/javascript/) 3.7.0 | `static/lodeon/vendor/plotly-3.7.0.min.js` | MIT |
| [D3](https://d3js.org/) 7.9.0 | `static/lodeon/vendor/d3-7.9.0.min.js` | ISC |
| [OpenSeadragon](https://openseadragon.github.io/) 6.0.2 | `static/lodeon/vendor/openseadragon-6.0.2.min.js` | BSD-3-Clause |
| [Leaflet](https://leafletjs.com/) and Leaflet.markercluster | `static/lodeon/vendor/leaflet/` | BSD-2-Clause / MIT |
| [Verovio](https://www.verovio.org/) | `static/lodeon/verovio/verovio*.js`, `index.js` | LGPL-3.0 |
| [SpessaSynth](https://github.com/spessasus/SpessaSynth) | `static/lodeon/verovio/spessasynth_processor.min.js` | Apache-2.0 |
| GeneralUser GS SoundFont | `static/lodeon/verovio/GeneralUserGS.sf3` | see `GeneralUserGS-LICENSE.txt` |

The LODEON browser assets are bundled unmodified so data stories render offline.
Set `LODEON_ASSETS_PATH` to use a different copy (e.g. from a LODEON checkout).

### The story editor (`editor/`, built into `src/shmarql/lodeon_editor/`)

The editor bundle includes these npm packages (see `editor/package.json` and
`editor/package-lock.json` for exact versions):

| License | Packages |
| --- | --- |
| MIT | Tiptap / ProseMirror, CodeMirror 6, Lezer, Handlebars, i18next, jQuery, Leaflet.markercluster, markdown-it and plugins, Plotly.js, sparqljs, zod, Node polyfills (buffer, events, process, stream-browserify, url, util, vm-browserify, querystring-es3) |
| MIT OR GPL-3.0-or-later | JSZip (used under MIT) |
| ISC | D3, Lucide, vanilla-jsoneditor, yaml, markdown-it-task-lists |
| Apache-2.0 | RAWGraphs core and charts, SpessaSynth |
| BSD-2-Clause / BSD-3-Clause | Leaflet / OpenSeadragon |
| LGPL-3.0 | [Sparnatural](https://sparnatural.eu/) (loaded as a separate chunk), [Verovio](https://www.verovio.org/) |

The LODEON branding in `editor/public/` belongs to the LODEON project.
