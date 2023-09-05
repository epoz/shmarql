from pyoxigraph import (
    NamedNode,
    Literal,
    BlankNode,
    QuerySolutions,
    QueryTriples,
    Store,
    Variable,
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
        if type(self.result) in (QuerySolutions, SynthQuerySolutions):
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
        result = {"head": {"vars": [x.value for x in self.result.variables]}}
        rows = []
        for qs in self.result:
            row = {}
            for var in self.result.variables:
                if qs[var] is not None:
                    row[var.value] = termJSON(qs[var])
            rows.append(row)
        result["results"] = {"bindings": rows}
        return result


class SynthQuerySolutions:
    variables = [Variable("s"), Variable("p"), Variable("o")]

    def __init__(self, triples):
        self.triples = [
            {
                Variable("s"): s,
                Variable("p"): p,
                Variable("o"): o,
            }
            for s, p, o in triples
        ]

    def __iter__(self):
        self.index = 0
        return self

    def __next__(self):
        if self.index >= len(self.triples):
            raise StopIteration
        current_variable = self.triples[self.index]
        self.index += 1
        return current_variable


def results_to_triples(results: dict):
    buf = []
    if "results" in results and "bindings" in results["results"]:
        for row in results["results"]["bindings"]:
            line = []
            for tmp in ("s", "p", "o"):
                x = row.get(tmp)
                if not x is None:
                    if x.get("type") == "literal":
                        datatype = x.get("datatype")
                        if datatype:
                            line.append(
                                Literal(
                                    x.get("value"),
                                    language=x.get("xml:lang"),
                                    datatype=NamedNode(datatype),
                                )
                            )
                        else:
                            line.append(
                                Literal(x.get("value"), language=x.get("xml:lang"))
                            )
                    elif x.get("type") == "uri":
                        line.append(NamedNode(x.get("value")))
                    elif x.get("type") == "bnode":
                        line.append(BlankNode(x.get("value")))
            buf.append(line)
    return buf
