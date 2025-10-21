import csv, io, string, json, os, yaml
from urllib.parse import quote
from fasthtml.common import *
import pyoxigraph as px
from .px_util import OxigraphSerialization, results_to_xml
from .config import (
    PREFIXES_SNIPPET,
    MOUNT,
    SPARQL_QUERY_UI,
    SITEDOCS_PATH,
    SCHPIEL_PATH,
    SITE_URI,
    log,
)
from plotly.offline._plotlyjs_version import __plotlyjs_version__ as plotlyjs_version
import asyncio
from typing import List, Callable, Dict, Any
from monsterui.all import Theme
from .layout import markdown_container, base

from .qry import do_query, hash_query
from .fragments import rt as fragments_rt
from .fragments import build_sparql_ui
from .am import ar as am_rt

hdrs = [
    Script(src=f"https://cdn.plot.ly/plotly-{plotlyjs_version}.min.js"),
]
hdrs.extend(Theme.blue.headers())


app = FastHTML(
    pico=False,
    hdrs=hdrs,
)

fragments_rt.to_app(app)
am_rt.to_app(app)


@app.on_event("startup")
async def startup_event():
    log.debug(f"App started up")


@app.get("/favicon.ico")
def favicon():
    return FileResponse(f"static/favicon.ico")


@app.get("/shmarql/static/{fname:path}")
@app.get(MOUNT + "shmarql/static/{fname:path}")
@app.get(MOUNT + "static/{fname:path}")
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


@app.options(f"{MOUNT}sparql")
def handle_options():
    headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
    }
    return Response(status_code=204, headers=headers)


@app.route(f"{MOUNT}sparql", methods=["GET", "POST"])
async def sparql(request: Request):
    if request.headers.get("content-type") == "application/sparql-query":
        query = await request.body()
        query = query.decode("utf-8")
    else:
        query = request.query_params.get("query")
    if not query or len(query.strip()) < 2:
        return RedirectResponse(f"{MOUNT}shmarql/", status_code=303)
    return shmarql_get(request, query)


@app.get(f"{MOUNT}shmarql")
def shmarql_redir():
    return RedirectResponse(f"{MOUNT}shmarql/", status_code=303)


@app.get(f"{MOUNT}shmarql/")
def shmarql_get(
    request: Request,
    session,
    query: str = "select * where {?s ?p ?o} limit 10",
    format: str = None,
):

    if format is None:
        format = accept_header_to_format(request)
    results = do_query(query)
    if format in ("csv", "json", "turtle", "xml"):
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

    return base(Div(build_sparql_ui(query, results), cls="mt-4"), session=session)


from .biki import *


def entity_check(iri: str):
    q = f"SELECT * WHERE {{ <{iri}> ?p ?o }}"
    res = do_query(q)
    return len(res.get("results", {}).get("bindings", [])) > 0


@app.get(MOUNT + "{fname:path}")
@app.get("/{fname:path}")
def getter(request: Request, session, fname: str):
    log.debug(f"Getter on {repr(fname)}")
    new_name = fname
    if fname.startswith("/"):
        new_name = fname[1:]
    if fname == "" or fname.endswith("/"):
        new_name += "index.html"

    if SCHPIEL_PATH:
        path_to_try = os.path.join(SCHPIEL_PATH, new_name)
        if os.path.exists(path_to_try):
            return FileResponse(path_to_try)

    if new_name == "index.html":
        new_name = "index.md"
    path_to_try = os.path.join(SITEDOCS_PATH, new_name)
    if MOUNT:
        path_to_try = os.path.join(SITEDOCS_PATH, new_name.replace(MOUNT[1:], "", 1))
    else:
        path_to_try = os.path.join(SITEDOCS_PATH, new_name)

    nav = []
    for nav_name in ("mkdocs.yml", "mkdocs.yaml"):
        nav_path = os.path.join(SITEDOCS_PATH, nav_name)
        if os.path.exists(nav_path):
            try:
                nav = yaml.safe_load(open(nav_path, "r")).get("nav", [])
            except Exception as e:
                log.warning(f"Could not parse {nav_path}: {e}")
            break

    log.debug(f"Trying {path_to_try}")
    if os.path.exists(path_to_try):
        return markdown_container(path_to_try, nav=nav, session=session)
    if os.path.exists(path_to_try + ".md"):
        return markdown_container(path_to_try + ".md", nav=nav, session=session)

    iri = SITE_URI + fname
    log.debug(f"Entity Checking {iri}")
    if SITE_URI and entity_check(iri):
        format = accept_header_to_format(request)
        if format == "html":
            q = f"""
# shmarql-view: resource
# shmarql-editor: hide

SELECT ?p ?o ?pp ?oo WHERE {{ 
  <{iri}> ?p ?o .
  OPTIONAL {{
    ?o ?pp ?oo .
  }}
}}"""
        else:
            q = f"CONSTRUCT {{ <{iri}> ?p ?o }} WHERE {{ <{iri}> ?p ?o }}"

        return RedirectResponse(f"{MOUNT}shmarql/?query={quote(q)}")

    # The default 404 from FileResponse leaks the path, make it simpler:
    raise HTTPException(404, f"File not found {fname}")
