from urllib.parse import quote
import random, json
from fasthtml.common import *
from monsterui.all import *

from .config import MOUNT, PREFIXES_SNIPPET, PREFIXES
from uuid import uuid4

from plotly.io import to_json
from .px_util import results_to_df, do_prefixes
import traceback
from .charts import do_barchart, do_piechart, do_mapchart

rt = APIRouter()

from .qry import do_query

BTN_STYLE = "bg-slate-300 hover:bg-slate-400 text-black px-2 rounded-lg shadow-xl transition duration-300 font-bold"


class HashableResult:
    """
    This class is used to make the results of a SPARQL query hashable.
    Convenience that you can then add them to a set or dict, or sort them.
    """

    def __init__(self, value):
        self.value = value

    def __hash__(self):
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


def make_resource_query(uri: str, encode=True, limit=999):
    Q = f"""
# shmarql-view: resource
# shmarql-editor: hide

SELECT ?resource ?p ?o ?pp ?oo WHERE {{
    values ?resource {{ <{uri}> }}

  ?resource ?p ?o .
  OPTIONAL {{
    ?o ?pp ?oo .
  }}
}}  limit {limit}"""

    if encode:
        return quote(Q)
    else:
        return Q


def make_spo(uri: str, spo: str, encode=True, limit=999, extra=""):
    uri = f"<{uri}>"
    if spo not in ("s", "p", "o"):
        return f"select ?s ?p ?o where {{ ?s ?p ?o }} limit {limit}"

    if spo == "s":
        tolabel = "o"
    else:
        tolabel = "s"

    Q = f"""{extra}select ?s ?p ?o ?{tolabel}label where {{ 
  values ?{spo} {{ {uri} }} 
  ?s ?p ?o .
  optional {{
    ?{tolabel} rdfs:label ?{tolabel}label .    
  }}
  
}} limit {limit}"""

    if encode:
        return quote(Q)
    else:
        return Q


@rt.post(f"/shmarql/fragments/sparql")
@rt.post(f"{MOUNT}shmarql/fragments/sparql")
def fragments_sparql(query: str, results=None):
    if query == "":
        query = "select * where {?s ?p ?o} limit 10"
    if results is None:
        results = do_query(query)

    settings = results.get("shmarql_settings", {})

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

    if "resource" in settings.get("view", []):
        return Html(fragments_resource(results, query))
    if settings.get("view", [""])[0].endswith("chart"):
        return Html(fragments_chart(query))
    else:
        return Html(build_plain_table(query, results))


