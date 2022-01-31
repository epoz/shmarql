from htmltree import *

PREFIX = {
    "http://www.w3.org/1999/02/22-rdf-syntax-ns#": "rdf:",
    "http://www.w3.org/2000/01/rdf-schema#": "rdfs:",
    "http://www.w3.org/2002/07/owl#": "owl:",
    "http://schema.org/": "schema:",
    "http://www.wikidata.org/entity/": "wd:",
    "http://www.wikidata.org/entity/statement/": "wds:",
    "http://wikiba.se/ontology#": "wikibase:",
    "http://www.wikidata.org/prop/direct/": "wdt:",
    "http://www.w3.org/2004/02/skos/core#": "skos:",
    "http://purl.org/dc/terms/": "dct:",
    "http://dbpedia.org/resource/": "dbr:",
}


endpoint = document.getElementById("endpoint")
endpointaddon2 = document.getElementById("endpointaddon2")
status_box = document.getElementById("status_box")
results_element = document.getElementById("results")

b_s = document.getElementById("b_s")
b_p = document.getElementById("b_p")
b_o = document.getElementById("b_o")

document.curr_s = "?s"
document.curr_p = "?p"
document.curr_o = "?o"


def find_attr_parents(element, attr):
    val = element.getAttribute(attr)
    if val and len(val) > 0:
        return val
    parent = element.parentElement
    if parent:
        return find_attr_parents(parent, attr)


def snippet(param, elem):
    value = elem["value"]
    d = Div()
    if elem["type"] == "uri":
        if param == "s" and value == document.curr_s:
            d.C.append(Span("&middot;"))
        else:
            d.C.append(
                Span(
                    "S",
                    _class="selektor",
                    uri=value,
                    wanted="S",
                ),
            )

        if param == "p" and value == document.curr_p:
            d.C.append(Span("&middot;"))
        else:
            d.C.append(
                Span("P", _class="selektor", uri=value, wanted="P"),
            )

        if param == "o" and value == document.curr_o:
            d.C.append(Span("&middot;"))
        else:
            d.C.append(
                Span("O", _class="selektor", uri=value, wanted="O"),
            )
        display_value = value
        for prefix, replacement in PREFIX.items():
            if value.startswith(prefix):
                display_value = value.replace(prefix, replacement)

        d.C.append(
            Span(
                display_value + "&nbsp;&nbsp;",
                uri=value,
                wanted="_",
                style={"cursor": "pointer"},
            )
        )
        d.C.append(
            A(
                "&nearr;",
                href=value,
                target="other",
                style={"text-decoration": "none", "color": "black"},
            )
        )
    else:
        d.C.append(Span(value))
    return d.render()


def display(results):
    if "results" in results and "bindings" in results["results"]:
        results = results["results"]["bindings"]
    t = Table(
        Thead(
            Tr(
                Td(Span(document.curr_s, _class="btn btn-sm", uri="?s", wanted="S")),
                Td(Span(document.curr_p, _class="btn btn-sm", uri="?p", wanted="P")),
                Td(Span(document.curr_o, _class="btn btn-sm", uri="?o", wanted="O")),
            )
        ),
        _class="table table-striped",
    )
    tbody = Tbody()
    t.C.append(tbody)
    for row in results:
        if "s" not in row:
            row["s"] = {"type": "uri", "value": document.curr_s}
        if "p" not in row:
            row["p"] = {"type": "uri", "value": document.curr_p}
        if "o" not in row:
            row["o"] = {"type": "uri", "value": document.curr_o}

        tbody.C.append(
            Tr(
                Td(snippet("s", row["s"])),
                Td(snippet("p", row["p"])),
                Td(snippet("o", row["o"])),
            )
        )
    buf = t.render()
    results_element.innerHTML = buf


async def sparql(endpoint, q):
    __pragma__("jsiter")
    res = await fetch(
        endpoint,
        {
            "method": "POST",
            "mode": "cors",
            "headers": {
                "Accept": "application/sparql-results+json",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            "body": "query=" + encodeURIComponent(q),
        },
    )
    if res.status != 200:
        txt = await res.text()
        return {"error": txt}
    return await res.json()
    __pragma__("nojsiter")


def flash(msg):
    status_box.innerHTML = msg
    status_box.style.display = "block"


def uri_or_literal(value):
    if value.lower().startswith("http"):
        return "<" + value + "> "
    else:
        return '"' + value + '" '


async def change_endpoint():
    ep = endpoint.value
    if not ep.lower().startswith("http"):
        flash("The endpoint has to start with http")
    results_element.innerHTML = '<div style="margin-top: 20px" class="spinner-border" role="status"><span class="visually-hidden">Loading...</span></div>'
    new_url = (
        "?endpoint="
        + encodeURIComponent(endpoint.value)
        + "&s="
        + encodeURIComponent(document.curr_s)
        + "&p="
        + encodeURIComponent(document.curr_p)
        + "&o="
        + encodeURIComponent(document.curr_o)
    )

    history.pushState({}, "", new_url)

    # See if any bootstrap s, p, o were used
    if b_s.value:
        document.curr_s = b_s.value
        b_s.value = ""
    if b_p.value:
        document.curr_p = b_p.value
        b_p.value = ""
    if b_o.value:
        document.curr_o = b_o.value
        b_o.value = ""

    q = "SELECT * WHERE { "
    if document.curr_s != "?s":
        q += uri_or_literal(document.curr_s)
    else:
        q += document.curr_s + " "
    if document.curr_p != "?p":
        q += uri_or_literal(document.curr_p)
    else:
        q += document.curr_p + " "
    if document.curr_o != "?o":
        q += uri_or_literal(document.curr_o)
    else:
        q += document.curr_o
    q += " } ORDER BY ?s LIMIT 999"

    results = await sparql(ep, q)
    if "error" in results:
        document.getElementById("results").innerHTML = results["error"]
    else:
        display(results)


async def endpoint_keyup(event):
    if event.keyCode == 13:
        change_endpoint()


async def results_clicker(event):
    wanted = find_attr_parents(event.target, "wanted")  # One of: S, P, O
    uri = find_attr_parents(event.target, "uri")
    if wanted == "_":
        document.curr_s = uri
        document.curr_p = "?p"
        document.curr_o = "?o"
        change_endpoint()
        return
    elif wanted == "S":
        document.curr_s = uri
    elif wanted == "P":
        document.curr_p = uri
    elif wanted == "O":
        document.curr_o = uri
    if wanted and uri:
        event.preventDefault()
        change_endpoint()


async def init():
    endpoint.addEventListener("keyup", endpoint_keyup)
    endpointaddon2.addEventListener("click", change_endpoint)
    results_element.addEventListener("click", results_clicker)
    params = __new__(URL(document.location)).searchParams
    for e in params.getAll("endpoint"):
        endpoint.value = e
    for s_param in params.getAll("s"):
        b_s.value = s_param
    for p_param in params.getAll("p"):
        b_p.value = p_param
    for o_param in params.getAll("o"):
        b_o.value = o_param

    if endpoint.value and (b_s.value or b_p.value or b_o.value):
        change_endpoint()


window.addEventListener("load", init)
