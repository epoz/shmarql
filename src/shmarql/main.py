import logging, csv, io, string, json, os
from urllib.parse import quote
from fasthtml.common import *
import pyoxigraph as px
from .px_util import OxigraphSerialization, results_to_xml
from .config import PREFIXES_SNIPPET, MOUNT, SPARQL_QUERY_UI, SCHPIEL_PATH, SITE_URI

from .qry import do_query, hash_query

app = FastHTML(
    pico=False,
    hdrs=(
        (
            Link(
                rel="stylesheet",
                type="text/css",
                href=f"{MOUNT}shmarql/static/shmarql.css",
            )
        ),
    ),
)


BTN_STYLE = "bg-slate-300 hover:bg-slate-400 text-black px-2 rounded-lg shadow-xl transition duration-300 font-bold"


@app.get("/favicon.ico")
def favicon():
    return FileResponse(f"static/favicon.ico")


@app.get(MOUNT + "shmarql/static/{fname:path}")
def shmarql_get_static(fname: str):
    return FileResponse(f"static/{fname}")


def make_literal_query(some_literal: dict, encode=True, limit=999):
    txt = some_literal["value"].replace("\n", " ")
    txt = txt.translate(str.maketrans("", "", string.punctuation))
    txt = [x for x in txt.split(" ") if len(x) > 1][:10]
    txt = " ".join(txt).strip(" ")

    Q = f"""select ?s ?p ?o where {{ 
        ?s ?p ?o .
        ?s fizzy:fts "{txt}" . }} limit {limit}"""
    if encode:
        return quote(Q)
    else:
        return Q


@app.post("/_/oOo")
def oinga():
    from mkdocs.__main__ import cli

    try:
        cli(["build", "--site-dir", "site"], standalone_mode=False)
    except Exception as e:
        return Div(str(e))


# See: https://www.chartjs.org/docs/latest/getting-started/integration.html
@app.get(f"{MOUNT}shmarql/fragments/chart")
def fragments_chart(query: str):
    return """
<div>
  <canvas id="myChart"></canvas>
</div>

<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

<script>
  const ctx = document.getElementById('myChart');

  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: [
    'Abstract, Non-representational Art',
    'Religion and Magic',
    'Nature',
    'Human Being, Man in General',
    'Society, Civilization, Culture',
    'Abstract Ideas and Concepts',
    'History',
    'Bible',
    'Literature',
    'Classical Mythology and Ancient History'
],
      datasets: [{
        label: "ICONCLASS",
        data: [13, 189234, 397281, 370052, 801637, 67315, 162090, 129660, 48452, 80144],
        borderWidth: 1
      }]
    }
  });
</script>
"""


from .fragments import *


def json_results_to_csv(results: dict):
    output = io.StringIO()
    writer = csv.writer(output)

    # Write header
    writer.writerow([var for var in results.get("head", {}).get("vars", [])])
    for row in results.get("results", {}).get("bindings", []):
        writer.writerow(
            [
                row.get(var, {"value": ""})["value"]
                for var in results.get("head", {}).get("vars", [])
            ]
        )
    return output.getvalue()


def accept_header_to_format(request: Request) -> str:
    accept_header = request.headers.get("accept")
    accept_headers_incoming = []
    if accept_header:
        accept_headers_incoming = [ah.strip() for ah in accept_header.split(",")]
    accept_headers = {}
    for ah in accept_headers_incoming:
        ql = ah.split(";")
        ql_val = 1
        if len(ql) > 1:
            ah_left = ql[0]
            ql = ql[1].split("=")
            if len(ql) > 1 and ql[0] == "q":
                try:
                    ql_val = float(ql[1])
                except ValueError:
                    ql_val = 0
        else:
            ah_left = ql[0]
            ql_val = 1
        accept_headers[ah_left] = ql_val

    for ah, _ in sorted(accept_headers.items(), reverse=True, key=lambda x: x[1]):
        if ah.startswith("application/sparql-results+json"):
            return "json"
        if ah.startswith("text/turtle"):
            return "turtle"
        if ah.startswith("application/sparql-results+xml"):
            return "xml"

    return "html"


