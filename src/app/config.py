import os

DEBUG = os.environ.get("DEBUG", "0") == "1"
ORIGINS = os.environ.get(
    "ORIGINS",
    "http://localhost:8000",
).split(" ")

DOMAIN = os.environ.get("DOMAIN", "localhost")
STORE_PATH = os.environ.get("STORE_PATH")
QUERY_DEFAULT_LIMIT = 999
PREFIXES_FILEPATH = os.environ.get("PREFIXES_FILEPATH", {})


if "DATA_LOAD_PATHS" in os.environ:
    DATA_LOAD_PATHS = os.environ.get("DATA_LOAD_PATHS").split(" ")
else:
    DATA_LOAD_PATHS = []

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
