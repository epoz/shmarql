from fastapi import FastAPI, Request, Response, HTTPException, BackgroundTasks, Query
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from fastapi.responses import (
    HTMLResponse,
    JSONResponse,
    PlainTextResponse,
    RedirectResponse,
)
from fastapi.middleware.cors import CORSMiddleware
from .config import (
    DEBUG,
    ORIGINS,
    DATA_LOAD_PATHS,
    STORE_PATH,
    DOMAIN,
    SCHEME,
    SERVICE_DESCRIPTION,
    SERVICE_DESCRIPTION_TITLE,
    QUERY_DEFAULT_LIMIT,
    PREFIXES,
    ENDPOINT,
    FTS_FILEPATH,
    RDF2VEC_FILEPATH,
    SBERT_FILEPATH,
    VIRTGRAPH_PATH,
)
import httpx
import logging, os, json, io, time, random, sys, gzip
from typing import Optional
from urllib.parse import quote, parse_qs
import pyoxigraph as px
from .rdfer import prefixes, RDFer, Nice
from rich.traceback import install
from .fts import init_fts, search

# from .rdf2vec import init_rdf2vec, rdf2vec_search
from .px_util import OxigraphSerialization, SynthQuerySolutions, results_to_triples
import rdflib
import fizzysearch

# from .virtual import VirtualGraph

install(show_locals=True)

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

STORE_PRIMARY = True
if STORE_PATH:
    logging.debug(f"Opening store from {STORE_PATH}")
    if DATA_LOAD_PATHS:
        # If there are multiple workers trying to load at the same time,
        # contention for the lock will happen.
        # Do a short wait to stagger start times and let one win, the rest will lock and open read_only
        time.sleep(random.random() / 2)
        try:
            GRAPH = px.Store(STORE_PATH)
            logging.debug("This process won the loading contention")
        except OSError:
            logging.debug("Secondary, opening store read-only")
            GRAPH = px.Store.secondary(STORE_PATH)
            STORE_PRIMARY = False
    else:
        logging.debug("Opening store read-only")
        GRAPH = px.Store.read_only(STORE_PATH)
elif VIRTGRAPH_PATH:
    GRAPH = VirtualGraph(VIRTGRAPH_PATH)
else:
    GRAPH = px.Store()

if len(GRAPH) < 1 and DATA_LOAD_PATHS and STORE_PRIMARY:
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
                    try:
                        filepath = os.path.join(dirpath, filename)
                        if filename.endswith(".gz"):
                            filepath = gzip.open(filepath)
                            filename = filename[:-3]
                        if filename.lower().endswith(".ttl"):
                            logging.debug(f"Parsing {filepath}")
                            GRAPH.bulk_load(filepath, "text/turtle")
                        elif filename.lower().endswith(".nt"):
                            logging.debug(f"Parsing {filepath}")
                            GRAPH.bulk_load(filepath, "application/n-triples")
                    except SyntaxError:
                        logging.error(f"Failed to parse {filepath}")

ENDPOINT_PREDICATE_CACHE = {}
GRAPH_PREDICATES = set()
if len(GRAPH) > 0:
    logging.debug(f"Store size: {len(GRAPH)}, now priming predicate cache...")

    # Fetch the predicates
    # For very big triplestores, this query can take too long, so let's cap the runtime and do a sample via an iterator
    start_time_predicate_cache = time.time()
    for s, p, o, _ in GRAPH.quads_for_pattern(None, None, None):
        GRAPH_PREDICATES.add(p.value)
        if time.time() - start_time_predicate_cache > 5:
            logging.debug(f"Predicate cache priming took too long, breaking")
            break

    ENDPOINT_PREDICATE_CACHE["_local_"] = GRAPH_PREDICATES


if FTS_FILEPATH:
    logging.debug(f"Fulltextsearch filepath has been specified: {FTS_FILEPATH}")
    init_fts(GRAPH.quads_for_pattern, FTS_FILEPATH)
    fizzysearch.register(["<http://shmarql.com/fts>"], search)

