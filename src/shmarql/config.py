import os, sqlite3

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
