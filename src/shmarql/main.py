import sqlite3, logging, csv, io, string, json

from urllib.parse import quote
from fasthtml.common import *
from .config import SCHEME, DOMAIN, PORT, DEBUG
from .external import do_query, hash_query

if DEBUG:
    logging.basicConfig(
        level=logging.DEBUG,
        format="%(asctime)s %(levelname)-8s %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    logging.debug("Debug logging requested from config env DEBUG")
else:
    logging.basicConfig(
        format="%(asctime)s %(levelname)-8s %(message)s", datefmt="%Y-%m-%d %H:%M:%S"
    )


app, rt = fast_app()


def page(*content, extra_style=[], extra_head=[], title="SHMARQL"):
    page = Html(
        Head(
            Title(title),
            picolink,
            *extra_head,
            *extra_style,
        ),
        Body(
            Main(
                content,
            )
        ),
    )
    return page


@rt("/static/{fname:path}")
def get(fname: str):
    return FileResponse(f"static/{fname}")


@rt("/")
def get():
    return (
        Title("Welcome to SHMARQL"),
        H1("Welcome to SHMARQL", style="margin-top: 5rem; text-align: center;"),
        A("Query", href="/sparql"),
    )


@rt("/shmarql")
def get(s: str): ...


def make_literal_query(some_literal: dict, encode=True, limit=999):
    txt = some_literal["value"]
    txt = txt.translate(str.maketrans("", "", string.punctuation))
    txt = txt.split(" ")[:5]
    txt = " ".join(txt)

    Q = f"""select ?s ?p where {{ ?s fizzy:fts "{txt}" }} limit {limit}"""
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


@app.post("/fragments/sparql")
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
                style="margin: 0; padding: 0; font-size: 75%; color: #aaa;",
            )
        )
        for var in results.get("head", {}).get("vars", []):
            value = row.get(var, {"value": ""})
            if value.get("type") == "uri":
                S_query = make_spo(value["value"], "s")
                P_query = make_spo(value["value"], "p")
                O_query = make_spo(value["value"], "o")
                row_columns.append(
                    Td(
                        A(
                            "S",
                            href=f"/sparql?query={S_query}",
                            style="font-size: 80%; background-color: #999; color: #000; padding: 2px; margin: 0",
                        ),
                        A(
                            "P",
                            href=f"/sparql?query={P_query}",
                            style="font-size: 80%; background-color: #999; color: #000; padding: 2px; margin: 0",
                        ),
                        A(
                            "O",
                            href=f"/sparql?query={O_query}",
                            style="font-size: 80%; background-color: #999; color: #000; padding: 2px; margin: 0",
                        ),
                        A(
                            value["value"],
                            href=value["value"],
                            style="margin-left: 1ch",
                        ),
                    )
                )
            else:
                o_link = A(
                    "O",
                    href=f"/sparql?query={make_literal_query(value)}",
                    style="font-size: 80%; background-color: #999; color: #000; padding: 2px; margin: 0",
                )
                row_columns.append(
                    Td(o_link, Span(value["value"], style="margin-left: 1ch"))
                )
        table_rows.append(Tr(*row_columns))
    cached = " (from cache) " if results.get("cached") else ""

    duration_display = (
        f"{int(results.get('duration', 0) * 1000)}ms"
        if results.get("duration", 0) < 1
        else f"{results.get('duration', 0):.3f}s"
    )

    return (
        Div(
            Span(
                f"{len(results['results']['bindings'])} results in {duration_display}{cached}",
                title="used: " + results.get("endpoint_name", ""),
            ),
            A(
                "CSV",
                title="Download as CSV",
                href=f"/sparql?query={quote(query)}&format=csv",
                style="margin-left: 2ch",
            ),
            A(
                "JSON",
                title="Download as JSON",
                href=f"/sparql?query={quote(query)}&format=json",
                style="margin-left: 2ch",
            ),
        ),
        Table(*table_rows),
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


@rt("/sparql")
def get(query: str = "select * where {?s ?p ?o} limit 10", format: str = "html"):
    if format in ("csv", "json"):
        results = do_query(query)

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
                    "Content-Type": "application/json",
                },
            )

    results = fragments_sparql(query)

    svg_play_btn = """<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="currentColor" class="bi bi-play-btn" viewBox="0 0 16 16">
                <path d="M6.79 5.093A.5.5 0 0 0 6 5.5v5a.5.5 0 0 0 .79.407l3.5-2.5a.5.5 0 0 0 0-.814l-3.5-2.5z"/>
                <path d="M0 4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V4zm15 0a1 1 0 0 0-1-1H2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V4z"/>
                </svg>"""

    return (
        Head(
            Script(src="/static/editor.js"),
            Script(src="/static/matchbrackets.js"),
            Script(src="/static/sparql.js"),
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
  if (evt.detail.elt.id === "execute_sparql") {
    let the_query = sparqleditor.doc.getValue();
    evt.detail.parameters["query"] = the_query;
    results.innerHTML = '<div aria-busy="true">Loading...</div>';
    history.pushState({ query: the_query }, "", "/sparql?query=" + encodeURIComponent(the_query));
    queryStarted = Date.now();
    progress_counter = setTimeout(updateProgress, 1000);    
  }
});
"""
            ),
            Link(
                rel="stylesheet",
                type="text/css",
                href="/static/codemirror.css",
            ),
        ),
        Title("SHMARQL - SPARQL"),
        Div(
            Div(
                Textarea(query, id="code", name="code"),
                A(
                    NotStr(svg_play_btn),
                    href="#",
                    id="execute_sparql",
                    title="Execute this query",
                    hx_post="/fragments/sparql",
                    hx_target="#results",
                    hx_swap="innerHTML",
                ),
                style=" margin: 0 auto; width: 90vw;",
            ),
            style="display: flex; justify-content: center; align-items: center; margin-top: 3rem",
        ),
        Div(results, id="results", style="margin: 2vh 2vw 0 2vw"),
    )


@rt("/sparql", methods=["POST"])
def post(query: str):
    return do_query(query)