@app.get(f"{MOUNT}shmarql")
def shmarql_get(
    request: Request,
    query: str = "select * where {?s ?p ?o} limit 10",
    format: str = "html",
):
    format = accept_header_to_format(request)
    if format in ("csv", "json", "turtle", "xml"):
        results = do_query(query)

        if "data" in results:
            if format == "turtle":
                return Response(
                    results["data"],
                    headers={
                        "Content-Type": "text/turtle",
                        "Access-Control-Allow-Origin": "*",
                    },
                )
            try:
                # if format is not turtle, but the results are bytes, try to parse it and return as json
                tmp_store = px.Store()
                tmp_store.bulk_load(results["data"], "text/turtle")
                r = tmp_store.query("select * where {?s ?p ?o}")
                results["results"] = {"bindings": OxigraphSerialization(r).json()}
            except Exception as e:
                results = {
                    "error": f"{e} Query returned non-parsable data: {repr(results)[:500]}"
                }

        if format == "xml":
            xml_data = results_to_xml(results)
            return Response(
                xml_data,
                headers={
                    "Content-Type": "application/sparql-results+xml",
                    "Content-Disposition": f"attachment; filename={hash_query(query)}.xml",
                    "Access-Control-Allow-Origin": "*",
                },
            )

        if format == "csv":
            csv_data = json_results_to_csv(results)

            return Response(
                csv_data,
                headers={
                    "Content-Type": "text/csv",
                    "Content-Disposition": f"attachment; filename={hash_query(query)}.csv",
                    "Access-Control-Allow-Origin": "*",
                },
            )
        if format == "json":
            if "endpoint" in results:
                del results["endpoint"]
            return Response(
                json.dumps(results, indent=2),
                headers={
                    "Content-Type": "application/sparql-results+json",
                    "Access-Control-Allow-Origin": "*",
                },
            )

    if not SPARQL_QUERY_UI:
        return Div(
            "There is currently no SPARQL query form to be found here, call it from a command line via a POST request."
        )

    results = fragments_sparql(query)

    h = open("site/_/index.html").read()
    h_txt = """
<script src="/shmarql/static/editor.js"></script>
<script src="/shmarql/static/matchbrackets.js"></script>
<script src="/shmarql/static/sparql.js"></script>
<script src="/shmarql/static/surreal-1.3.0.js"></script>
<script src="https://unpkg.com/tablesort@5.3.0/dist/tablesort.min.js"></script>

<button id="execute_sparql" title="Execute this query, (also use Ctrl+Enter)" class="md-button md-button--primary" style="padding: 4px 8px; font-size: 12px;">
&#9654;
<script>
me().on("click", async ev => {
  if (ev.shiftKey) {
    console.log("Shift key was pressed during the click!");
  }
  executeQuery()
})
</script>
</button>

<button id="prefixes" class="md-button md-button--primary" name="prefixes" style="padding: 4px 8px; font-size: 12px;">
Prefixes
      <script>
me().on("click", async ev => {

    let editorContent = sparqleditor.doc.getValue();
    let prefixContent = `PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX owl: <http://www.w3.org/2002/07/owl#>
PREFIX schema: <http://schema.org/>
PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wds: <http://www.wikidata.org/entity/statement/>
PREFIX wikibase: <http://wikiba.se/ontology#>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX dc: <http://purl.org/dc/elements/1.1/>
PREFIX dbr: <http://dbpedia.org/resource/>
PREFIX rico: <https://www.ica.org/standards/RiC/ontology#>
PREFIX geo: <http://www.w3.org/2003/01/geo/wgs84_pos#>
PREFIX sh: <http://www.w3.org/ns/shacl#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
PREFIX virtrdfdata: <http://www.openlinksw.com/virtrdf-data-formats#>
PREFIX virtrdf: <http://www.openlinksw.com/schemas/virtrdf#>
PREFIX shmarql: <https://shmarql.com/>
PREFIX cto: <https://nfdi4culture.de/ontology#>
PREFIX nfdi4culture: <https://nfdi4culture.de/id/>
PREFIX nfdicore: <https://nfdi.fiz-karlsruhe.de/ontology/>
PREFIX factgrid: <https://database.factgrid.de/entity/>

`;
sparqleditor.doc.setValue(prefixContent + editorContent);

})
</script>
</button>

<div>
    <textarea id="code" name="code">__THEQUERY__</textarea>
</div>

<div id="results" style="margin-top: 2vh; max-height: 50vh; overflow-y: scroll">__RESULTS__</div>

<script>
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/shmarql/static/codemirror.css";
  document.head.appendChild(link);


document.addEventListener("DOMContentLoaded", function () {
  sparqleditor = CodeMirror.fromTextArea(document.getElementById("code"), {
    mode: "application/sparql-query",
    matchBrackets: true,
    lineNumbers: true,
  });
  results = document.getElementById("results");
});

function executeQuery() {  
    let the_query = sparqleditor.doc.getValue();    
    results.innerHTML = '<div aria-busy="true">Loading...</div>';
    history.pushState({ query: the_query }, "", "boinga?query=" + encodeURIComponent(the_query));
    queryStarted = Date.now();
    progress_counter = setTimeout(updateProgress, 1000);
    fetch(`/shmarql/fragments/sparql`, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded"
        },
        body: `query=${encodeURIComponent(the_query)}`
    }).then(response => response.text()).then(data => {        
        if(progress_counter) {
            clearTimeout(progress_counter);
        }
        results.innerHTML = data;
        var tables = document.querySelectorAll("table[data-tipe='sparql-results']");
        tables.forEach(function(table) {            
                new Tablesort(table)            
        })        
    })

}

function updateProgress() {
    let progress = Math.round((Date.now() - queryStarted) / 1000);
    results.innerHTML = `<div aria-busy="true">Query in progress, took ${progress}s so far...</div>`;
    progress_counter = setTimeout(updateProgress, 1000);
}

document.body.addEventListener("keypress", function (evt) {
    if (evt.ctrlKey && evt.key === "Enter") {
        evt.preventDefault();
        executeQuery()
    }
});
</script>
"""
    results_html = to_xml(results)
    return (
        h.replace("BODY_PLACE_HOLDER", h_txt)
        .replace("__RESULTS__", results_html)
        .replace("__THEQUERY__", query)
    )


