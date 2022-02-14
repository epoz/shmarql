from htmltree import *

PREFIX = {
    "rdf": "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
    "rdfs": "http://www.w3.org/2000/01/rdf-schema#",
    "owl": "http://www.w3.org/2002/07/owl#",
    "schema": "http://schema.org/",
    "wd": "http://www.wikidata.org/entity/",
    "wds": "http://www.wikidata.org/entity/statement/",
    "wikibase": "http://wikiba.se/ontology#",
    "wdt": "http://www.wikidata.org/prop/direct/",
    "skos": "http://www.w3.org/2004/02/skos/core#",
    "dct": "http://purl.org/dc/terms/",
    "dbr": "http://dbpedia.org/resource/",
    "dc": "http://purl.org/dc/elements/1.1/",
    "foaf": "http://xmlns.com/foaf/0.1/",
    "arco": "https://w3id.org/arco/",
}

shmarql_element = document.getElementById("shmarql")


async def sparql(endpoint, q):
    __pragma__("jsiter")
    res = await fetch(
        endpoint
        + "?query="
        + encodeURIComponent(q)
        + "&format=application%2Fsparql-results%2Bjson",
        {
            "method": "GET",
            "mode": "cors",
            "headers": {
                "Accept": "application/sparql-results+json",
            },
        },
    )
    if res.status != 200:
        txt = await res.text()
        return {"error": txt}
    return await res.json()
    __pragma__("nojsiter")


def puri(u):
    for prefix, replacement in PREFIX.items():
        if u.startswith(replacement):
            return u.replace(replacement, prefix + ":")
    return u


def PFX(u):
    for prefix, replacement in PREFIX.items():
        if u.startswith(prefix + ":"):
            return u.replace(prefix + ":", replacement)


def find_attr_parents(element, attr):
    val = element.getAttribute(attr)
    if val and len(val) > 0:
        return val
    parent = element.parentElement
    if parent:
        return find_attr_parents(parent, attr)


def vals_for_prefix(results, p):
    buf = []
    for item in results:
        if "p" not in item:
            continue
        if "o" not in item:
            continue
        for k, v in dict(item).items():
            if item["p"]["type"] == "uri" and item["p"]["value"] == p:
                buf.append(item["o"])
    return buf


def batch_prefixes(results):
    buf = {}
    for item in results:
        if "p" not in item:
            continue
        if "o" not in item:
            continue
        buf.setdefault(item["p"]["value"], []).append(item["o"])
    return buf


def val(data, elem, field, dest_type=None, show_field=False):
    if field not in data:
        return False
    dest_type = dest_type or P
    for d in data[field]:
        value = d["value"]
        if d["type"] == "uri":
            elem.C.append(
                P(
                    puri(value),
                    wanted="_",
                    uri=value,
                    style={"margin": "0", "cursor": "pointer"},
                )
            )
        else:
            elem.C.append(P(value, style={"margin": "0", "cursor": "pointer"}))
            if show_field:
                elem.C.append(
                    P(
                        field,
                        style={
                            "margin": "0 0 1ch 0",
                            "padding-left": "4ch",
                            "font-size": "75%",
                            "color": "#ddd",
                        },
                    )
                )

    return True


def therest(data, elem, exclude_fields):
    t = Table(
        _class="table table-striped",
    )
    tbody = Tbody()
    t.C.append(tbody)
    exclude_fields = [PFX(field) for field in exclude_fields]
    for fieldname, rows in data.items():
        if fieldname in exclude_fields:
            continue
        t_row = Tr()
        tbody.C.append(t_row)
        t_row_d = Td()
        t_row.C.append(Td(puri(fieldname)))
        t_row.C.append(t_row_d)
        val(data, t_row_d, fieldname)
    elem.C.append(t)


