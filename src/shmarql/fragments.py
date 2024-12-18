from urllib.parse import quote
from fasthtml.common import *
from .main import app, BTN_STYLE
from .config import MOUNT
from .qry import do_query


def make_spo(uri: str, spo: str, encode=True, limit=999):
    uri = f"<{uri}>"
    tp = dict([(c, f"?{c}") for c in "spo"])
    if spo not in ("s", "p", "o"):
        return f"select ?s ?p ?o where {{ ?s ?p ?o }} limit {limit}"
    vars = tp.copy()
    vars[spo] = ""
    tp[spo] = uri
    vars = " ".join([vars[c] for c in "spo"])
    tp = " ".join([tp[c] for c in "spo"])
    Q = f"select {vars} where {{ {tp} }} limit {limit}"
    if encode:
        return quote(Q)
    else:
        return Q


@app.post(f"/shmarql/fragments/sparql")
@app.post(f"{MOUNT}shmarql/fragments/sparql")
def fragments_sparql(query: str):
    if query == "":
        query = "select * where {?s ?p ?o} limit 10"
    results = do_query(query)
    if "data" in results:  # this was a construct query
        return Div(Pre(results["data"]))
    if "error" in results:
        return (
            Div(
                "This query did not work.",
                A(
                    "Click here to see the details of error message",
                    href="#",
                    onclick="document.getElementById('error').style.display = 'block';",
                ),
                Div(results["error"], id="error", style="display:none"),
                style="max-height: 30vh; overflow: auto;",
            ),
        )
    return build_plain_table(results, query)


def build_plain_table(results: dict, query: str):
    table_rows = []
    heads = [Th(" ")]
    heads.extend(
        [
            Th(var, style="font-weight: bold")
            for var in results.get("head", {}).get("vars", [])
        ]
    )
    rownum = 0
    for row in results.get("results", {}).get("bindings", []):
        rownum += 1
        row_columns = []
        row_columns.append(
            Td(
                rownum,
                style="padding-right: 0.75ch; font-size: 75%; color: #aaa; text-align: right;",
            )
        )
        for var in results.get("head", {}).get("vars", []):
            value = row.get(var, {"value": ""})
            if value.get("type") == "uri":
                S_query = make_spo(value["value"], "s")

                row_columns.append(
                    Td(
                        A(
                            value["value"],
                            href=make_spo(value["value"], "s"),
                            style="margin-left: 1ch",
                        )
                    )
                )
            elif value.get("type") == "bnode":
                row_columns.append(
                    Td(
                        Span(
                            value["value"], style="font-size: 80%; font-style: italic"
                        ),
                    )
                )
            else:
                lang = (
                    Span(
                        value.get("xml:lang"),
                        style="font-size: 80%; vertical-align: super;",
                    )
                    if "xml:lang" in value
                    else None
                )

                row_columns.append(
                    Td(Span(value["value"], style="margin-left: 1ch"), lang)
                )
        table_rows.append(Tr(*row_columns))
    cached = " (from cache) " if results.get("cached") else ""

    duration_display = (
        f"{int(results.get('duration', 0) * 1000)}ms"
        if results.get("duration", 0) < 1
        else f"{results.get('duration', 0):.3f}s"
    )

    return Div(
        P(
            f"{len(results.get('results', {}).get('bindings', []))} results in {duration_display}{cached}",
            style="font-size: 50%;",
            title="used: " + results.get("endpoint_name", ""),
        ),
        Table(Thead(Tr(*heads)), Tbody(*table_rows), data_tipe="sparql-results"),
    )