@app.get(f"{MOUNT}sparql", methods=["POST"])
def sparql_post(request: Request, query: str):
    return shmarql_get(request, query)


@app.get(f"{MOUNT}sparql")
def sparql_get(
    request: Request,
    query: str = "select distinct ?Concept where {[] a ?Concept} LIMIT 999",
):
    return shmarql_get(request, query)


# Why the strange position of this import statement?
# This means that it overrides the static page serving below, but not the main "built-in" functionalities
from .ext import *


def entity_check(iri: str):
    q = f"SELECT * WHERE {{ <{iri}> ?p ?o }}"
    res = do_query(q)
    return len(res.get("results", {}).get("bindings", [])) > 0


@app.get(MOUNT + "{fname:path}")
@app.get("/{fname:path}")
def getter(request: Request, fname: str):
    new_name = fname
    if fname.startswith("/"):
        new_name = fname[1:]
    if fname == "" or fname.endswith("/"):
        new_name += "index.html"

    if SCHPIEL_PATH:
        path_to_try = os.path.join(SCHPIEL_PATH, new_name)
        if os.path.exists(path_to_try):
            return FileResponse(path_to_try)

    path_to_try = os.path.join(os.getcwd(), "site", new_name)
    if os.path.exists(path_to_try):
        return FileResponse(path_to_try)

    iri = SITE_URI + fname
    if SITE_URI and entity_check(iri):
        format = accept_header_to_format(request)
        if format == "html":
            q = f"SELECT ?p ?o WHERE {{ <{iri}> ?p ?o }}"
        else:
            q = f"CONSTRUCT {{ <{iri}> ?p ?o }} WHERE {{ <{iri}> ?p ?o }}"

        return shmarql_get(
            request=request,
            query=q,
        )

    # The default 404 from FileResponse leaks the path, make it simpler:
    raise HTTPException(404, f"File not found {fname}")
