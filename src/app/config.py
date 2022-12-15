import os

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

STORE = os.environ.get("STORE", "oxigraph")
DOMAIN = os.environ.get("DOMAIN", "127.0.0.1:8000")
STORE_PATH = os.environ.get("STORE_PATH")
QUERY_DEFAULT_LIMIT = 999
PREFIXES_FILEPATH = os.environ.get("PREFIXES_FILEPATH")
ENDPOINT = os.environ.get("ENDPOINT", "/sparql")
SCHPIEL_PATH = os.environ.get("SCHPIEL_PATH")
FTS_FILEPATH = os.environ.get("FTS_FILEPATH")

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
}


if "DATA_LOAD_PATHS" in os.environ:
    DATA_LOAD_PATHS = os.environ.get("DATA_LOAD_PATHS").split(" ")
    if not ENDPOINT:
        ENDPOINT = "http://localhost:8000/sparql"
else:
    DATA_LOAD_PATHS = []
TBOX_PATH = os.environ.get("TBOX_PATH")


SERVICE_DESCRIPTION_TITLE = os.environ.get(
    "SERVICE_DESCRIPTION_TITLE", "SPARQL SCHMARQL"
)
SERVICE_DESCRIPTION_LABEL = os.environ.get(
    "SERVICE_DESCRIPTION_LABEL", "SPARQL SCHMARQL"
)

# See: https://www.w3.org/TR/sparql11-service-description/ and https://www.w3.org/TR/sparql11-entailment/
SERVICE_DESCRIPTION = f"""@prefix sd: <http://www.w3.org/ns/sparql-service-description#> .
        @prefix ent: <http://www.w3.org/ns/entailment/> .
        @prefix dc: <http://purl.org/dc/elements/1.1/> .
        @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
        <https://{DOMAIN}/sparql> a sd:Service ;
            rdfs:label "{SERVICE_DESCRIPTION_TITLE}" ;
            dc:description "{SERVICE_DESCRIPTION_LABEL}" ;
            sd:endpoint <https://{DOMAIN}/sparql> ;
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
