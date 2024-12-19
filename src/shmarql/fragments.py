from urllib.parse import quote
from fasthtml.common import *
from .main import app
from .config import MOUNT, PREFIXES_SNIPPET, PREFIXES

from .qry import do_query

BTN_STYLE = "bg-slate-300 hover:bg-slate-400 text-black px-2 rounded-lg shadow-xl transition duration-300 font-bold"


class HashableResult:
    def __init__(self, value):
        self.value = value

    def __hash__(self):
        # Custom hash function
        return hash(self.value.get("value"))

    def __eq__(self, other):
        return isinstance(other, HashableResult) and self.value.get(
            "value"
        ) == other.value.get("value")

    def __lt__(self, other):
        return self.value.get("value") < other.value.get("value")

    def __gt__(self, other):
        return self.value.get("value") > other.value.get("value")

    def __getitem__(self, key):
        return self.value[key]

    def __setitem__(self, key, value):
        self.value[key] = value

    def __delitem__(self, key):
        del self.value[key]

    def __iter__(self):
        return iter(self.value)

    def __len__(self):
        return len(self.value)

    def __contains__(self, key):
        return key in self.value

    def __repr__(self):
        return str(self.value.get("value"))


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
def fragments_sparql(query: str, results=None):
    if query == "":
        query = "select * where {?s ?p ?o} limit 10"
    if results is None:
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
    return build_plain_table(query, results)


def build_plain_table(query: str, results: dict):
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


def fragments_resource(results):
    """Assuming that in results is a query:
    SELECT ?p ?o ?pp ?oo WHERE {
      <some_uri> ?p ?o .
      optional {
        ?o ?pp ?oo .
      }
    }
        Where <some_uri> is the resource we are looking at.
    """
    data = {}
    seconds = {}
    for row in results.get("results", {}).get("bindings", []):
        o_object = HashableResult(row.get("o", {}))
        data.setdefault(row.get("p", {}).get("value"), set()).add(o_object)
        if row.get("pp"):
            seconds.setdefault(o_object, {}).setdefault(
                row.get("pp", {}).get("value"), set()
            ).add(HashableResult(row.get("oo", {})))

    # now make the values into lists for easier handling
    for k, v in data.items():
        data[k] = list(sorted(v))
    for k, v in seconds.items():
        for kk, vv in v.items():
            seconds[k][kk] = list(sorted(vv))

    buf = []
    ba = buf.append
    skip_fields = []
    for title_field in (
        "https://schema.org/name",
        "http://www.w3.org/2000/01/rdf-schema#label",
    ):
        if title_field in data:
            title = list(data[title_field])[0]
            ba(H1(title, title=title_field))
            skip_fields.append(title_field)
            break

    rdf_type = data.get("http://www.w3.org/1999/02/22-rdf-syntax-ns#type")
    if rdf_type:
        skip_fields.append("http://www.w3.org/1999/02/22-rdf-syntax-ns#type")
        rdf_types = [
            Span(do_prefixes(str(x)), style="margin-right: 0.5em") for x in rdf_type
        ]

        ba(P("a ", *rdf_types, style="font-style: italic;"))

    schema_logo = data.get("https://schema.org/logo")
    if schema_logo:
        skip_fields.append("https://schema.org/logo")
        for i in schema_logo:
            ba(Img(src=i["value"], style="max-width: 100%;"))

    for field, val in data.items():
        if field in skip_fields:
            continue
        v_label_list = []
        for v in val:
            if v in seconds:
                v_label = seconds[v].get(
                    "http://www.w3.org/2000/01/rdf-schema#label", [str(v)]
                )
                v_type = seconds[v].get(
                    "http://www.w3.org/1999/02/22-rdf-syntax-ns#type"
                )
                if v["type"] == "uri":
                    v_label_list.append(
                        A(v_label[0], href=v["value"], style="margin-right: 1em")
                    )
                else:
                    if v_type:
                        v_label_list.append(
                            Span(v_label[0], title=v_type[0], style="margin-right: 1em")
                        )
                    else:
                        v_label_list.append(Span(v_label[0], style="margin-right: 1em"))
            else:
                v_label_list.append(Span(v["value"]))
        ba(
            (
                H3(do_prefixes(field), style="margin: 0.5em 0 0 0"),
                P(
                    *[vv for vv in v_label_list],
                    style="font-size: 120%; margin: 0",
                ),
            )
        )
    return tuple(buf)


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


# See: https://www.chartjs.org/docs/latest/getting-started/integration.html
@app.get(f"{MOUNT}shmarql/fragments/chart")
def fragments_chart(query: str):
    return """
<div>
  <canvas id="myChart"></canvas>
</div>

<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

<script>
  const ctx = document.getElementById('myChart');

  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: [
    'Abstract, Non-representational Art',
    'Religion and Magic',
    'Nature',
    'Human Being, Man in General',
    'Society, Civilization, Culture',
    'Abstract Ideas and Concepts',
    'History',
    'Bible',
    'Literature',
    'Classical Mythology and Ancient History'
],
      datasets: [{
        label: "ICONCLASS",
        data: [13, 189234, 397281, 370052, 801637, 67315, 162090, 129660, 48452, 80144],
        borderWidth: 1
      }]
    }
  });
</script>
"""


