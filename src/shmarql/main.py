import logging, csv, io, string, json
from urllib.parse import quote
from fasthtml.common import *
import pyoxigraph as px
from .px_util import OxigraphSerialization
from .config import PREFIXES_SNIPPET, MOUNT
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


def make_spo(uri: str, spo: str, encode=True, limit=999):
    uri = f"<{uri}>"
    tp = dict([(c, f"?{c}") for c in "spo"])
    if spo not in ("s", "p", "o"):
        return f"select ?s ?p ?o where {{ ?s ?p ?o }} limit {limit}"
    vars = tp.copy()
    vars[spo] = ""
    tp[spo] = uri
    vars = " ".join([vars[c] for c in "spo"])
    tp = " ".join([tp[c] for c in "spo"])
    Q = f"select {vars} where {{ {tp} }} limit {limit}"
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


@app.post(f"{MOUNT}shmarql/fragments/sparql")
def fragments_sparql(query: str):
    if query == "":
        query = "select * where {?s ?p ?o} limit 10"
    results = do_query(query)
    if "error" in results:
        return (
            Div(
                "This query did not work.",
                A(
                    "Click here to see the details of error message",
                    href="#",
                    onclick="document.getElementById('error').style.display = 'block';",
                ),
                Div(results["error"], id="error", style="display:none"),
                style="max-height: 30vh; overflow: auto;",
            ),
        )
    table_rows = []
    heads = [Th(" ")]
    heads.extend(
        [
            Th(var, style="font-weight: bold")
            for var in results.get("head", {}).get("vars", [])
        ]
    )
    table_rows.append(Tr(*heads))

    rownum = 0
    for row in results.get("results", {}).get("bindings", []):
        rownum += 1
        row_columns = []
        row_columns.append(
            Td(
                rownum,
                style="padding-right: 0.75ch; font-size: 75%; color: #aaa; text-align: right;",
            )
        )
        for var in results.get("head", {}).get("vars", []):
            value = row.get(var, {"value": ""})
            if value.get("type") == "uri":
                S_query = make_spo(value["value"], "s")
                P_query = make_spo(value["value"], "p")
                O_query = make_spo(value["value"], "o")

                # do some fizzy for factgrid
                if value["value"].find("database.factgrid.de") > -1:
                    fizzy_query = quote(
                        f"""select distinct ?s (STR(?o) AS ?oLabel) where {{
  ?s fizzy:rdf2vec <{value['value']}> . 
  ?s rdfs:label ?o .
}}
    """
                    )
                    fizzyquery = A(
                        "✨",
                        href="/sparql?query=" + fizzy_query,
                        title="Show items similar to this entity using fizzysearch",
                    )
                else:
                    fizzyquery = None

                row_columns.append(
                    Td(
                        A(
                            "S",
                            href=f"{MOUNT}shmarql?query={S_query}",
                            style="font-size: 80%; background-color: #ddd; color: #000; padding: 3px; text-decoration: none; margin: 0",
                        ),
                        A(
                            "P",
                            href=f"{MOUNT}shmarql?query={P_query}",
                            style="font-size: 80%; background-color: #ddd; color: #000; padding: 3px; text-decoration: none; margin: 0",
                        ),
                        A(
                            "O",
                            href=f"{MOUNT}shmarql?query={O_query}",
                            style="font-size: 80%; background-color: #ddd; color: #000; padding: 3px; text-decoration: none; margin: 0",
                        ),
                        A(
                            value["value"],
                            href=value["value"],
                            style="margin-left: 1ch",
                        ),
                        fizzyquery,
                        cls="border border-gray-300 px-4 py-2 text-sm",
                    )
                )
            else:
                o_link = A(
                    "O",
                    href=f"{MOUNT}shmarql?query={make_literal_query(value)}",
                    style="font-size: 80%; background-color: #ddd; color: #000; padding: 3px; text-decoration: none; margin: 0",
                )
                lang = (
                    Span(
                        value.get("xml:lang"), cls="text-xs bg-gray-200 text-black px-2"
                    )
                    if "xml:lang" in value
                    else None
                )

                row_columns.append(
                    Td(
                        o_link,
                        Span(value["value"], style="margin-left: 1ch"),
                        lang,
                        cls="border border-gray-300 px-4 py-2 text-sm",
                    )
                )
        table_rows.append(Tr(*row_columns, cls="hover:bg-gray-50"))
    cached = " (from cache) " if results.get("cached") else ""

    duration_display = (
        f"{int(results.get('duration', 0) * 1000)}ms"
        if results.get("duration", 0) < 1
        else f"{results.get('duration', 0):.3f}s"
    )

    return Div(
        Div(
            Span(
                f"{len(results['results']['bindings'])} results in {duration_display}{cached}",
                title="used: " + results.get("endpoint_name", ""),
            ),
            A(
                "CSV",
                title="Download as CSV",
                href=f"{MOUNT}shmarql?query={quote(query)}&format=csv",
                cls=BTN_STYLE,
            ),
            A(
                "JSON",
                title="Download as JSON",
                href=f"{MOUNT}shmarql?query={quote(query)}&format=json",
                cls=BTN_STYLE,
            ),
            cls="bg-slate-200 text-black p-2 flex flex-row gap-1 text-xs",
        ),
        Table(
            *table_rows,
            cls="min-w-full table-auto border-collapse border border-gray-300",
        ),
    )


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


