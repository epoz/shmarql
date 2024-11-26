import httpx, logging, random, hashlib, json, time, sqlite3, os, gzip
import fizzysearch
from .config import (
    ENDPOINT,
    ENDPOINTS,
    QUERIES_DB,
    FTS_FILEPATH,
    RDF2VEC_FILEPATH,
    PREFIXES_SNIPPET,
    DATA_LOAD_PATHS,
    STORE_PATH,
    log,
)
import pyoxigraph as px
from .px_util import OxigraphSerialization, string_iterator

print(" " * 20, time.time())


def hash_query(query: str) -> str:
    return hashlib.md5(query.encode("utf8")).hexdigest()


def cached_query(query: str, endpoint: str = None):
    # Only use the endpoint if specified
    if endpoint:
        theq = sqlite3.connect(QUERIES_DB).execute(
            "SELECT timestamp, result, duration FROM queries WHERE queryhash = ? and endpoint = ? and not result is null ORDER BY timestamp DESC LIMIT 1",
            (hash_query(query), endpoint),
        )
    else:
        theq = sqlite3.connect(QUERIES_DB).execute(
            "SELECT timestamp, result, duration FROM queries WHERE queryhash = ? and not result is null ORDER BY timestamp DESC LIMIT 1",
            (hash_query(query),),
        )

    for timestamp, result, duration in theq:
        result = json.loads(result)
        result["timestamp"] = timestamp
        result["duration"] = duration
        result["cached"] = True
        return result


def do_query(query: str) -> dict:
    to_use = ENDPOINT

    rewritten = fizzysearch.rewrite(
        query,
        {
            "https://fizzysearch.ise.fiz-karlsruhe.de/fts": fizzysearch.use_fts(
                FTS_FILEPATH
            ),
            "fizzy:fts": fizzysearch.use_fts(FTS_FILEPATH),
            "fizzy:ftsStats": fizzysearch.use_fts_stats(FTS_FILEPATH),
            "fizzy:rdf2vec": fizzysearch.use_rdf2vec(RDF2VEC_FILEPATH),
        },
    )

    for comment in rewritten["comments"]:
        logging.debug(f"fizzysearch SPARQL Comment: {comment}")
        if comment.find("shmarql-engine:") > -1:
            to_use = ENDPOINTS.get(comment.split(" ")[-1])

    query = rewritten.get("rewritten", query)
    logging.debug(f"fizzysearch rewritten query: {query[:1000]}...{query[-1000:]}")

    if not to_use:
        if len(ENDPOINTS) > 0:
            to_use = random.choice(list(ENDPOINTS.values()))
        elif len(GRAPH) > 0:
            to_use = "__local__"
        else:
            return {"error": "No endpoint found"}

    cached_query_result = cached_query(query)
    if cached_query_result:
        return cached_query_result

    time_start = time.time()
    result = {}
    if to_use == "__local__":
        try:
            qquery = PREFIXES_SNIPPET + "\n" + query
            r = GRAPH.query(qquery)
            result = OxigraphSerialization(r).json()
        except Exception as e:
            return {"error": str(e)}
    else:
        if rewritten.get("query_type") == "construct":
            accept_header = "text/turtle"
        else:
            accept_header = "application/sparql-results+json"
        headers = {
            "Accept": accept_header,
            "User-Agent": "SHMARQL/2024 (https://shmarql.com/ ep@epoz.org)",
        }

        data = {
            "query": PREFIXES_SNIPPET + "\n" + query,
        }
        try:
            r = httpx.post(to_use, data=data, headers=headers, timeout=180)
            if r.status_code == 200:
                try:
                    result = r.json()
                except json.JSONDecodeError:
                    result = {"data": r.content.decode("utf8")}
            elif r.status_code == 500:
                return {"error": r.text}
        except:
            logging.exception(f"Problem with {to_use}")
            return {"error": "Exception raised querying endpoint"}

    time_end = time.time()
    duration = time_end - time_start

    # get the endpoint name from the to_use URL
    endpoint_name = "default"
    for k, v in ENDPOINTS.items():
        if v == to_use:
            endpoint_name = k

    if result:
        result["duration"] = duration
        result["endpoint_name"] = endpoint_name
        result["endpoint"] = to_use

        thequerydb = sqlite3.connect(QUERIES_DB)
        thequerydb.execute(
            "INSERT INTO queries (queryhash, query, timestamp, endpoint, result, duration) VALUES (?, ?, datetime(), ?, ?, ?)",
            (hash_query(query), query, to_use, json.dumps(result), duration),
        )
        thequerydb.commit()

        return result
    else:
        return {"error": r.text, "status": r.status_code}