# if RDF2VEC_FILEPATH:
#     logging.debug(f"RDF2Vec filepath has been specified: {RDF2VEC_FILEPATH}")
#     init_rdf2vec(GRAPH.quads_for_pattern, RDF2VEC_FILEPATH)
#     fizzysearch.register(["<http://shmarql.com/vec>"], rdf2vec_search)


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
            "sparql.html",
            {"request": request, "ENDPOINT": f"{SCHEME}{DOMAIN}/sparql"},
        )

    if FTS_FILEPATH or RDF2VEC_FILEPATH:
        query = fizzysearch.rewrite(query)

    result = GRAPH.query(query)

    new_result = OxigraphSerialization(result)

    if "application/sparql-results+json" in accept_headers:
        return Response(
            json.dumps(new_result.json()),
            media_type="application/sparql-results+json",
            headers={"Access-Control-Allow-Origin": "*"},
        )

    if (
        "application/xml" in accept_headers
        or "application/sparql-results+xml" in accept_headers
    ):
        return Response(
            new_result.xml(),
            media_type="application/xml",
            headers={"Access-Control-Allow-Origin": "*"},
        )
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
        )  # add the RDFlib serialization here.

    return Response(
        new_result.qt_turtle(),
        media_type="application/n-triples",
        headers={"Access-Control-Allow-Origin": "*"},
    )


async def external_sparql(endpoint: str, query: str):
    async with httpx.AsyncClient(timeout=120) as client:
        headers = {
            "Accept": "application/sparql-results+json",
            "User-Agent": "SCHMARQL/2022 (https://epoz.org/schmarql/ ep@epoz.org)",
        }
        data = {"query": query, "format": "json"}
        logging.debug("SPARQL query on \n%s query=%s", endpoint, quote(query))
        logging.debug(data)
        r = await client.post(
            endpoint,
            data=data,
            headers=headers,
        )
    if r.status_code == 200:
        return r.json()
    return {"exception": r.status_code, "txt": r.text, "results": {"bindings": []}}


