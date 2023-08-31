from pyoxigraph import (
    NamedNode,
    Literal,
    BlankNode,
    QuerySolutions,
    QueryTriples,
    Store,
)
from io import BytesIO


class SerializationException(Exception):
    ...


def termJSON(term):
    if isinstance(term, NamedNode):
        return {"type": "uri", "value": term.value}
    elif isinstance(term, Literal):
        r = {"type": "literal", "value": term.value}
        if (
            term.datatype is not None
            and term.datatype.value != "http://www.w3.org/2001/XMLSchema#string"
        ):
            r["datatype"] = term.datatype.value
        if term.language is not None:
            r["xml:lang"] = term.language
        return r
    elif isinstance(term, BlankNode):
        return {"type": "bnode", "value": str(term)}
    elif term is None:
        return None
    else:
        raise SerializationException("Unknown term type: %s (%s)" % (term, type(term)))


class OxigraphSerialization:
    def __init__(self, result):
        self.result = result

    def json(self):
        if type(self.result) is QuerySolutions:
            return self.qr_json()
        elif type(self.result) == QueryTriples:
            return self.qt_json()

    def to_store(self) -> Store:
        tmp_store = Store()
        for quad in self.result:
            tmp_store.add(quad)
        return tmp_store

    def qt_json(self):
        return [map(termJSON, a) for a in self.result]

    def qt_turtle(self):
        tmp_store = self.to_store()
        buf = BytesIO()
        tmp_store.dump(buf, "text/turtle")
        return buf.getvalue().encode("utf8")

    def qr_json(self):
        result = {"head": {"vars": [str(x) for x in self.result.variables]}}
        rows = []
        for qs in self.result:
            row = {}
            for var in self.result.variables:
                if qs[var] is not None:
                    row[str(var)] = termJSON(qs[var])
            rows.append(row)
        result["results"] = {"bindings": rows}
        return result
