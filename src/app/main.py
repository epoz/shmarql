from fastapi import (
    FastAPI,
    Request,
    Response,
    Form,
    HTTPException,
    BackgroundTasks,
    Query,
)
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from .config import (
    DEBUG,
    ORIGINS,
    DATA_LOAD_PATHS,
    STORE,
    STORE_PATH,
    DOMAIN,
    SERVICE_DESCRIPTION,
    SERVICE_DESCRIPTION_TITLE,
    QUERY_DEFAULT_LIMIT,
    PREFIXES_FILEPATH,
    DEFAULT_PREFIXES,
    ENDPOINT,
    FTS_FILEPATH,
)
import httpx
import logging, os, json
from typing import Optional
from urllib.parse import quote
from rdflib import Graph, ConjunctiveGraph
from rdflib.plugin import PluginException
from .rdfer import prefixes, RDFer
from rich.traceback import install
from .fts import init_fts

install(show_locals=True)

if DEBUG:
    logging.basicConfig(level=logging.DEBUG)
else:
    logging.basicConfig()

app = FastAPI(openapi_url="/openapi")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
templates = Jinja2Templates(directory="templates")
app.mount("/static", StaticFiles(directory="static"), name="static")

# Only init templates here so we can config and use prefixes method
templates.env.filters["prefixes"] = prefixes

if STORE == "oxigraph":
    GRAPH = ConjunctiveGraph(store="Oxigraph")
    logging.debug(f"Opening store from {STORE_PATH}")
    GRAPH.open(STORE_PATH)
else:
    GRAPH = ConjunctiveGraph()

PREFIXES = DEFAULT_PREFIXES
try:
    if PREFIXES_FILEPATH:
        PREFIXES = json.load(open(PREFIXES_FILEPATH))
        for uri, prefix in PREFIXES.items():
            GRAPH.bind(prefix.strip(":"), uri)
except:
    logging.exception(f"Problem binding PREFIXES from {PREFIXES_FILEPATH}")


if len(GRAPH) < 1 and DATA_LOAD_PATHS:
    for DATA_LOAD_PATH in DATA_LOAD_PATHS:
        if DATA_LOAD_PATH.startswith("http://") or DATA_LOAD_PATH.startswith(
            "https://"
        ):
            logging.debug(f"Parsing {DATA_LOAD_PATH}")
            try:
                GRAPH.parse(DATA_LOAD_PATH)
            except PluginException:
                logging.debug(
                    "Content-Type for plugin failed, downloading the file directly."
                )
                # Try downloading this file and parsing it as a string
                r = httpx.get(DATA_LOAD_PATH, follow_redirects=True)
                if r.status_code == 200:
                    d = r.content
                    # Try and guess content type from extention, default is turtle
                    # if .rdf or .nt use on of those
                    if DATA_LOAD_PATH.endswith(".rdf") or DATA_LOAD_PATH.endswith(
                        ".xml"
                    ):
                        GRAPH.parse(data=r.content, format="xml")
                    elif DATA_LOAD_PATH.endswith(".nt"):
                        GRAPH.parse(data=r.content, format="nt")
                    else:
                        GRAPH.parse(
                            data=r.content,
                        )
        else:
            for dirpath, dirnames, filenames in os.walk(DATA_LOAD_PATH):
                for filename in filenames:
                    if filename.lower().endswith(".ttl"):
                        filepath = os.path.join(dirpath, filename)
                        logging.debug(f"Parsing {filepath}")
                        GRAPH.parse(filepath)

if len(GRAPH) > 0:
    logging.debug(f"Store size: {len(GRAPH)}")

if FTS_FILEPATH:
    logging.debug(f"Fulltextsearch filepath has been specified: {FTS_FILEPATH}")
    init_fts(GRAPH, FTS_FILEPATH)


@app.post("/sparql")
async def sparql_post(
    request: Request, background_tasks: BackgroundTasks, query: str = Form(...)
):
    return await sparql_get(request, background_tasks, query)


@app.get("/sparql")
async def sparql_get(
    request: Request,
    background_tasks: BackgroundTasks,
    query: Optional[str] = Query(None),
):
    background_tasks.add_task(rec_usage, request, "/sparql")
    accept_header = request.headers.get("accept", "")

    if not query:
        if accept_header == "text/turtle":
            result = Graph()
            result.parse(data=SERVICE_DESCRIPTION, format="ttl")
            return Response(result.serialize(format="ttl"), media_type="text/turtle")
        return templates.TemplateResponse(
            "sparql.html", {"request": request, "ENDPOINT": ENDPOINT}
        )
    else:
        result = GRAPH.query(query)

    if (
        accept_header == "application/xml"
        or accept_header == "application/sparql-results+xml"
    ):
        return Response(
            result.serialize(format="xml"),
            media_type="application/xml",
            headers={"Access-Control-Allow-Origin": "*"},
        )
    if accept_header == "application/ld+json":
        return Response(
            result.serialize(format="json-ld"),
            media_type="application/ld+json",
            headers={"Access-Control-Allow-Origin": "*"},
        )
    if accept_header == "application/sparql-results+json":
        return Response(
            result.serialize(format="json"),
            media_type="application/sparql-results+json",
            headers={"Access-Control-Allow-Origin": "*"},
        )
    if accept_header == "text/turtle":
        return Response(result.serialize(format="ttl"), media_type="text/turtle")
    return Response(
        result.serialize(format="json"),
        media_type="application/sparql-results+json",
        headers={"Access-Control-Allow-Origin": "*"},
    )