def str_to_term(s: str):
    if s[:3] == "<_:":
        return px.BlankNode(s[3:-1])
    if s[0] == "?":
        return None
    if s is None or len(s) < 1:
        return None
    if s[0] == "<" and s[-1] == ">":
        return px.NamedNode(s[1:-1])
    if s[0] == '"':
        if s[-1] == ">":
            tmp = s[1:-1].split('"^^<')
            if len(tmp) == 2:
                value = tmp[0]
                datatype = tmp[1]
                return px.Literal(value, datatype=px.NamedNode(datatype))
        if s[-3] == "@" and s[-1] != '"' and s[-4] == '"':
            return px.Literal(s[1:-4], language=s[-2:])
    return px.Literal(s.strip('"'))


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
    g: str = "",
):
    background_tasks.add_task(rec_usage, request, "/shmarql")
    if len(e) < 1:
        if ENDPOINT:
            e = ENDPOINT
        else:
            e = "_local_"
            if len(GRAPH) < 1:
                return RedirectResponse(
                    "https://docs.google.com/spreadsheets/d/1HVxe9DoKtJTfJHl0l_NQKH-3CVxv-LTHa6xMHoYBcFk/edit?usp=sharing"
                )

    uniq_uris = set()
    nicer = Nice(None, [])
    if e == "_local_":
        buf = []

        if s == "?s" and p == "?p" and o == "?o":
            r = GRAPH.query(
                "SELECT ?p (COUNT(DISTINCT ?s) as ?o) WHERE { ?s ?p ?object . } GROUP BY ?p ORDER BY DESC(?o)"
            )
            results = OxigraphSerialization(r).json()
        else:
            sss, ppp, ooo = str_to_term(s), str_to_term(p), str_to_term(o)
            triples = GRAPH.quads_for_pattern(sss, ppp, ooo)
            while len(buf) < QUERY_DEFAULT_LIMIT:
                try:
                    ts, tp, to, _ = next(triples)
                    uniq_uris.update([ts, tp, to])
                except StopIteration:
                    break
                buf.append((ts, tp, to))

            results = OxigraphSerialization(SynthQuerySolutions(buf)).json()
            nicer = Nice(GRAPH, uniq_uris)
    else:
        if s or p or o:
            if g:
                sparql_start = f"SELECT ?s ?p ?o FROM {g} WHERE {{ "
            else:
                sparql_start = "SELECT ?s ?p ?o WHERE { "

            q = (
                sparql_start
                + s
                + " "
                + p
                + " "
                + o
                + " }"
                + f" LIMIT {QUERY_DEFAULT_LIMIT}"
            )
        elif len(q) < 1:
            q = f"SELECT ?s ?p ?o WHERE {{?s ?p ?o}} ORDER BY ?s LIMIT {QUERY_DEFAULT_LIMIT}"

        results = await external_sparql(e, q)
        if e not in ENDPOINT_PREDICATE_CACHE:
            try:
                if g:
                    preds_q = await external_sparql(
                        e,
                        f"SELECT DISTINCT ?p FROM {g} WHERE {{ ?s ?p ?object . }} LIMIT 200",
                    )
                else:
                    preds_q = await external_sparql(
                        e, "SELECT DISTINCT ?p WHERE { ?s ?p ?object . } LIMIT 200"
                    )
            except Exception as e:
                logging.debug(f"Failed to get predicates from {e}")
                preds_q = {"results": {"bindings": []}}

            ENDPOINT_PREDICATE_CACHE[e] = set(
                [x["p"]["value"] for x in preds_q["results"]["bindings"]]
            )

    if fmt == "json":
        return JSONResponse(results)

    if fmt in ("ttl", "nt"):
        tmpstore = px.Store()
        tmpstore.extend(
            [
                px.Quad(ss, pp, oo)
                for ss, pp, oo in results_to_triples(results, {"s": s, "p": p, "o": o})
            ]
        )
        outbuf = io.BytesIO()
        if fmt == "ttl":
            tmpstore.dump(outbuf, "text/turtle")
            g = rdflib.Graph()
            for prefixiri, prefix in PREFIXES.items():
                g.bind(prefix.strip(":"), prefixiri)
            g.parse(data=outbuf.getvalue())
            return PlainTextResponse(g.serialize())
        else:
            tmpstore.dump(outbuf, "application/n-triples")
        return PlainTextResponse(outbuf.getvalue())

    if "exception" in results:
        return templates.TemplateResponse(
            "error.html", {"request": request, "results": results}
        )

    if "results" in results and "bindings" in results["results"]:
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
            "SERVICE_URI": f"{SCHEME}{DOMAIN}/shmarql",
            "e": e,
            "q": q,
            "showq": showq,
            "s": s,
            "p": p,
            "o": o,
            "g": g,
            "PREFIXES": PREFIXES,
            "IGNORE_FIELDS": [
                "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
            ],
            "GRAPH_PREDICATES": ENDPOINT_PREDICATE_CACHE[e],
            "TITLE_PREDICATES": [
                "http://www.w3.org/2000/01/rdf-schema#label",
                "http://schema.org/name",
                "http://www.w3.org/2004/02/skos/core#prefLabel",
            ],
            "IMAGE_PREDICATES": [
                "http://schema.org/thumbnail",
                "http://schema.org/image",
                "http://schema.org/contentUrl",
                "https://schema.org/thumbnailUrl",
                "http://xmlns.com/foaf/0.1/depiction",
                "http://www.europeana.eu/schemas/edm/isShownBy",
            ],
            "obj": obj,
            "nicer": nicer,
        },
    )


def rec_usage(request: Request, path: str):
    pass  # Better monitoring to be done separately


# Import this at the end, so other more specific path definitions get priority
# TODO: confirm that this matters?
# from .am import *
from .show import *
from .lode import update
from .chat import *
from .schpiel import *
