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
)
import httpx
import logging, os, json, io, time, random
from typing import Optional
from urllib.parse import quote, parse_qs
import pyoxigraph as px
from .rdfer import prefixes, RDFer, Nice
from rich.traceback import install
from .fts import init_fts, search
from .px_util import OxigraphSerialization, SynthQuerySolutions, results_to_triples
import rdflib
from tree_sitter import Language, Parser

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
        GRAPH = px.Store.read_only(STORE_PATH)
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
                    filepath = os.path.join(dirpath, filename)
                    if filename.lower().endswith(".ttl"):
                        logging.debug(f"Parsing {filepath}")
                        GRAPH.bulk_load(filepath, "text/turtle")
                    elif filename.lower().endswith(".nt"):
                        logging.debug(f"Parsing {filepath}")
                        GRAPH.bulk_load(filepath, "application/n-triples")

ENDPOINT_PREDICATE_CACHE = {}
GRAPH_PREDICATES = set()
if len(GRAPH) > 0:
    logging.debug(f"Store size: {len(GRAPH)}")

    # Fetch the predicates
    GRAPH_PREDICATES = set(
        [
            x[0].value
            for x in GRAPH.query("SELECT DISTINCT ?p WHERE { ?s ?p ?object . }")
        ]
    )
    ENDPOINT_PREDICATE_CACHE["_local_"] = GRAPH_PREDICATES


if FTS_FILEPATH:
    logging.debug(f"Fulltextsearch filepath has been specified: {FTS_FILEPATH}")
    init_fts(GRAPH.quads_for_pattern, FTS_FILEPATH)
    if sys.platform == "darwin":
        SPARQL = Language("/usr/local/lib/sparql.dylib", "sparql")
    else:
        SPARQL = Language("/usr/local/lib/sparql.so", "sparql")
    PARSER = Parser()
    PARSER.set_language(SPARQL)


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

    if FTS_FILEPATH:
        tree = PARSER.parse(query.encode("utf8"))
        q = SPARQL.query(
            """((triples_same_subject (var) @var (property_list (property (path_element (iri_reference) @predicate) (object_list (rdf_literal) @q_object)))) @tss (".")* @tss_dot )"""
        )
        found_vars = []
        found = False
        start_byte = end_byte = 0
        var_name = q_object = None
        for n, name in q.captures(tree.root_node):
            if name == "tss":
                if start_byte > 0 and end_byte > start_byte:
                    if var_name is not None and q_object is not None and found:
                        found_vars.append((start_byte, end_byte, var_name, q_object))
                start_byte = n.start_byte
                end_byte = n.end_byte
                var_name = q_object = None
                found = False
            if name == "q_object":
                q_object = n.text.decode("utf8")
            if name == "predicate" and n.text == b"<http://shmarql.com/fts>":
                found = True
            if name == "var":
                var_name = n.text.decode("utf8")
            if name == "tss_dot":
                end_byte = n.end_byte

        # If there is only one,
        if start_byte > 0 and end_byte > start_byte:
            if var_name is not None and q_object is not None and found:
                found_vars.append((start_byte, end_byte, var_name, q_object))

        if len(found_vars) > 0:
            newq = []
            for i, c in enumerate(query.encode("utf8")):
                in_found = False
                for start_byte, end_byte, var_name, q_object in found_vars:
                    if i >= start_byte and i <= end_byte:
                        if not in_found:
                            fts_results = search(q_object.strip('"'))
                            fts_results = " ".join(
                                [
                                    f"<{fts_result}>"
                                    for fts_result in fts_results
                                    if not fts_result.startswith("_:")
                                ]
                            )
                            if fts_results:
                                newq.append(f"VALUES {var_name} {{{fts_results}}}")
                        in_found = True
                if not in_found:
                    newq.append(chr(c))
            newq = "".join(newq)
            query = newq

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
        )  # add the RDFlib serialization here.

    return Response(
        new_result.qt_turtle(),
        media_type="application/n-triples",
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
        if e not in ENDPOINT_PREDICATE_CACHE:
            preds_q = await external_sparql(
                e, "SELECT DISTINCT ?p WHERE { ?s ?p ?object . }"
            )
            ENDPOINT_PREDICATE_CACHE[e] = set(
                [x["p"]["value"] for x in preds_q["results"]["bindings"]]
            )

    if fmt == "json":
        return JSONResponse(results)

    if fmt in ("ttl", "nt"):
        tmpstore = px.Store()
        tmpstore.extend(
            [px.Quad(ss, pp, oo) for ss, pp, oo in results_to_triples(results)]
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
                "http://xmlns.com/foaf/0.1/depiction",
                "http://www.europeana.eu/schemas/edm/isShownBy",
            ],
            "obj": obj,
            "nicer": nicer,
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
