from fasthtml.common import *
from .config import SCHEME, DOMAIN, PORT
from .external import do_query

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


@rt("/fragments/sparql")
def post(query: str):
    if query == "":
        query = "select * where {?s ?p ?o} limit 10"
    results = do_query(query)
    if "error" in results:
        return Div(
            f"This query did not work: {results['error']}",
            style="max-height: 30vh; overflow: auto;",
        )
    table_rows = []
    for row in results.get("results", {}).get("bindings", []):
        row_columns = []
        for key, value in row.items():
            if value.get("type") == "uri":
                row_columns.append(Td(A(value["value"], href=value["value"])))
            else:
                row_columns.append(Td(value["value"]))
        table_rows.append(Tr(*row_columns))
    return Table(*table_rows)


@rt("/sparql")
def get(query: str = "select distinct ?Concept where {[] a ?Concept} LIMIT 100"):
    svg_play_btn = """<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="currentColor" class="bi bi-play-btn" viewBox="0 0 16 16">
                <path d="M6.79 5.093A.5.5 0 0 0 6 5.5v5a.5.5 0 0 0 .79.407l3.5-2.5a.5.5 0 0 0 0-.814l-3.5-2.5z"/>
                <path d="M0 4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V4zm15 0a1 1 0 0 0-1-1H2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V4z"/>
                </svg>"""

    return (
        Head(
            Script(src="/static/editor.js"),
            Script(src="/static/matchbrackets.js"),
            Script(src="/static/sparql.js"),
            Script(src="/static/sparqlui.js"),
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
            style="display: flex; justify-content: center; align-items: center; height: 40vh; margin-top: 3rem",
        ),
        Div(id="results", style="margin: 2vw"),
    )


@rt("/sparql", methods=["POST"])
def post(query: str):
    return do_query(query)
