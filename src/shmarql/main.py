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

    svg_play_btn = """<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="currentColor" class="bi bi-play-btn" viewBox="0 0 16 16">
                <path d="M6.79 5.093A.5.5 0 0 0 6 5.5v5a.5.5 0 0 0 .79.407l3.5-2.5a.5.5 0 0 0 0-.814l-3.5-2.5z"/>
                <path d="M0 4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V4zm15 0a1 1 0 0 0-1-1H2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V4z"/>
                </svg>"""

    return (
        Script(src=f"{MOUNT}shmarql/static/editor.js"),
        Script(src=f"{MOUNT}shmarql/static/matchbrackets.js"),
        Script(src=f"{MOUNT}shmarql/static/sparql.js"),
        Script(
            """document.addEventListener("DOMContentLoaded", function () {
  sparqleditor = CodeMirror.fromTextArea(document.getElementById("code"), {
    mode: "application/sparql-query",
    matchBrackets: true,
    lineNumbers: true,
  });
  results = document.getElementById("results");
});

function updateProgress() {
    let progress = Math.round((Date.now() - queryStarted) / 1000);
    results.innerHTML = `<div aria-busy="true">Query in progress, took ${progress}s so far...</div>`;
    progress_counter = setTimeout(updateProgress, 1000);
}

document.body.addEventListener("htmx:afterRequest", function (evt) {
    if(progress_counter) {
        clearTimeout(progress_counter);
    }    
});

document.body.addEventListener("htmx:configRequest", function (evt) {
  if (evt.shiftKey) {
        console.log("Shift key was pressed during the click!");
  }

  if (evt.detail.elt.id === "execute_sparql") {
    let the_query = sparqleditor.doc.getValue();
    evt.detail.parameters["query"] = the_query;
    results.innerHTML = '<div aria-busy="true">Loading...</div>';
    history.pushState({ query: the_query }, "", "shmarql?query=" + encodeURIComponent(the_query));
    queryStarted = Date.now();
    progress_counter = setTimeout(updateProgress, 1000);    
  }
});

document.body.addEventListener("keypress", function (evt) {
    if (evt.ctrlKey && evt.key === "Enter") {
        evt.preventDefault();
        htmx.trigger(document.getElementById("execute_sparql"), "click");
    }
});


"""
        ),
        Link(
            rel="stylesheet",
            type="text/css",
            href=f"{MOUNT}shmarql/static/codemirror.css",
        ),
        Title("SHMARQL - SPARQL"),
        Div(
            Header(
                Img(
                    src=f"{MOUNT}shmarql/static/sqrl.png",
                    cls="h-20 border-t-2 border-t-black",
                ),
                cls="mt-5",
            ),
            Div(
                Button(
                    NotStr(svg_play_btn),
                    id="execute_sparql",
                    title="Execute this query, (also use Ctrl+Enter)",
                    hx_post=f"{MOUNT}shmarql/fragments/sparql",
                    hx_target="#results",
                    hx_swap="innerHTML",
                    cls=f"{BTN_STYLE} items-center",
                ),
                Button(
                    "Prefixes",
                    Script(
                        f"""
me().on("click", async ev => {{

    let editorContent = sparqleditor.doc.getValue();
    let prefixContent = `{PREFIXES_SNIPPET}`;
    sparqleditor.doc.setValue(prefixContent + editorContent);

}})
"""
                    ),
                    id="prefixes",
                    cls=BTN_STYLE,
                ),
                id="editor_toolbar",
                cls="flex flex-row px-4 py-2 gap-1 text-xs mb-3 mt-3",
            ),
            Div(
                Textarea(query, id="code", name="code"),
            ),
            cls="px-2",
        ),
        Div(results, id="results", cls="m-2"),
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
