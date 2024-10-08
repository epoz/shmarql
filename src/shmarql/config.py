import os, sqlite3, random
import pyoxigraph as px

DEBUG = os.environ.get("DEBUG", "0") == "1"
ENDPOINT = os.environ.get("ENDPOINT")

ens_names = [x for x in os.environ.get("ENDPOINTS_NAMES", "").split(" ")]
ens = [x for x in os.environ.get("ENDPOINTS", "").split(" ")]
if len(ens) != len(ens_names):
    raise ValueError("ENDPOINTS and ENDPOINTS_NAMES must have the same length")
ENDPOINTS = dict(zip(ens_names, ens))

SCHEME = os.environ.get("SCHEME", "http://")
DOMAIN = os.environ.get("DOMAIN", "127.0.0.1")
PORT = os.environ.get("PORT", "5001")

QUERIES_DB = os.environ.get("QUERIES_DB", "queries.db")
thequerydb = sqlite3.connect(QUERIES_DB)
thequerydb.executescript(
    """CREATE TABLE IF NOT EXISTS queries (queryhash TEXT, query TEXT, timestamp TEXT, endpoint TEXT, result TEXT, duration FLOAT);
pragma journal_mode=WAL;"""
)

FTS_FILEPATH = os.environ.get("FTS_FILEPATH")

CONFIG_STORE = px.Store(os.environ.get("CONFIG_STORE", "config.oxi"))

SITE_ID = os.environ.get(
    "SITE_ID", "".join([random.choice("abcdef0123456789") for _ in range(10)])
)


prefixes = """PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX schema: <http://schema.org/>
PREFIX sh: <http://www.w3.org/ns/shacl#>
PREFIX owl: <http://www.w3.org/2002/07/owl#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
PREFIX shmarql: <https://shmarql.com/>
PREFIX cto: <https://nfdi4culture.de/ontology#>
PREFIX nfdicore: <https://nfdi.fiz-karlsruhe.de/ontology/>
PREFIX factgrid: <https://database.factgrid.de/entity/>
"""

CONFIG_STORE.add(
    px.Quad(
        px.NamedNode(f"https://shmarql.com/site/{SITE_ID}"),
        px.NamedNode("https://shmarql.com/settings/prefixes"),
        px.Literal(prefixes),
        None,
    )
)


def get_setting(key: str, default=""):
    for s, p, o, _ in CONFIG_STORE.quads_for_pattern(
        px.NamedNode(f"https://shmarql.com/site/{SITE_ID}"),
        px.NamedNode(f"https://shmarql.com/settings/{key}"),
        None,
    ):
        return o.value
    return default
