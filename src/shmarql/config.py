import os, sqlite3, random, json, logging

log = logging.getLogger("SHMARQL")
handler = logging.StreamHandler()
log.addHandler(handler)


DEBUG = os.environ.get("DEBUG", "0") == "1"
if DEBUG:
    log.setLevel(logging.DEBUG)
    handler.setLevel(logging.DEBUG)
    formatter = logging.Formatter(
        "%(levelname)-9s %(name)s %(asctime)s %(message)s", datefmt="%Y-%m-%d %H:%M:%S"
    )
    handler.setFormatter(formatter)
    log.debug("Debug logging requested from config env DEBUG")
else:
    log.setLevel(logging.INFO)
    log.info("SHMARQL Logging at INFO level")


ENDPOINT = os.environ.get("ENDPOINT")

# ENDPOINTS variable with name|url pairs
ens = os.environ.get("ENDPOINTS", "")

# Split the string into name|url pairs and then further split each pair
ens_pairs = [pair.split("|") for pair in ens.split(" ") if "|" in pair]

# Convert into a dictionary
ENDPOINTS = {name: url for name, url in ens_pairs}

SCHEME = os.environ.get("SCHEME", "http://")
DOMAIN = os.environ.get("DOMAIN", "127.0.0.1")
PORT = os.environ.get("PORT", "5001")
# Note, we can't just build a SITE_URI from the above variables because the
# app might be running behind a reverse proxy
SITE_URI = os.environ.get("SITE_URI", "http://127.0.0.1:8000/")

# This is a mountpoint that will be prefixed to all URIs served by the application
MOUNT = os.environ.get("MOUNT", "/")

QUERIES_DB = os.environ.get("QUERIES_DB", "queries.db")
thequerydb = sqlite3.connect(QUERIES_DB)
thequerydb.executescript(
    """CREATE TABLE IF NOT EXISTS queries (queryhash TEXT, query TEXT, timestamp TEXT, endpoint TEXT, result TEXT, duration FLOAT);
pragma journal_mode=WAL;"""
)

if "DATA_LOAD_PATHS" in os.environ:
    DATA_LOAD_PATHS = os.environ.get("DATA_LOAD_PATHS").split(" ")
else:
    DATA_LOAD_PATHS = []
STORE_PATH = os.environ.get("STORE_PATH")

BIKIDATA_DB = os.environ.get("BIKIDATA_DB")
SEMANTIC_INDEX = os.environ.get("SEMANTIC_INDEX", "0") == "1"
RDF2VEC_INDEX = os.environ.get("RDF2VEC_INDEX", "0") == "1"

FTS_FILEPATH = os.environ.get("FTS_FILEPATH")
RDF2VEC_FILEPATH = os.environ.get("RDF2VEC_FILEPATH")

if FTS_FILEPATH:
    log.exception(
        "FTS_FILEPATH is set, but this config has been removed. Please use BIKIDATA_DB instead. See https://shmarql.com/fizzysearch/ for more information."
    )
    FTS_FILEPATH = None
if RDF2VEC_FILEPATH:
    log.exception(
        "RDF2VEC_FILEPATH is set, but this config has been removed. Please use RDF2VEC_INDEX boolean and BIKIDATA_DB instead. See https://shmarql.com/rdf2vec/ for more information."
    )
    RDF2VEC_FILEPATH = None


SPARQL_QUERY_UI = os.environ.get("SPARQL_QUERY_UI", "1") == "1"

SITE_ID = os.environ.get(
    "SITE_ID", "".join([random.choice("abcdef0123456789") for _ in range(10)])
)

SITEDOCS_PATH = os.environ.get("SITEDOCS_PATH", os.path.join(os.getcwd(), "site"))
SCHPIEL_PATH = os.environ.get("SCHPIEL_PATH")

PREFIXES_FILEPATH = os.environ.get("PREFIXES_FILEPATH")
DEFAULT_PREFIXES = {
    "http://www.w3.org/1999/02/22-rdf-syntax-ns#": "rdf:",
    "http://www.w3.org/2000/01/rdf-schema#": "rdfs:",
    "http://www.w3.org/2002/07/owl#": "owl:",
    "http://schema.org/": "schema:",
    "http://www.wikidata.org/entity/": "wd:",
    "http://www.wikidata.org/entity/statement/": "wds:",
    "http://wikiba.se/ontology#": "wikibase:",
    "http://www.wikidata.org/prop/direct/": "wdt:",
    "http://www.w3.org/2004/02/skos/core#": "skos:",
    "http://purl.org/dc/terms/": "dct:",
    "http://purl.org/dc/elements/1.1/": "dc:",
    "http://dbpedia.org/resource/": "dbr:",
    "https://www.ica.org/standards/RiC/ontology#": "rico:",
    "http://www.w3.org/2003/01/geo/wgs84_pos#": "geo:",
    "http://www.w3.org/ns/shacl#": "sh:",
    "http://www.w3.org/2001/XMLSchema#": "xsd:",
    "http://www.openlinksw.com/virtrdf-data-formats#": "virtrdfdata:",
    "http://www.openlinksw.com/schemas/virtrdf#": "virtrdf:",
    "http://purl.org/spar/fabio/": "fabio:",
    "http://www.w3.org/2003/11/swrl#": "swrl:",
    "http://www.w3.org/ns/dcat#": "dcat:",
    "https://shmarql.com/": "shmarql:",
    "https://database.factgrid.de/entity/": "factgrid:",
}

try:
    if PREFIXES_FILEPATH:
        # also support reading the prefixed from a .ttl file for convenience
        if PREFIXES_FILEPATH.endswith(".ttl"):
            PREFIXES = DEFAULT_PREFIXES
            for line in open(PREFIXES_FILEPATH).readlines():
                if not line.lower().startswith("@prefix "):
                    continue
                if not line.lower().endswith(" .\n"):
                    continue
                line = line.strip("\n .")
                parts = line.split(":")
                if len(parts) < 2:
                    continue
                prefix = parts[0][8:] + ":"
                prefix_uri = ":".join(parts[1:]).strip("<> ")
                if prefix == ":":
                    prefix = " "
                PREFIXES[prefix_uri] = prefix
        else:
            PREFIXES = DEFAULT_PREFIXES | json.load(open(PREFIXES_FILEPATH))
    else:
        PREFIXES = DEFAULT_PREFIXES
except:
    log.exception(f"Problem binding PREFIXES from {PREFIXES_FILEPATH}")

PREFIXES_SNIPPET = "".join(
    f"PREFIX {prefix} <{uri}>\n" for uri, prefix in PREFIXES.items()
)

ADMIN_DATABASE = os.environ.get("ADMIN_DATABASE")

LOGINS = os.environ.get("LOGINS") == "1"

SITE_TITLE = os.environ.get("SITE_TITLE", "SHMARQL")
