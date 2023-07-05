from fastapi import Request, Response
from fastapi.responses import RedirectResponse
from .config import TBOX_PATH, SCHEME, DOMAIN
from .main import app, GRAPH
from urllib.parse import quote
from rdflib import Graph, RDF, OWL, URIRef
from pylode import OntDoc
import httpx
import logging
import tempfile


TBOX, TBOX_HTML = None, None


def load_tbox():
    if TBOX_PATH is None:
        return
    try:
        r = httpx.get(TBOX_PATH, follow_redirects=True)
        if r.status_code == 200:
            TBOX = Graph()
            TBOX.parse(data=r.content)
            # TODO There is a bug in pyLODE, when initializing OntDoc with a rdflib.Graph instance, things fail
            with tempfile.NamedTemporaryFile() as F:
                F.write(r.content)
                od = OntDoc(F.name)
                globals()["TBOX_HTML"] = od.make_html()
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
    if (URIRef(full_subject), None, None) in GRAPH:
        if "text/turtle" in accept_headers:
            tmp_graph = Graph()
            for t in GRAPH.triples((URIRef(full_subject), None, None)):
                tmp_graph.add(t)
            # TODO Consider using the .main.PREFIXES to bind some user-defined prefixes to output
            return Response(tmp_graph.serialize(format="ttl"), media_type="text/turtle")
        return RedirectResponse("/shmarql?s=<" + quote(full_subject) + ">")

    if not TBOX:
        return None

    if path == "_LODE":
        return TBOX_HTML
    for s, p, o in TBOX.triples((None, RDF.type, None)):
        ss = str(s)
        if ss.startswith(f"{SCHEME}{DOMAIN}"):
            ont_path = ss.replace(f"{SCHEME}{DOMAIN}/", "")
            if ont_path == path:
                if "text/turtle" in accept_headers:
                    if o == OWL.Ontology:
                        return Response(
                            TBOX.serialize(format="ttl"), media_type="text/turtle"
                        )
                return TBOX_HTML
