import httpx, logging, random, hashlib, json, time, sqlite3
import fizzysearch
from .config import ENDPOINT, ENDPOINTS, QUERIES_DB, FTS_FILEPATH


def hash_query(query: str) -> str:
    return hashlib.md5(query.encode("utf8")).hexdigest()


def cached_query(endpoint: str, query: str):
    for timestamp, result, duration in sqlite3.connect(QUERIES_DB).execute(
        "SELECT timestamp, result, duration FROM queries WHERE queryhash = ? and endpoint = ? ORDER BY timestamp DESC LIMIT 1",
        (hash_query(query), endpoint),
    ):
        result = json.loads(result)
        result["timestamp"] = timestamp
        result["duration"] = duration
        result["cached"] = True
        return result


def do_query(query: str) -> dict:
    to_use = ENDPOINT
    if FTS_FILEPATH:
        rewritten = fizzysearch.rewrite(
            query,
            {
                "https://fizzysearch.ise.fiz-karlsruhe.de/fts/": fizzysearch.use_fts(
                    FTS_FILEPATH
                )
            },
        )
    else:
        rewritten = fizzysearch.rewrite(query)
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

    cached_query_result = cached_query(to_use, query)
    if cached_query_result:
        return cached_query_result

    time_start = time.time()
    headers = {
        "Accept": "application/sparql-results+json",
        "User-Agent": "SCHMARQL/2024 (https://shmarql.com/ ep@epoz.org)",
    }
    data = {"query": query, "format": "json"}
    try:
        r = httpx.post(to_use, data=data, headers=headers, timeout=180)
    except:
        logging.exception(f"Problem with {to_use}")
        return {"error": "Could not connect to endpoint"}
    time_end = time.time()
    duration = time_end - time_start
    if r.status_code == 200:
        thequerydb = sqlite3.connect(QUERIES_DB)
        thequerydb.execute(
            "INSERT INTO queries (queryhash, query, timestamp, endpoint, result, duration) VALUES (?, ?, datetime(), ?, ?, ?)",
            (hash_query(query), query, to_use, r.text, duration),
        )

        thequerydb.commit()
        result = r.json()
        result["duration"] = duration
        return result
    else:
        return {"error": r.text, "status": r.status_code}
