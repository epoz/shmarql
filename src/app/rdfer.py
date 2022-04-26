import json, logging
from .config import PREFIXES_FILEPATH

try:
    if PREFIXES_FILEPATH:
        PREFIXES = json.load(open(PREFIXES_FILEPATH))
    else:
        PREFIXES = {}
except:
    logging.exception(f"Problem binding PREFIXES from {PREFIXES_FILEPATH}")


def prefixes(value):
    vv = value.lower()
    for uri, prefix in PREFIXES.items():
        replaced = vv.replace(uri, prefix)
        if replaced != vv:
            return replaced
        replaced = vv.replace(prefix, uri)
        if replaced != vv:
            return replaced
    return value


class RDFer:
    def __init__(self, results):
        self.data = {}
        for row in results:
            field = row.get("p")
            value = row.get("o")
            self.data.setdefault(field["value"], []).append(value)
            self.data.setdefault(prefixes(field["value"]), []).append(value)

    def get(self, key, default=None):
        tmp = self.__getitem__(key)
        if not tmp:
            return default
        return tmp

    def __getitem__(self, key):
        tmp = self.data.get(key)
        if not tmp:
            tmp = self.data.get(prefixes(key))
        return tmp

    def __call__(self, field, whole=False):
        tmp = self.__getitem__(field)
        if tmp:
            if whole:
                return tmp[0]
            return prefixes(tmp[0]["value"])