def show_single(results):
    subject_data = batch_prefixes(results)
    content = Div()
    val(subject_data, content, PFX("schema:name"), H1, True)
    val(subject_data, content, PFX("schema:description"), H3, True)
    val(subject_data, content, PFX("skos:label"), H1, True)
    has_title = val(subject_data, content, PFX("dc:title"), H1, True)
    if not has_title:
        has_label = val(subject_data, content, PFX("rdfs:label"), H2, True)
    val(subject_data, content, PFX("rdfs:subClassOf"), True)
    has_description = val(subject_data, content, PFX("dc:description"), True)
    if not has_description:
        val(subject_data, content, PFX("rdfs:comment"), True)
    if PFX("foaf:depiction") in subject_data:
        for depiction in subject_data[PFX("foaf:depiction")]:
            content.C.append(Img(src=depiction["value"], style={"width": "20vw"}))
    therest(
        subject_data,
        content,
        [
            "schema:name",
            "schema:description",
            "skos:label",
            "dc:title",
            "dc:description",
            "rdfs:label",
            "rdfs:subClassOf",
            "rdfs:comment",
            "foaf:depiction",
        ],
    )

    shmarql_element.innerHTML = content.render()


def show_list(results):
    thead_tr = Tr()
    for headvar in results["head"]["vars"]:
        thead_tr.C.append(Td(headvar))
    tbody = Tbody()
    for row in results["results"]["bindings"]:
        arow = Tr()
        for k, v in dict(row).items():
            if v["type"] == "uri":

                vv = Span(
                    puri(v["value"]),
                    wanted="S",
                    uri="<" + v["value"] + ">",
                    style={"cursor": "pointer"},
                )
                arow.C.append(Td(vv))
            else:
                arow.C.append(Td(v["value"]))
        tbody.C.append(arow)
    t = Table(
        Thead(thead_tr),
        tbody,
        _class="table table-striped",
    )
    shmarql_element.innerHTML = t.render()


async def navigate(s, p, o):
    new_url = "?"
    if s != "?s":
        new_url += "s=" + encodeURIComponent(s.strip())
    if p != "?p":
        new_url += "&p=" + encodeURIComponent(p.strip())
    if o != "?o":
        new_url += "&o=" + encodeURIComponent(o.strip())
    history.pushState({}, "", new_url)

    q = "SELECT * WHERE { "
    q += s + " "
    q += p + " "
    q += o + " "
    q += " } ORDER BY ?s LIMIT 999"
    results = await sparql(document.endpoint, q)
    if "error" in results:
        shmarql_element.innerHTML = results["error"]
    elif "results" in results and "bindings" in results["results"]:
        show_single(results["results"]["bindings"])


async def results_clicker(event):
    event.preventDefault()
    wanted = find_attr_parents(event.target, "wanted")  # One of: S, P, O
    uri = find_attr_parents(event.target, "uri")
    if uri:
        if wanted == "_":
            window.open(uri, "_target")
        else:
            navigate(uri, "?p", "?o")


async def init():
    # Add any user-defined prefixes
    if document.shmarql_prefix:
        for pfx, replacement in dict(document.shmarql_prefix).items():
            PREFIX[pfx] = replacement

    document.endpoint = shmarql_element.getAttribute("data-endpoint") or "/sparql"
    start_s = shmarql_element.getAttribute("data-s") or "?s"
    start_p = shmarql_element.getAttribute("data-p") or "?p"
    start_o = shmarql_element.getAttribute("data-o") or "?o"
    shmarql_element.addEventListener("click", results_clicker)

    # the URL parameters can override the element attributes
    params = __new__(URL(document.location)).searchParams
    for e in params.getAll("endpoint"):
        document.endpoint = e
    found_param = False
    for s_param in params.getAll("s"):
        start_s = s_param
        found_param = True
    for p_param in params.getAll("p"):
        start_p = p_param
        found_param = True
    for o_param in params.getAll("o"):
        start_o = o_param
        found_param = True

    if document.endpoint and found_param:
        navigate(start_s, start_p, start_o)
    else:
        results = await sparql(document.endpoint, shmarql_element.innerText.strip())
        if "results" in results and "bindings" in results["results"]:
            show_list(results)


window.addEventListener("load", init)