def build_plain_table(query: str, results: dict):
    table_rows = []
    heads = [Th("#", style="color: #aaa; text-align: right;")]
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
                style="color: #aaa; text-align: right;",
            )
        )
        for var in results.get("head", {}).get("vars", []):
            value = row.get(var, {"value": ""})
            if value.get("type") == "uri":
                S_query = make_spo(value["value"], "s")
                P_query = make_spo(value["value"], "p")
                O_query = make_spo(value["value"], "o")

                nonce = random.randint(0, pow(2, 32))

                if var in ("s", "p", "o"):
                    var_spo = var
                else:
                    var_spo = "s"

                row_columns.append(
                    Td(
                        A(
                            do_prefixes(value["value"]),
                            href=f"{MOUNT}shmarql/?query="
                            + make_resource_query(value["value"]),
                        ),
                        Div(
                            A(
                                "S",
                                href=f"{MOUNT}shmarql/?query={S_query}",
                                style="font-size: 70%; background-color: #ddd; color: #000; padding: 3px; text-decoration: none; margin: 0",
                            ),
                            A(
                                "P",
                                href=f"{MOUNT}shmarql/?query={P_query}",
                                style="font-size: 70%; background-color: #ddd; color: #000; padding: 3px; text-decoration: none; margin: 0",
                            ),
                            A(
                                "O",
                                href=f"{MOUNT}shmarql/?query={O_query}",
                                style="font-size: 70%; background-color: #ddd; color: #000; padding: 3px; text-decoration: none; margin: 0",
                            ),
                            style="font-size: 80%; display: inline-block; margin-left: 0.5em;",
                        ),
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

                row_columns.append(Td(Span(value["value"]), lang))
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


def fragments_resource(results: dict, query: str):
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
        "http://www.w3.org/2004/02/skos/core#prefLabel",
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
            A(
                do_prefixes(str(x)),
                href=f"{MOUNT}shmarql/?query=" + make_spo(x, "o"),
                style="margin-right: 0.5em",
            )
            for x in rdf_type
        ]

        ba(P("a ", *rdf_types, style="font-style: italic;"))

    for description_field in (
        "https://schema.org/description",
        "http://schema.org/description",
    ):
        sdo_description = data.get(description_field)
        if sdo_description:
            ba(P(sdo_description[0]["value"]))
            skip_fields.append(description_field)

    for image_field in (
        "https://schema.org/logo",
        "https://schema.org/image",
        "http://schema.org/logo",
        "http://schema.org/image",
    ):
        an_image = data.get(image_field)
        if an_image:
            for i in an_image:
                ba(Img(src=i["value"], style="max-width: 100%;"))

    for field, val in data.items():
        if field in skip_fields:
            continue
        v_label_list = []
        for v in val[:50]:

            if v in seconds:
                v_label = seconds[v].get(
                    "http://www.w3.org/2000/01/rdf-schema#label", [str(v)]
                )
                v_type = seconds[v].get(
                    "http://www.w3.org/1999/02/22-rdf-syntax-ns#type"
                )
                if v["type"] == "uri":
                    v_label_list.append(
                        A(
                            v_label[0],
                            href=f"{MOUNT}shmarql/?query="
                            + make_resource_query(v["value"]),
                            style="margin-right: 1em",
                        )
                    )
                else:
                    if v_type:
                        v_label_list.append(
                            Span(v_label[0], title=v_type[0], style="margin-right: 1em")
                        )
                    else:
                        v_label_list.append(Span(v_label[0], style="margin-right: 1em"))
            else:
                v_label_list.append(
                    A(
                        v["value"],
                        href=f"{MOUNT}shmarql/?query=" + make_spo(v["value"], "o"),
                    )
                )
        P_query = f"{MOUNT}shmarql/?query=" + make_spo(field, "p")
        if len(val) > 50:
            plain_query = query.replace("# shmarql-view: resource\n", "")

            field_heading = H3(
                A(do_prefixes(field), href=P_query),
                Span(
                    f"There are {len(val)} values for this field, showing the first 50,",
                    style="font-size: 80%; font-style: italic",
                ),
                A(
                    "click here to show all",
                    href=f"{MOUNT}shmarql/?query=" + quote(plain_query),
                    style="font-size: 80%",
                ),
                style="margin: 0.5em 0 0 0",
            )
        else:
            field_heading = H3(
                A(do_prefixes(field), href=P_query), style="margin: 0.5em 0 0 0"
            )
        ba(
            (
                field_heading,
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
                style="padding-right: 0.75ch; color: #aaa; text-align: right;",
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
                        href="?query=" + fizzy_query,
                        title="Show items similar to this entity using fizzysearch",
                    )
                else:
                    fizzyquery = None

                row_columns.append(
                    Td(
                        A(
                            "S",
                            href=f"{MOUNT}shmarql/?query={S_query}",
                            style="font-size: 80%; background-color: #ddd; color: #000; padding: 3px; text-decoration: none; margin: 0",
                        ),
                        A(
                            "P",
                            href=f"{MOUNT}shmarql/?query={P_query}",
                            style="font-size: 80%; background-color: #ddd; color: #000; padding: 3px; text-decoration: none; margin: 0",
                        ),
                        A(
                            "O",
                            href=f"{MOUNT}shmarql/?query={O_query}",
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
                    href=f"{MOUNT}shmarql/?query={make_literal_query(value)}",
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
                href=f"{MOUNT}shmarql/?query={quote(query)}&format=csv",
                cls=BTN_STYLE,
            ),
            A(
                "JSON",
                title="Download as JSON",
                href=f"{MOUNT}shmarql/?query={quote(query)}&format=json",
                cls=BTN_STYLE,
            ),
            cls="bg-slate-200 text-black p-2 flex flex-row gap-1 text-xs",
        ),
        Table(
            *table_rows,
            cls="min-w-full table-auto border-collapse border border-gray-300",
        ),
    )


@rt.get(f"{MOUNT}shmarql/fragments/chart")
def fragments_chart(query: str, results=None):
    if results is None:
        results = do_query(query)

    settings = results.get("shmarql_settings", {})
    chart_type = settings.get("view")[0]

    df = results_to_df(results)

    chart_id = f"uniq-{uuid4()}"
    chart_func = {
        "barchart": do_barchart,
        "piechart": do_piechart,
        "mapchart": do_mapchart,
    }.get(chart_type)
    try:
        chart_json = to_json(chart_func(settings, df, settings.get("label", [None])[0]))
        js_options = {}
    except Exception as e:
        return Div(
            f"Chart Error: {traceback.format_exc()}",
            style="border: 2px solid red; font-size: 150%; padding: 1em;",
        )

    return Div(
        Script(
            f"""
        var plotly_data = {chart_json};
        Plotly.newPlot('{chart_id}', plotly_data.data, plotly_data.layout, {json.dumps(js_options)});
    """
        ),
        id=chart_id,
    )


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
        results_fragment = Div(fragments_resource(results, query), cls="md-typeset")
    if settings.get("view", [""])[0].endswith("chart"):
        try:
            chart_fragment = fragments_chart(query)
        except Exception as e:
            chart_fragment = Div(
                f"Error: {e}",
                style="color: red; font-weight: bold; font-size: 150%;",
            )
        results_fragment = Div(chart_fragment, cls="md-typeset")
    else:
        results_fragment = Div(fragments_sparql(query, results), cls="md-typeset")

    return (
        Script(src=f"{MOUNT}static/editor.js"),
        Script(src=f"{MOUNT}static/matchbrackets.js"),
        Script(src=f"{MOUNT}static/sparql.js"),
        sparql_editor_block_style_button,
        Div(
            Div(
                Button(
                    "▶",
                    Script(
                        'me().on("click", async ev => {\r\n  if (ev.shiftKey) {\r\n    console.log("Shift key was pressed during the click!");\r\n  }\r\n  executeQuery()\r\n})'
                    ),
                    id="execute_sparql",
                    title="Execute this query, (also use Ctrl+Enter)",
                    style="padding: 4px 8px; font-size: 12px;",
                    cls=(ButtonT.primary),
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
                    cls=(ButtonT.secondary, "ml-4"),
                ),
                cls="mb-2",
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
            f"""
const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "{MOUNT}static/codemirror.css";
  document.head.appendChild(link);"""
        ),
        Script(f"const MOUNT = '{MOUNT}';"),
        Script(
            """
document.addEventListener("DOMContentLoaded", function () {
  sparqleditor = CodeMirror.fromTextArea(document.getElementById("code"), {
    mode: "application/sparql-query",
    matchBrackets: true,
    lineNumbers: true,
  });
  results = document.getElementById("results");
});

function executeQuery() {
    let the_query = sparqleditor.doc.getValue();
    results.innerHTML = '<div aria-busy="true">Loading...</div>';
    history.pushState({ query: the_query }, "", MOUNT+"shmarql/?query=" + encodeURIComponent(the_query));
    queryStarted = Date.now();
    progress_counter = setTimeout(updateProgress, 1000);
    
    fetch(`${MOUNT}shmarql/fragments/sparql`, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded"
        },
        body: `query=${encodeURIComponent(the_query)}`
    }).then(response => response.text()).then(data => {
        if(progress_counter) {
            clearTimeout(progress_counter);
        }
        results.innerHTML = data;
        const scripts = results.querySelectorAll("script");
            scripts.forEach((script) => {
                const newScript = document.createElement("script");
                if (script.src) {
                    newScript.src = script.src;
                    newScript.async = false; // To preserve execution order if needed
                } else {
                    newScript.textContent = script.textContent;
                }
                document.body.appendChild(newScript);
                document.body.removeChild(newScript);
        });
    })

}

function updateProgress() {
    let progress = Math.round((Date.now() - queryStarted) / 1000);
    results.innerHTML = `<div aria-busy="true">Query in progress, took ${progress}s so far...</div>`;
    progress_counter = setTimeout(updateProgress, 1000);
}

document.body.addEventListener("keypress", function (evt) {
    if (evt.ctrlKey && evt.key === "Enter") {
        evt.preventDefault();
        executeQuery()
    }
});
"""
        ),
    )
