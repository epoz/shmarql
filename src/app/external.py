import httpx, logging, random
import fizzysearch
from .config import ENDPOINT, ENDPOINTS


def do_query(query: str):
    to_use = ENDPOINT
    rewritten = fizzysearch.rewrite_extended(query)
    for comment in rewritten["comments"]:
        if comment.find("shmarql-engine:") > -1:
            to_use = ENDPOINTS.get(comment.split(" ")[-1])

    if not to_use:
        if len(ENDPOINTS) > 0:
            to_use = random.choice(list(ENDPOINTS.values()))
        else:
            return {"error": "No endpoint found"}

    headers = {
        "Accept": "application/sparql-results+json",
        "User-Agent": "SCHMARQL/2024 (https://shmarql.com/ ep@epoz.org)",
    }
    data = {"query": query, "format": "json"}
    try:
        r = httpx.post(
            to_use,
            data=data,
            headers=headers,
        )
    except:
        logging.exception(f"Problem with {to_use}")
        return {"error": "Could not connect to endpoint"}
    if r.status_code == 200:
        return r.json()
    else:
        return {"error": r.text, "status": r.status_code}
