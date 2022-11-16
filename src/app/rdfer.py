import json, logging
from .config import PREFIXES_FILEPATH, DEFAULT_PREFIXES

try:
    if PREFIXES_FILEPATH:
        PREFIXES = DEFAULT_PREFIXES | json.load(open(PREFIXES_FILEPATH))
    else:
        PREFIXES = DEFAULT_PREFIXES
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
        self._data = {}
        self._data_prefixed = {}
        self._fields = set()
        self._length = 0
        for row in results:
            self._length += 1
            field = row.get("p")
            value = row.get("o")
            self._fields.add(field["value"])
            self._data.setdefault(field["value"], []).append(value)
            self._data_prefixed.setdefault(prefixes(field["value"]), []).append(value)

    def get(self, key, default=None):
        tmp = self.__getitem__(key)
        if not tmp:
            return default
        return tmp

    def __iter__(self):
        return iter(self._fields)

    def __len__(self):
        return self._length

    def __getitem__(self, key):
        tmp = self._data.get(key)
        if not tmp:
            tmp = self._data_prefixed.get(prefixes(key))
        return tmp

    def __call__(self, field, whole=False):
        tmp = self.__getitem__(field)
        if tmp:
            if whole:
                return tmp[0]
            return prefixes(tmp[0]["value"])


def results_to_triples(results: dict, bind={}):
    buf = []
    if "results" in results and "bindings" in results["results"]:
        for row in results["results"]["bindings"]:
            line = []
            for tmp in ("s", "p", "o"):
                x = row.get(tmp)
                if x is None:
                    line.append(bind.get(tmp, ""))
                else:
                    if x.get("type") == "literal":
                        line.append('"' + x.get("value").replace('"', r"\"") + '"')
                    else:
                        line.append(f'<{x.get("value")}>')
            buf.append(line)
    return buf
