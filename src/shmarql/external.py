import httpx, logging, random, hashlib, json, time, sqlite3
import fizzysearch
from .config import (
    ENDPOINT,
    ENDPOINTS,
    QUERIES_DB,
    FTS_FILEPATH,
    RDF2VEC_FILEPATH,
    CONFIG_STORE,
    get_setting,
)


def hash_query(query: str) -> str:
    return hashlib.md5(query.encode("utf8")).hexdigest()


def cached_query(query: str, endpoint: str = None):
    # Only use the endpoint if specified
    if endpoint:
        theq = sqlite3.connect(QUERIES_DB).execute(
            "SELECT timestamp, result, duration FROM queries WHERE queryhash = ? and endpoint = ? ORDER BY timestamp DESC LIMIT 1",
            (hash_query(query), endpoint),
        )
    else:
        theq = sqlite3.connect(QUERIES_DB).execute(
            "SELECT timestamp, result, duration FROM queries WHERE queryhash = ? ORDER BY timestamp DESC LIMIT 1",
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
        else:
            return {"error": "No endpoint found"}

    cached_query_result = cached_query(query)
    if cached_query_result:
        return cached_query_result

    time_start = time.time()
    headers = {
        "Accept": "application/sparql-results+json",
        "User-Agent": "SCHMARQL/2024 (https://shmarql.com/ ep@epoz.org)",
    }
    data = {"query": get_setting("prefixes") + "\n" + query, "format": "json"}
    try:
        r = httpx.post(to_use, data=data, headers=headers, timeout=180)
    except:
        logging.exception(f"Problem with {to_use}")
        return {"error": "Could not connect to endpoint"}
    time_end = time.time()
    duration = time_end - time_start

    # get the endpoint name from the to_use URL
    endpoint_name = "default"
    for k, v in ENDPOINTS.items():
        if v == to_use:
            endpoint_name = k

    if r.status_code == 200:
        result = r.json()
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
