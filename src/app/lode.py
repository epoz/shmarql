from fastapi import Request, Response
from .config import TBOX_PATH, SCHEME, DOMAIN
from .main import app
from rdflib import Graph, RDF, OWL
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
    accept_header = request.headers.get("accept", "")

    if path == "_LODE":
        return TBOX_HTML
    for s, p, o in TBOX.triples((None, RDF.type, None)):
        ss = str(s)
        if ss.startswith(f"{SCHEME}{DOMAIN}"):
            ont_path = ss.replace(f"{SCHEME}{DOMAIN}/", "")
            if ont_path == path:
                if accept_header == "text/turtle":
                    if o == OWL.Ontology:
                        return Response(
                            TBOX.serialize(format="ttl"), media_type="text/turtle"
                        )
                    else:
                        # TODO Consider using the .main.PREFIXES to bind some user-defined prefixes to output
                        tmp_graph = Graph()
                        for t in TBOX.triples((s, None, None)):
                            tmp_graph.add(t)
                        return Response(
                            tmp_graph.serialize(format="ttl"), media_type="text/turtle"
                        )
                return TBOX_HTML