def initialize_graph(data_load_paths: list, store_path: str = None) -> px.Store:

    store_primary = True
    if store_path:
        log.debug(f"Opening store from {store_path}")
        if data_load_paths:
            # If there are multiple workers trying to load at the same time,
            # contention for the lock will happen.
            # Do a short wait to stagger start times and let one win, the rest will lock and open read_only
            time.sleep(random.random() / 2)
            try:
                GRAPH = px.Store(store_path)
                log.debug("This process won the loading contention")
            except OSError:
                log.debug("Secondary, opening store read-only")
                GRAPH = px.Store.secondary(store_path)
                store_primary = False
        else:
            log.debug("Opening store read-only")
            GRAPH = px.Store.read_only(store_path)
    else:
        GRAPH = px.Store()

    if len(GRAPH) < 1 and data_load_paths and store_primary:
        for data_load_path in data_load_paths:
            if data_load_path.startswith("http://") or data_load_path.startswith(
                "https://"
            ):
                log.debug(f"Downloading {data_load_path}")
                # Try downloading this file and parsing it as a string
                r = httpx.get(data_load_path, follow_redirects=True)
                if r.status_code == 200:
                    d = r.content
                    # Try and guess content type from extention, default is turtle
                    # if .rdf or .nt use on of those
                    if data_load_path.endswith(".rdf") or data_load_path.endswith(
                        ".xml"
                    ):
                        GRAPH.bulk_load(r.content, "application/rdf+xml")
                    elif data_load_path.endswith(".nt"):
                        GRAPH.bulk_load(r.content, "application/n-triples")
                    else:
                        GRAPH.bulk_load(r.content, "text/turtle")
            else:
                if load_file_to_graph(GRAPH, data_load_path):
                    continue
                for dirpath, _, filenames in os.walk(data_load_path):
                    for filename in filenames:
                        try:
                            filepath = os.path.join(dirpath, filename)
                            load_file_to_graph(GRAPH, filepath)
                        except SyntaxError:
                            log.error(f"Failed to parse {filepath}")

    log.debug(f"Graph has {len(GRAPH)} triples")

    if store_primary and FTS_FILEPATH and not os.path.exists(FTS_FILEPATH):
        count = fizzysearch.fts.build_fts_index(
            [], FTS_FILEPATH, string_iterator(GRAPH)
        )
        log.debug(f"FTS index at {FTS_FILEPATH} with {count} literals")

    if store_primary and RDF2VEC_FILEPATH and not os.path.exists(RDF2VEC_FILEPATH):
        count = fizzysearch.rdf2vec.build_rdf2vec_index(
            [], RDF2VEC_FILEPATH, string_iterator(GRAPH)
        )
        log.debug(f"RDF2Vec index at {RDF2VEC_FILEPATH} with {count} entities")

    return GRAPH


def load_file_to_graph(graph: px.Store, filepath: str) -> bool:
    was_file = False
    try:
        filename = os.path.basename(filepath)
        if filename.endswith(".gz"):
            filepath = gzip.open(filepath)
            filename = filename[:-3]
        else:
            filepath = open(filepath, "rb")
        if filename.lower().endswith(".ttl"):
            log.debug(f"Parsing {filepath}")
            graph.bulk_load(filepath, "text/turtle")
            was_file = True
        elif filename.lower().endswith(".nt"):
            log.debug(f"Parsing {filepath}")
            graph.bulk_load(filepath, "application/n-triples")
            was_file = True
    except Exception as e:
        log.debug(f"{filepath} exception {e}")
    return was_file


if not (ENDPOINT or len(ENDPOINTS) > 0):
    GRAPH = initialize_graph(DATA_LOAD_PATHS, STORE_PATH)
