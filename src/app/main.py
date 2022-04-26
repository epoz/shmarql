from fastapi import (
    FastAPI,
    Request,
    Response,
    Form,
    HTTPException,
    BackgroundTasks,
    Query,
)
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from .config import (
    ORIGINS,
    DATA_LOAD_PATHS,
    STORE_PATH,
    DOMAIN,
    SERVICE_DESCRIPTION,
    QUERY_DEFAULT_LIMIT,
    PREFIXES_FILEPATH,
    ENDPOINT,
)
import httpx
import logging, os, json
from typing import Optional
from urllib.parse import quote
from rdflib import Graph, ConjunctiveGraph
from .rdfer import prefixes, RDFer

from rich.traceback import install

install(show_locals=True)

app = FastAPI(openapi_url="/openapi")
app.mount("/static", StaticFiles(directory="static"), name="static")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
templates = Jinja2Templates(directory="templates")

# Only init templates here so we can config and use prefixes method
templates.env.filters["prefixes"] = prefixes

GRAPH = ConjunctiveGraph(store="Oxigraph")
logging.debug(f"Opening store from {STORE_PATH}")
GRAPH.open(STORE_PATH)

PREFIXES = {}
try:
    if PREFIXES_FILEPATH:
        PREFIXES = json.load(open(PREFIXES_FILEPATH))
        for uri, prefix in PREFIXES.items():
            GRAPH.bind(prefix.strip(":"), uri)
except:
    logging.exception(f"Problem binding PREFIXES from {PREFIXES_FILEPATH}")


if len(GRAPH) < 1 and DATA_LOAD_PATHS:
    for DATA_LOAD_PATH in DATA_LOAD_PATHS:
        for dirpath, dirnames, filenames in os.walk(DATA_LOAD_PATH):
            for filename in filenames:
                if filename.lower().endswith(".ttl"):
                    filepath = os.path.join(dirpath, filename)
                    logging.debug(f"Parsing {filepath}")
                    GRAPH.parse(filepath)

if len(GRAPH) > 0:
    logging.debug(f"Store size: {len(GRAPH)}")


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
        result = Graph()
        result.parse(data=SERVICE_DESCRIPTION, format="ttl")
    else:
        result = GRAPH.query(query)

    if accept_header == "application/xml":
        return Response(result.serialize(format="xml"), media_type="application/xml")
    if accept_header == "application/ld+json":
        return Response(
            result.serialize(format="json-ld"), media_type="application/ld+json"
        )
    if accept_header == "application/sparql-results+json":
        return Response(
            result.serialize(format="json"), media_type="application/ld+json"
        )
    if accept_header == "text/turtle":
        return Response(result.serialize(format="ttl"), media_type="text/turtle")


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


async def start(endpoint: str):
    q = f"SELECT ?s ?p ?o WHERE {{?s ?p ?o}} ORDER BY ?s LIMIT {QUERY_DEFAULT_LIMIT}"
    return await external_sparql(endpoint, q)


@app.get("/shmarql", response_class=HTMLResponse, include_in_schema=False)
async def schmarql(
    request: Request,
    endpoint: str = "",
    s: str = "?s",
    p: str = "?p",
    o: str = "?o",
    order: str = "?s",
    fmt: str = "",
):
    if not endpoint and not ENDPOINT:
        return templates.TemplateResponse("choose_endpoint.html", {"request": request})
    if s or p or o:
        q = (
            "SELECT ?s ?p ?o WHERE { "
            + s
            + " "
            + p
            + " "
            + o
            + "}"
            + f" ORDER BY ?s LIMIT {QUERY_DEFAULT_LIMIT}"
        )
        results = await external_sparql(endpoint, q)
    else:
        results = await start(endpoint)

    if fmt == "json":
        return JSONResponse(results)

    if "results" in results:
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
            "endpoint": endpoint,
            "s": s,
            "p": p,
            "o": o,
            "PREFIXES": PREFIXES,
            "IGNORE_FIELDS": [
                "http://www.w3.org/2000/01/rdf-schema#label",
                "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
            ],
            "obj": obj,
        },
    )


@app.get("/", response_class=RedirectResponse, include_in_schema=False)
async def homepage(request: Request):
    return RedirectResponse("/schmarql")


def rec_usage(request: Request, path: str):
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
