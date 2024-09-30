import os

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
