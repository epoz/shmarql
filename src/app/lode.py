from fastapi import Request, Response
from fastapi.responses import RedirectResponse
from .config import TBOX_PATH, SCHEME, DOMAIN
from .main import app, GRAPH
from urllib.parse import quote
import pyoxigraph as px
from pylode import OntDoc
import httpx
import logging
import tempfile
import io

TBOX, TBOX_HTML = None, None


def load_tbox():
    if TBOX_PATH is None:
        return
    try:
        r = httpx.get(TBOX_PATH, follow_redirects=True)
        if r.status_code == 200:
            # TODO There is a bug in pyLODE, when initializing OntDoc with a rdflib.Graph instance, things fail
            with tempfile.NamedTemporaryFile() as F:
                F.write(r.content)
                od = OntDoc(F.name)
                globals()["TBOX_HTML"] = od.make_html()
            TBOX = px.Store()
            TBOX.load(
                io.BytesIO(r.content), "application/n-triples"
            )  # Only supporting n-triples, what to do when the TBox is turtle?
            globals()["TBOX"] = TBOX
    except:
        # Bit wide, swallowing all the errors, but we do not want a mis-configured TBOX stopping proceedings
        logging.exception(f"Something went wrong parsing {TBOX_PATH}")


load_tbox()


@app.post("/_LODE")
def update():
    load_tbox()
    return "OK"


def can_lode(request: Request, path: str):
    logging.debug(f"LODE path requested:  {path}")

    accept_header = request.headers.get("accept", "")
    if accept_header:
        accept_headers = [ah.strip() for ah in accept_header.split(",")]
    else:
        accept_headers = []

    # Check to see if this is a request for a subject which is in the store
    full_subject = f"{SCHEME}{DOMAIN}/{path}"
    logging.debug(f"Looking for {full_subject} in GRAPH")
    find_full_subject = list(
        GRAPH.quads_for_pattern(px.NamedNode(full_subject), None, None)
    )

    if len(find_full_subject) > 0:
        # See if there is a schema:url in the store for this IRI. If so, re-direct
        for s, p, o, _ in find_full_subject:
            if p in (
                px.NamedNode("http://schema.org/url"),
                px.NamedNode("https://schema.org/url"),
            ):  # alas, some people use the https: variant, let's not be strict
                return RedirectResponse(o.value)
        if "text/turtle" in accept_headers:
            tmp_graph = px.Store()
            tmp_graph.extend(find_full_subject)
            # TODO Consider using the .main.PREFIXES to bind some user-defined prefixes to output
            out = io.StringIO()
            return Response(
                tmp_graph.dump(out, "text/turtle"), media_type="text/turtle"
            )
        return RedirectResponse("/shmarql?s=<" + quote(full_subject) + ">")

    if not TBOX:
        return None

    if path == "_LODE":
        return TBOX_HTML
    for s, p, o, _ in TBOX.quads_for_pattern(
        None, px.NamedNode("http://www.w3.org/1999/02/22-rdf-syntax-ns#type"), None
    ):
        ss = s.value
        if ss.startswith(f"{SCHEME}{DOMAIN}"):
            ont_path = ss.replace(f"{SCHEME}{DOMAIN}/", "")
            if ont_path == path:
                if "text/turtle" in accept_headers:
                    if o.value == "http://www.w3.org/2002/07/owl#Ontology":
                        out = io.StringIO()
                        return Response(
                            TBOX.dump(out, "text/turtle"), media_type="text/turtle"
                        )
                return TBOX_HTML