@app.get(f"{MOUNT}shmarql")
def shmarql_get(
    request: Request,
    query: str = "select * where {?s ?p ?o} limit 10",
    format: str = "html",
):
    accept_header = request.headers.get("accept")
    accept_headers_incoming = []
    if accept_header:
        accept_headers_incoming = [ah.strip() for ah in accept_header.split(",")]
    accept_headers = {}
    for ah in accept_headers_incoming:
        ql = ah.split(";")
        if len(ql) > 1:
            ah_left = ql[0]
            ql = ql[1].split("=")
            if len(ql) > 1 and ql[0] == "q":
                try:
                    ql = float(ql[1])
                except ValueError:
                    ql = 0
        else:
            ah_left = ql[0]
            ql = 1
        accept_headers[ah_left] = ql

    for ah, _ in sorted(accept_headers.items(), key=lambda x: x[1]):
        if ah.startswith("application/sparql-results+json"):
            format = "json"
            break
        if ah.startswith("text/turtle"):
            format = "turtle"
            break

    if format in ("csv", "json", "turtle"):
        results = do_query(query, format=format)

        if type(results) is bytes:
            if format == "turtle":
                return Response(
                    results,
                    headers={"Content-Type": "text/turtle"},
                )
            try:
                # if format is not turtle, but the results are bytes, try to parse it and return as json
                tmp_store = px.Store()
                tmp_store.bulk_load(results, "text/turtle")
                r = tmp_store.query("select * where {?s ?p ?o}")
                results = {"results": {"bindings": OxigraphSerialization(r).json()}}
            except Exception as e:
                results = {
                    "error": f"{e} Query returned non-parsable data: {repr(results[:500])}"
                }

        if format == "csv":
            csv_data = json_results_to_csv(results)

            return Response(
                csv_data,
                headers={
                    "Content-Type": "text/csv",
                    "Content-Disposition": f"attachment; filename={hash_query(query)}.csv",
                },
            )
        if format == "json":
            if "endpoint" in results:
                del results["endpoint"]
            return Response(
                json.dumps(results, indent=2),
                headers={
                    "Content-Type": "application/sparql-results+json",
                },
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
def sparql_get(request: Request, query: str = "select * where {?s ?p ?o} limit 10"):
    return shmarql_get(request, query)


from .ext import *


@app.get(MOUNT + "{fname:path}")
def getter(fname: str):
    if fname == "" or fname.endswith("/"):
        fname += "index.html"
    return FileResponse(f"site/{fname}")