def build_sparql_ui(query, results):
    settings = results.get("shmarql_settings", {})
    if "hide" in settings.get("editor", []):
        sparql_editor_block_style_button = (
            Button(
                "SPARQL",
                Script(
                    """me().on("click", async ev => {me(ev).fadeOut(); me('#sparql_editor_block').style.display = 'block'})"""
                ),
                style="padding: 4px 8px; font-size: 12px;",
                cls="md-button md-button--primary",
            ),
            Script(
                "setTimeout(() => {me('#sparql_editor_block').style.display = 'none'}, 500 )"
            ),
        )
    else:
        sparql_editor_block_style_button = None

    if "resource" in settings.get("view", []):
        results_fragment = Div(fragments_resource(results), cls="md-typeset")
    else:
        results_fragment = Div(fragments_sparql(query, results), cls="md-typeset")

    return (
        Script(src="/shmarql/static/editor.js"),
        Script(src="/shmarql/static/matchbrackets.js"),
        Script(src="/shmarql/static/sparql.js"),
        Script(src="/shmarql/static/surreal-1.3.0.js"),
        Script(src="/shmarql/static/tablesort-5.3.0.min.js"),
        sparql_editor_block_style_button,
        Div(
            Button(
                "▶",
                Script(
                    'me().on("click", async ev => {\r\n  if (ev.shiftKey) {\r\n    console.log("Shift key was pressed during the click!");\r\n  }\r\n  executeQuery()\r\n})'
                ),
                id="execute_sparql",
                title="Execute this query, (also use Ctrl+Enter)",
                style="padding: 4px 8px; font-size: 12px;",
                cls="md-button md-button--primary",
            ),
            Button(
                "Prefixes",
                Script(
                    'me().on("click", async ev => {\n\n    let editorContent = sparqleditor.doc.getValue();\r\n    let prefixContent = `'
                    + PREFIXES_SNIPPET
                    + "\n\n`;\r\nsparqleditor.doc.setValue(prefixContent + editorContent);\r\n\r\n})"
                ),
                id="prefixes",
                name="prefixes",
                style="padding: 4px 8px; font-size: 12px;",
                cls="md-button md-button--primary",
            ),
            Div(Textarea(query, id="code", name="code")),
            id="sparql_editor_block",
        ),
        Div(
            results_fragment,
            id="results",
            style="margin-top: 2vh;",  # max-height: 50vh; overflow-y: scroll
        ),
        Script(
            'const link = document.createElement("link");\r\n  link.rel = "stylesheet";\r\n  link.href = "/shmarql/static/codemirror.css";\r\n  document.head.appendChild(link);\r\n\r\n\r\ndocument.addEventListener("DOMContentLoaded", function () {\r\n  sparqleditor = CodeMirror.fromTextArea(document.getElementById("code"), {\r\n    mode: "application/sparql-query",\r\n    matchBrackets: true,\r\n    lineNumbers: true,\r\n  });\r\n  results = document.getElementById("results");\r\n});\r\n\r\nfunction executeQuery() {  \r\n    let the_query = sparqleditor.doc.getValue();    \r\n    results.innerHTML = \'<div aria-busy="true">Loading...</div>\';\r\n    history.pushState({ query: the_query }, "", "shmarql?query=" + encodeURIComponent(the_query));\r\n    queryStarted = Date.now();\r\n    progress_counter = setTimeout(updateProgress, 1000);\r\n    fetch(`/shmarql/fragments/sparql`, {\r\n        method: "POST",\r\n        headers: {\r\n            "Content-Type": "application/x-www-form-urlencoded"\r\n        },\r\n        body: `query=${encodeURIComponent(the_query)}`\r\n    }).then(response => response.text()).then(data => {        \r\n        if(progress_counter) {\r\n            clearTimeout(progress_counter);\r\n        }\r\n        results.innerHTML = data;\r\n        var tables = document.querySelectorAll("table[data-tipe=\'sparql-results\']");\r\n        tables.forEach(function(table) {            \r\n                new Tablesort(table)            \r\n        })        \r\n    })\r\n\r\n}\r\n\r\nfunction updateProgress() {\r\n    let progress = Math.round((Date.now() - queryStarted) / 1000);\r\n    results.innerHTML = `<div aria-busy="true">Query in progress, took ${progress}s so far...</div>`;\r\n    progress_counter = setTimeout(updateProgress, 1000);\r\n}\r\n\r\ndocument.body.addEventListener("keypress", function (evt) {\r\n    if (evt.ctrlKey && evt.key === "Enter") {\r\n        evt.preventDefault();\r\n        executeQuery()\r\n    }\r\n});'
        ),
    )
