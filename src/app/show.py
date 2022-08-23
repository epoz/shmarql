# For a folder filled with turtle files, enable browsing using pygments to do formatting
from fastapi import Request, HTTPException
from jinja2 import Markup
from .main import app, templates
from pygments.formatters import HtmlFormatter
from pygments import highlight
import pygments.lexers
import os, sqlite3, gzip, rdflib
from .config import SHOW_PATHS
from xml.etree import ElementTree as ET


turtle_lexer = pygments.lexers.get_lexer_by_name("turtle")
xml_lexer = pygments.lexers.get_lexer_by_name("xml")
PREFIXES = {
    "dc": "http://purl.org/dc/elements/1.1/",
    "dcterms": "http://purl.org/dc/terms/",
    "ore": "http://www.openarchives.org/ore/terms/",
    "edm": "http://www.europeana.eu/schemas/edm/",
    "skos": "http://www.w3.org/2004/02/skos/core#",
    "dcterms": "http://purl.org/dc/terms/",
    "cidoc": "http://www.cidoc-crm.org/rdfs/cidoc_crm_v5.0.2_english_label.rdfs#",
    "ddbedm": "http://www.deutsche-digitale-bibliothek.de/edm/",
    "ddbitem": "http://www.deutsche-digitale-bibliothek.de/item/",
    "rdf": "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
}


def from_db(objid):
    xml = None
    for db_path in SHOW_PATHS:
        db = sqlite3.connect(db_path)
        xml = db.execute(
            "SELECT xml FROM source WHERE id = CAST(? AS BLOB)", (objid,)
        ).fetchone()
        if xml:
            xml = xml[0]
            break
    if not xml:
        raise HTTPException(status_code=404, detail=f"Item [{objid}] not found")

    xml = gzip.decompress(xml)
    g = rdflib.Graph()
    for k, v in PREFIXES.items():
        g.namespace_manager.bind(k, rdflib.URIRef(v))

    doc = ET.fromstring(xml)
    edm = doc.find(".//{http://www.w3.org/1999/02/22-rdf-syntax-ns#}RDF")
    g.parse(data=ET.tostring(edm), format="application/rdf+xml")
    edm = g.serialize(format="turtle")
    records = [
        x.text
        for x in doc.findall(
            ".//{http://www.deutsche-digitale-bibliothek.de/ns/cortex-item-source}record"
        )
    ]
    ET.indent(doc)
    return edm, ET.tostring(doc), records


@app.get("/show/{anid:path}", include_in_schema=False)
async def item_id(request: Request, anid: str):
    edm, xml, records = from_db(anid)

    htmlfmter = HtmlFormatter()
    ttled = Markup(highlight(edm, turtle_lexer, htmlfmter))
    xmled = Markup(highlight(xml, xml_lexer, htmlfmter))
    recordsed = [Markup(highlight(record, xml_lexer, htmlfmter)) for record in records]

    response = templates.TemplateResponse(
        "show_item.html",
        {
            "request": request,
            "ttl": ttled,
            "xml": xmled,
            "records": recordsed,
            "style_info": htmlfmter.get_style_defs(),
        },
    )
    return response
