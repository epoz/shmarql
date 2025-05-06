from pyoxigraph import (
    NamedNode,
    Literal,
    BlankNode,
    Quad,
    QuerySolutions,
    QueryTriples,
    Store,
    Variable,
    RdfFormat,
)
from io import BytesIO
import logging
from rdflib.plugins.sparql.results.xmlresults import SPARQLXMLWriter
from xml.sax.xmlreader import AttributesNSImpl
from xml.dom import XML_NAMESPACE
import pandas as pd
from typing import Union
from .config import PREFIXES


def string_iterator(graph: Store):
    for s, p, o, g in graph.quads_for_pattern(None, None, None, None):
        yield (str(s), str(p), str(o), str(g))


class SerializationException(Exception): ...


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
        return {"type": "bnode", "value": term.value}
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
        tmp_store.extend([Quad(s, p, o) for s, p, o in self.result])
        return tmp_store

    def qt_json(self):

        result = {
            "data": self.result.serialize(format=RdfFormat.N_TRIPLES).decode("utf8")
        }
        return result

    def qt_turtle(self):
        tmp_store = self.to_store()
        buf = BytesIO()
        tmp_store.dump(buf, "text/turtle")
        return buf.getvalue().decode("utf8")

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

    def xml(self):
        SPARQL_XML_NAMESPACE = "http://www.w3.org/2005/sparql-results#"
        if type(self.result) in (QuerySolutions, SynthQuerySolutions):
            stream = BytesIO()
            sxw = SPARQLXMLWriter(stream, encoding="utf-8")
            vars = [v.value for v in self.result.variables]
            sxw.write_header(vars)
            sxw.write_results_header()
            for qs in self.result:
                sxw.write_start_result()
                for name in vars:
                    if qs[name] is not None:
                        attr_vals = {
                            (None, "name"): str(name),
                        }
                        attr_qnames = {
                            (None, "name"): "name",
                        }
                        sxw.writer.startElementNS(
                            (SPARQL_XML_NAMESPACE, "binding"),
                            "binding",
                            AttributesNSImpl(attr_vals, attr_qnames),
                        )
                        val = qs[name]
                        if type(val) == NamedNode:
                            sxw.writer.startElementNS(
                                (SPARQL_XML_NAMESPACE, "uri"),
                                "uri",
                                AttributesNSImpl({}, {}),
                            )
                            sxw.writer.characters(val.value)
                            sxw.writer.endElementNS(
                                (SPARQL_XML_NAMESPACE, "uri"), "uri"
                            )
                        elif type(val) == BlankNode:
                            sxw.writer.startElementNS(
                                (SPARQL_XML_NAMESPACE, "bnode"),
                                "bnode",
                                AttributesNSImpl({}, {}),
                            )
                            sxw.writer.characters(val.value)
                            sxw.writer.endElementNS(
                                (SPARQL_XML_NAMESPACE, "bnode"), "bnode"
                            )
                        elif type(val) == Literal:
                            attr_vals = {}
                            attr_qnames = {}
                            if val.language:
                                attr_vals[(XML_NAMESPACE, "lang")] = val.language
                                attr_qnames[(XML_NAMESPACE, "lang")] = "xml:lang"
                            elif val.datatype:
                                attr_vals[(None, "datatype")] = val.datatype.value
                                attr_qnames[(None, "datatype")] = "datatype"

                            sxw.writer.startElementNS(
                                (SPARQL_XML_NAMESPACE, "literal"),
                                "literal",
                                AttributesNSImpl(attr_vals, attr_qnames),
                            )
                            sxw.writer.characters(val.value)
                            sxw.writer.endElementNS(
                                (SPARQL_XML_NAMESPACE, "literal"), "literal"
                            )

                        sxw.writer.endElementNS(
                            (SPARQL_XML_NAMESPACE, "binding"), "binding"
                        )

                sxw.write_end_result()
            sxw.close()
            return stream.getvalue().decode("utf8")


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