def build_standalone_table(results, query):
    table_rows = []
    heads = [Th(" ")]
    heads.extend(
        [
            Th(var, style="font-weight: bold")
            for var in results.get("head", {}).get("vars", [])
        ]
    )
    table_rows.append(Tr(*heads))

    rownum = 0
    for row in results.get("results", {}).get("bindings", []):
        rownum += 1
        row_columns = []
        row_columns.append(
            Td(
                rownum,
                style="padding-right: 0.75ch; font-size: 75%; color: #aaa; text-align: right;",
            )
        )
        for var in results.get("head", {}).get("vars", []):
            value = row.get(var, {"value": ""})
            if value.get("type") == "uri":
                S_query = make_spo(value["value"], "s")
                P_query = make_spo(value["value"], "p")
                O_query = make_spo(value["value"], "o")

                # do some fizzy for factgrid
                if value["value"].find("database.factgrid.de") > -1:
                    fizzy_query = quote(
                        f"""select distinct ?s (STR(?o) AS ?oLabel) where {{
  ?s fizzy:rdf2vec <{value['value']}> . 
  ?s rdfs:label ?o .
}}
    """
                    )
                    fizzyquery = A(
                        "✨",
                        href="/sparql?query=" + fizzy_query,
                        title="Show items similar to this entity using fizzysearch",
                    )
                else:
                    fizzyquery = None

                row_columns.append(
                    Td(
                        A(
                            "S",
                            href=f"{MOUNT}shmarql?query={S_query}",
                            style="font-size: 80%; background-color: #ddd; color: #000; padding: 3px; text-decoration: none; margin: 0",
                        ),
                        A(
                            "P",
                            href=f"{MOUNT}shmarql?query={P_query}",
                            style="font-size: 80%; background-color: #ddd; color: #000; padding: 3px; text-decoration: none; margin: 0",
                        ),
                        A(
                            "O",
                            href=f"{MOUNT}shmarql?query={O_query}",
                            style="font-size: 80%; background-color: #ddd; color: #000; padding: 3px; text-decoration: none; margin: 0",
                        ),
                        A(
                            value["value"],
                            href=value["value"],
                            style="margin-left: 1ch",
                        ),
                        fizzyquery,
                        cls="border border-gray-300 px-4 py-2 text-sm",
                    )
                )
            elif value.get("type") == "bnode":
                row_columns.append(
                    Td(
                        Span(
                            value["value"], style="font-size: 80%; font-style: italic"
                        ),
                        cls="border border-gray-300 px-4 py-2 text-sm",
                    )
                )
            else:
                o_link = A(
                    "O",
                    href=f"{MOUNT}shmarql?query={make_literal_query(value)}",
                    style="font-size: 80%; background-color: #ddd; color: #000; padding: 3px; text-decoration: none; margin: 0",
                )
                lang = (
                    Span(
                        value.get("xml:lang"), cls="text-xs bg-gray-200 text-black px-2"
                    )
                    if "xml:lang" in value
                    else None
                )

                row_columns.append(
                    Td(
                        o_link,
                        Span(value["value"], style="margin-left: 1ch"),
                        lang,
                        cls="border border-gray-300 px-4 py-2 text-sm",
                    )
                )
        table_rows.append(Tr(*row_columns, cls="hover:bg-gray-50"))
    cached = " (from cache) " if results.get("cached") else ""

    duration_display = (
        f"{int(results.get('duration', 0) * 1000)}ms"
        if results.get("duration", 0) < 1
        else f"{results.get('duration', 0):.3f}s"
    )

    return Div(
        Div(
            Span(
                f"{len(results.get('results', {}).get('bindings', []))} results in {duration_display}{cached}",
                title="used: " + results.get("endpoint_name", ""),
            ),
            A(
                "CSV",
                title="Download as CSV",
                href=f"{MOUNT}shmarql?query={quote(query)}&format=csv",
                cls=BTN_STYLE,
            ),
            A(
                "JSON",
                title="Download as JSON",
                href=f"{MOUNT}shmarql?query={quote(query)}&format=json",
                cls=BTN_STYLE,
            ),
            cls="bg-slate-200 text-black p-2 flex flex-row gap-1 text-xs",
        ),
        Table(
            *table_rows,
            cls="min-w-full table-auto border-collapse border border-gray-300",
        ),
    )
