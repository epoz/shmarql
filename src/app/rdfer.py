import json, logging
from .config import PREFIXES
import pyoxigraph as px
from markupsafe import Markup


def prefixes(value):
    for uri, prefix in PREFIXES.items():
        replaced = value.replace(uri, prefix)
        if replaced != value:
            return replaced
        replaced = value.replace(prefix, uri)
        if replaced != value:
            return replaced
    return value


class Nice:
    def __init__(self, graph: px.Store, uris: iter):
        self.data = {}
        if graph is None:
            return
        gathered_o_uris = set()
        for uri in uris:
            if type(uri) not in (px.NamedNode, px.BlankNode):
                continue
            for s, p, o, _ in graph.quads_for_pattern(uri, None, None):
                self.data.setdefault(s.value, {}).setdefault(p.value, []).append(
                    o.value
                )
                if type(o) in (px.NamedNode, px.BlankNode):
                    gathered_o_uris.add(o)
        for uri in gathered_o_uris:
            for s, p, o, _ in graph.quads_for_pattern(uri, None, None):
                self.data.setdefault(s.value, {}).setdefault(p.value, []).append(
                    o.value
                )

    def s(self, uri):
        D = self.data.get(uri, {})
        for d in [
            "http://www.w3.org/2000/01/rdf-schema#label",
            "http://schema.org/name",
            "http://www.w3.org/2004/02/skos/core#prefLabel",
        ]:
            dd = D.get(d)
            if dd:
                return dd[0]
        return prefixes(uri)

    def iiif(self, uri):
        D = self.data.get(uri, {})
        for s in D.get("http://rdfs.org/sioc/services#has_service", []):
            DD = self.data.get(s, {})
            if "http://iiif.io/api/image/3#ImageService" in DD.get(
                "http://www.w3.org/1999/02/22-rdf-syntax-ns#type", []
            ):
                iuri = s + "/full/,200/0/default.jpg"
                return Markup(f"<img src='{iuri}'/>")
        return ""


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
            if field:
                self._fields.add(field["value"])
                self._data.setdefault(field["value"], []).append(value)
                self._data_prefixed.setdefault(prefixes(field["value"]), []).append(
                    value
                )

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