async def external_sparql(endpoint: str, query: str):
    async with httpx.AsyncClient(timeout=45) as client:
        headers = {
            "Accept": "application/sparql-results+json",
            "User-Agent": "SCHMARQL/2022 (https://epoz.org/schmarql/ ep@epoz.org)",
        }
        data = {"query": query}
        logging.debug("SPARQL query on \n%s query=%s", endpoint, quote(query))
        logging.debug(data)
        r = await client.post(
            endpoint,
            data=data,
            headers=headers,
        )
    if r.status_code == 200:
        return r.json()
    return {"exception": r.status_code, "txt": r.text}


@app.get("/shmarql", response_class=HTMLResponse, include_in_schema=False)
async def schmarql(
    request: Request,
    background_tasks: BackgroundTasks,
    e: str = "",
    q: str = "",
    s: str = "?s",
    p: str = "?p",
    o: str = "?o",
    order: str = "?s",
    fmt: str = "",
    showq: bool = False,
):
    background_tasks.add_task(rec_usage, request, "/shmarql")
    if len(e) < 1:
        if not ENDPOINT:
            return templates.TemplateResponse(
                "choose_endpoint.html", {"request": request}
            )
        else:
            e = ENDPOINT
    if s or p or o:
        q = (
            "SELECT ?s ?p ?o WHERE { "
            + s
            + " "
            + p
            + " "
            + o
            + " }"
            + f" ORDER BY ?s LIMIT {QUERY_DEFAULT_LIMIT}"
        )
    elif len(q) < 1:
        q = f"SELECT ?s ?p ?o WHERE {{?s ?p ?o}} ORDER BY ?s LIMIT {QUERY_DEFAULT_LIMIT}"

    results = await external_sparql(e, q)

    if fmt == "json":
        return JSONResponse(results)

    if "exception" in results:
        return templates.TemplateResponse(
            "error.html", {"request": request, "results": results}
        )

    if "results" in results and "bindings" in results["results"]:
        for row in results["results"]["bindings"]:
            if s != "?s":
                row["s"] = {"type": "uri", "value": s.strip("<>")}
            if p != "?p":
                row["p"] = {"type": "uri", "value": p.strip("<>")}
            if o != "?o":
                row["o"] = {"type": "uri", "value": o.strip("<>")}

        obj = RDFer(results["results"]["bindings"])
    else:
        obj = {}
    if s != "?s" and p == "?p" and o == "?o":
        templatename = "detail.html"
    else:
        templatename = "browse.html"

    return templates.TemplateResponse(
        templatename,
        {
            "request": request,
            "results": results,
            "SERVICE_DESCRIPTION_TITLE": SERVICE_DESCRIPTION_TITLE,
            "e": e,
            "q": q,
            "showq": showq,
            "s": s,
            "p": p,
            "o": o,
            "PREFIXES": PREFIXES,
            "IGNORE_FIELDS": [
                "http://www.w3.org/2000/01/rdf-schema#label",
                "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
                "http://schema.org/name",
            ],
            "TITLE_PREDICATES": ["rdfs:label", "schema:name", "skos:preflabel"],
            "IMAGE_PREDICATES": [
                "http://schema.org/thumbnail",
                "http://xmlns.com/foaf/0.1/depiction",
            ],
            "obj": obj,
        },
    )


def rec_usage(request: Request, path: str):
    if DOMAIN == "localhost":
        return
    xff = request.headers.get("x-forwarded-for")
    headers = {
        "Content-Type": "application/json",
        "User-Agent": request.headers.get("user-agent", "unknown"),
        "X-Forwarded-For": "127.0.0.1",
    }
    if xff:
        logging.debug(f"Query from {xff}")
        headers["X-Forwarded-For"] = xff
    r = httpx.post(
        "https://plausible.io/api/event",
        headers=headers,
        data=json.dumps(
            {
                "name": "pageview",
                "url": f"https://{DOMAIN}/{path}",
                "domain": DOMAIN,
            }
        ),
    )


# Import this at the end, so other more specific path definitions get priority
# TODO: confirm that this matters?
from .lode import show_lode
from .schpiel import *