def results_to_triples(results: dict, vars: dict):
    buf = []
    if "results" in results and "bindings" in results["results"]:
        for row in results["results"]["bindings"]:
            line = []
            for tmp in ("s", "p", "o"):
                x = row.get(tmp)
                if not x is None:
                    if x.get("type") in ("literal", "typed-literal"):
                        if tmp == "p":
                            logging.debug(f"Bogus literal as predicate: {x}")
                            line.append(
                                NamedNode(
                                    "http://bogus_literal_as_predicate_from_endpoint/"
                                )
                            )
                            continue

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
                            continue
                    elif x.get("type") == "uri":
                        line.append(NamedNode(x.get("value")))
                        continue
                    elif x.get("type") == "bnode":
                        line.append(BlankNode(x.get("value")))
                        continue
                if vars.get(tmp) != "?" + tmp:
                    varvalue = vars.get(tmp)
                    if varvalue.startswith("<"):
                        line.append(NamedNode(varvalue.strip("<>")))
                        continue
                    elif varvalue.startswith("_"):
                        line.append(BlankNode(varvalue[1:]))
                        continue
                    else:
                        line.append(Literal(varvalue))
                        continue
            buf.append(line)
    return buf


def results_to_xml(results: dict) -> str:
    SPARQL_XML_NAMESPACE = "http://www.w3.org/2005/sparql-results#"
    stream = BytesIO()
    sxw = SPARQLXMLWriter(stream, encoding="utf-8")
    vars = results.get("head", {}).get("vars", [])
    sxw.write_header(vars)
    sxw.write_results_header()
    for qs in results.get("results", {}).get("bindings", []):
        sxw.write_start_result()
        for name in vars:
            if qs.get(name) is not None:
                attr_vals = {
                    (None, "name"): name,
                }
                attr_qnames = {
                    (None, "name"): "name",
                }
                sxw.writer.startElementNS(
                    (SPARQL_XML_NAMESPACE, "binding"),
                    "binding",
                    AttributesNSImpl(attr_vals, attr_qnames),
                )
                val = qs.get(name)
                if val.get("type") == "uri":
                    sxw.writer.startElementNS(
                        (SPARQL_XML_NAMESPACE, "uri"),
                        "uri",
                        AttributesNSImpl({}, {}),
                    )
                    sxw.writer.characters(val.get("value"))
                    sxw.writer.endElementNS((SPARQL_XML_NAMESPACE, "uri"), "uri")
                elif val.get("type") == "bnode":
                    sxw.writer.startElementNS(
                        (SPARQL_XML_NAMESPACE, "bnode"),
                        "bnode",
                        AttributesNSImpl({}, {}),
                    )
                    sxw.writer.characters(val.get("value"))
                    sxw.writer.endElementNS((SPARQL_XML_NAMESPACE, "bnode"), "bnode")
                elif type(val) == "literal":
                    attr_vals = {}
                    attr_qnames = {}
                    if val.get("xml:lang"):
                        attr_vals[(XML_NAMESPACE, "lang")] = val.get("xml:lang")
                        attr_qnames[(XML_NAMESPACE, "lang")] = "xml:lang"
                    elif val.get("datatype"):
                        attr_vals[(None, "datatype")] = val.get("datatype")
                        attr_qnames[(None, "datatype")] = "datatype"

                    sxw.writer.startElementNS(
                        (SPARQL_XML_NAMESPACE, "literal"),
                        "literal",
                        AttributesNSImpl(attr_vals, attr_qnames),
                    )
                    sxw.writer.characters(val.get("value"))
                    sxw.writer.endElementNS(
                        (SPARQL_XML_NAMESPACE, "literal"), "literal"
                    )

                sxw.writer.endElementNS((SPARQL_XML_NAMESPACE, "binding"), "binding")

        sxw.write_end_result()
    sxw.close()
    return stream.getvalue().decode("utf8")


def results_to_df(results: dict) -> pd.DataFrame:
    data = {}
    vars = results.get("head", {}).get("vars", [])
    for row in results.get("results", {}).get("bindings", []):
        for var in vars:
            val = row.get(var)
            data.setdefault(var, []).append(val.get("value") if val else None)
    # this loses the type of the item in the results!
    return pd.DataFrame(data)


def do_prefixes(iris: Union[str, list]):
    """Given a list of IRI values, return a string with the IRIs prefixed"""
    if isinstance(iris, str):
        iris = [iris]
    buf = []
    for iri in iris:
        found = False
        for uri, prefix in PREFIXES.items():
            if iri.startswith(uri):
                buf.append(f"{prefix}{iri[len(uri):]}")
                found = True
        if not found:
            buf.append(iri)
    return " ".join(buf)
