import os, json, logging

DEBUG = os.environ.get("DEBUG", "0") == "1"
ORIGINS = os.environ.get(
    "ORIGINS",
    "http://localhost:8000",
).split(" ")

SECRET_KEY = os.environ.get("SECRET_KEY", "foobarbaz")
ACCESS_TOKEN_EXPIRE_DAYS = int(os.environ.get("ACCESS_TOKEN_EXPIRE_DAYS", "30"))
SP_X509_CERT = os.environ.get("SP_X509_CERT")
SP_CERT_PK = os.environ.get("SP_CERT_PK")
IDP_X509_CERT = os.environ.get("IDP_X509_CERT")
IDP_URI = os.environ.get("IDP_URI")
IDP_ENTITY = os.environ.get("IDP_ENTITY")
SP_ENTITY = os.environ.get("SP_ENTITY")
SITE_URI = os.environ.get("SITE_URI", "http://127.0.0.1:8000/")

DOMAIN = os.environ.get("DOMAIN", "127.0.0.1:8000")
SCHEME = os.environ.get("SCHEME", "http://")
STORE_PATH = os.environ.get("STORE_PATH")
QUERY_DEFAULT_LIMIT = 999
PREFIXES_FILEPATH = os.environ.get("PREFIXES_FILEPATH")
ENDPOINT = os.environ.get("ENDPOINT")
SCHPIEL_PATH = os.environ.get("SCHPIEL_PATH")
SCHPIEL_TOKEN = os.environ.get("SCHPIEL_TOKEN")
FTS_FILEPATH = os.environ.get("FTS_FILEPATH")
RDF2VEC_FILEPATH = os.environ.get("RDF2VEC_FILEPATH")
SBERT_FILEPATH = os.environ.get("SBERT_FILEPATH")
VIRTGRAPH_PATH = os.environ.get("VIRTGRAPH_PATH")
ADMIN = os.environ.get("ADMIN", "admin")
PASSWORD = os.environ.get("PASSWORD", "admin")

# space-separated list of sqlite3 DB files containing sources, in the format:
# CREATE TABLE source (id PRIMARY KEY, last_download, xml) as per the DDB
SHOW_PATHS = os.environ.get("SHOW_PATHS")
if SHOW_PATHS:
    SHOW_PATHS = SHOW_PATHS.split(" ")


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
                prefix_uri = "".join(parts[1:]).strip("<> ")
                if prefix == ":":
                    prefix = " "
                PREFIXES[prefix] = prefix_uri
        else:
            PREFIXES = DEFAULT_PREFIXES | json.load(open(PREFIXES_FILEPATH))
    else:
        PREFIXES = DEFAULT_PREFIXES
except:
    logging.exception(f"Problem binding PREFIXES from {PREFIXES_FILEPATH}")


if "DATA_LOAD_PATHS" in os.environ:
    DATA_LOAD_PATHS = os.environ.get("DATA_LOAD_PATHS").split(" ")
else:
    DATA_LOAD_PATHS = []
TBOX_PATH = os.environ.get("TBOX_PATH")


SERVICE_DESCRIPTION_TITLE = os.environ.get(
    "SERVICE_DESCRIPTION_TITLE", "SPARQL SHMARQL"
)
SERVICE_DESCRIPTION_LABEL = os.environ.get(
    "SERVICE_DESCRIPTION_LABEL", "SPARQL SHMARQL"
)

# See: https://www.w3.org/TR/sparql11-service-description/ and https://www.w3.org/TR/sparql11-entailment/
SERVICE_DESCRIPTION = f"""@prefix sd: <http://www.w3.org/ns/sparql-service-description#> .
        @prefix ent: <http://www.w3.org/ns/entailment/> .
        @prefix dc: <http://purl.org/dc/elements/1.1/> .
        @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
        <{SCHEME}{DOMAIN}/sparql> a sd:Service ;
            rdfs:label "{SERVICE_DESCRIPTION_TITLE}" ;
            dc:description "{SERVICE_DESCRIPTION_LABEL}" ;
            sd:endpoint <{SCHEME}{DOMAIN}/sparql> ;
            sd:supportedLanguage sd:SPARQL11Query ;
            sd:resultFormat <http://www.w3.org/ns/formats/SPARQL_Results_JSON>, <http://www.w3.org/ns/formats/SPARQL_Results_CSV> ;
            sd:feature sd:DereferencesURIs ;
            sd:defaultEntailmentRegime ent:RDF ;
            sd:defaultDataset [
                a sd:Dataset ;
                sd:defaultGraph [
                    a sd:Graph ;
                ] 
            ] ."""

CHATDB_FILEPATH = os.environ.get("CHATDB_FILEPATH")
