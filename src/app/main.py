from fastapi import FastAPI, Request, Response, HTTPException, BackgroundTasks, Query
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse, PlainTextResponse
from fastapi.middleware.cors import CORSMiddleware
from .config import (
    DEBUG,
    ORIGINS,
    DATA_LOAD_PATHS,
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
from urllib.parse import quote, parse_qs
import pyoxigraph as px
from .rdfer import prefixes, RDFer, results_to_triples
from rich.traceback import install
from .fts import init_fts
from .px_util import OxigraphSerialization

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


if STORE_PATH:
    logging.debug(f"Opening store from {STORE_PATH}")
    if DATA_LOAD_PATHS:
        GRAPH = px.Store(STORE_PATH)
    else:
        GRAPH = px.Store.read_only(STORE_PATH)
else:
    GRAPH = px.Store()

if len(GRAPH) < 1 and DATA_LOAD_PATHS:
    for DATA_LOAD_PATH in DATA_LOAD_PATHS:
        if DATA_LOAD_PATH.startswith("http://") or DATA_LOAD_PATH.startswith(
            "https://"
        ):
            logging.debug(f"Downloading {DATA_LOAD_PATH}")
            # Try downloading this file and parsing it as a string
            r = httpx.get(DATA_LOAD_PATH, follow_redirects=True)
            if r.status_code == 200:
                d = r.content
                # Try and guess content type from extention, default is turtle
                # if .rdf or .nt use on of those
                if DATA_LOAD_PATH.endswith(".rdf") or DATA_LOAD_PATH.endswith(".xml"):
                    GRAPH.bulk_load(r.content, "application/rdf+xml")
                elif DATA_LOAD_PATH.endswith(".nt"):
                    GRAPH.bulk_load(r.content, "application/n-triples")
                else:
                    GRAPH.bulk_load(r.content, "text/turtle")
        else:
            for dirpath, dirnames, filenames in os.walk(DATA_LOAD_PATH):
                for filename in filenames:
                    filepath = os.path.join(dirpath, filename)
                    if filename.lower().endswith(".ttl"):
                        logging.debug(f"Parsing {filepath}")
                        GRAPH.bulk_load(filepath, "text/turtle")
                    elif filename.lower().endswith(".nt"):
                        logging.debug(f"Parsing {filepath}")
                        GRAPH.bulk_load(filepath, "application/n-triples")
if len(GRAPH) > 0:
    logging.debug(f"Store size: {len(GRAPH)}")

if FTS_FILEPATH:
    logging.debug(f"Fulltextsearch filepath has been specified: {FTS_FILEPATH}")
    init_fts(GRAPH, FTS_FILEPATH)


@app.post("/sparql")
async def sparql_post_sparql_query(
    request: Request,
    background_tasks: BackgroundTasks,
):
    content_type = request.headers.get("content-type")
    body = await request.body()
    body = body.decode("utf8")

    if content_type.startswith("application/sparql-query"):
        return await sparql_get(request, background_tasks, body)
    if content_type.startswith("application/x-www-form-urlencoded"):
        params = parse_qs(body)
        return await sparql_get(request, background_tasks, params["query"][0])

    raise HTTPException(status_code=400, detail="This request is malformed")


@app.get("/sparql")
async def sparql_get(
    request: Request,
    background_tasks: BackgroundTasks,
    query: Optional[str] = Query(None),
):
    background_tasks.add_task(rec_usage, request, "/sparql")
    accept_header = request.headers.get("accept")
    if accept_header:
        accept_headers = [ah.strip() for ah in accept_header.split(",")]
    else:
        accept_headers = []

    if not query:
        if "text/turtle" in accept_headers:
            return Response(SERVICE_DESCRIPTION, media_type="text/turtle")
        return templates.TemplateResponse(
            "sparql.html", {"request": request, "ENDPOINT": ENDPOINT}
        )
    else:
        result = GRAPH.query(query)

    new_result = OxigraphSerialization(result)

    if "application/sparql-results+json" in accept_headers:
        return Response(
            json.dumps(new_result.json()),
            media_type="application/sparql-results+json",
            headers={"Access-Control-Allow-Origin": "*"},
        )
    # delay XML results until it is actually needed https://www.w3.org/TR/2013/REC-rdf-sparql-XMLres-20130321/
    # if (
    #     "application/xml" in accept_headers
    #     or "application/sparql-results+xml" in accept_headers
    # ):
    #     return Response(
    #         result.serialize(format="xml"),
    #         media_type="application/xml",
    #         headers={"Access-Control-Allow-Origin": "*"},
    #     )
    # delay JSON-LD until it is actually needed... ;-)
    # if "application/ld+json" in accept_headers:
    #     return Response(
    #         result.serialize(format="json-ld"),
    #         media_type="application/ld+json",
    #         headers={"Access-Control-Allow-Origin": "*"},
    #     )
    if "text/turtle" in accept_headers:
        return Response(
            new_result.qt_turtle(),
            media_type="text/turtle",
            headers={"Access-Control-Allow-Origin": "*"},
        )
    return Response(
        json.dumps(new_result.json()),
        media_type="application/json",
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
async def shmarql(
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

    if fmt in ("ttl", "nt"):
        triplebuf = "\n".join(
            [
                f"{s_} {p_} {o_} ."
                for s_, p_, o_ in results_to_triples(results, {"s": s, "p": p, "o": o})
            ]
        )
        if fmt == "ttl":
            tmpgraph = rdflib.Graph()
            tmpgraph.parse(format="nt", data=triplebuf)
            triplebuf = tmpgraph.serialize()
        return PlainTextResponse(triplebuf)

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
                "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
            ],
            "TITLE_PREDICATES": [
                "http://www.w3.org/2000/01/rdf-schema#label",
                "http://schema.org/name",
                "http://www.w3.org/2004/02/skos/core#prefLabel",
            ],
            "IMAGE_PREDICATES": [
                "http://schema.org/thumbnail",
                "http://schema.org/image",
                "http://schema.org/contentUrl",
                "http://xmlns.com/foaf/0.1/depiction",
                "http://www.europeana.eu/schemas/edm/isShownBy",
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
from .am import *
from .show import *
from .lode import update
from .schpiel import *
