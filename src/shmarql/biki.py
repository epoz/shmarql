from fasthtml.common import *
import json
import bikidata
from .main import app
from .config import MOUNT


def results_to_div(r: dict):
    if "error" in r:
        return Div(
            H3("Error"),
            P(r["error"]),
        )

    hits = r.get("results", {})

    agg_buf = []
    for prop, aggs in r.get("aggregates", {}).items():
        agg_buf.append(H3(f"Aggregates: {prop}"))
        agg_buf.append(Table(*[Tr(Td(iri), Td(str(c))) for c, iri in aggs]))

    extra_text = "."
    if r["total"] > r["size"]:
        extra_text = f", showing the first {r['size']}"

    return Div(
        Div(
            *agg_buf,
            style="margin-bottom: 3ch",
        ),
        P(f"{r['total']} results in total{extra_text}"),
        *[
            Div(
                A(hitiri, target="_whatsnew", href=hitiri.strip("<>")),
                P(
                    fields.get(
                        "<http://www.w3.org/2000/01/rdf-schema#label>",
                        [""],
                    )[
                        0
                    ][:300]
                    .strip('"')
                    .replace('"@en', "")
                    .replace('"@de', "")
                    .replace(r"\"", '"'),
                    style="padding: 0.2ch;",
                ),
                style="border: 1px solid #ccc; padding: 1ch",
            )
            for hitiri, fields in hits.items()
        ],
    )


@app.post(MOUNT + "bikidata")
async def query(request: Request):
    body = await request.body()
    opts = json.loads(body)
    try:
        r = bikidata.query(opts)
    except Exception as e:
        r = {"error": str(e)}

    if opts.get("format") == "json":
        return JSONResponse(r)

    return results_to_div(r)


@app.get(MOUNT + "bikidata/")
def biki_get():
    return Div(
        Textarea(
            """{
    "filters": [
        {"p":"fts 2", "o":"culture"}
        ],
    "aggregates": [
         "<http://www.w3.org/1999/02/22-rdf-syntax-ns#type>"
    ],
    "size": 20
}""",
            id="opts",
            style="width: 80%; height: 20ch",
        ),
        Script(
            """me().on("keyup", async event => {
if(event.code === "Enter" && event.ctrlKey) {
    fetch('"""
            + MOUNT
            + """bikidata', {
        method: "POST",
        body: me("#opts").value,
    }).then(r => r.text()).then(r => me("#results").innerHTML = r);
}

})
"""
        ),
        Div(id="results"),
    )


@app.get(MOUNT + "bikidata/browse")
def biki_browse():
    clipboard = """<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" class="bi bi-clipboard" viewBox="0 0 24 24">
    <path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"/>
    <path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3z"/>
</svg>"""

    props = bikidata.query({"aggregates": ["properties"]})
    props = sorted(
        [
            (count, piri)
            for count, piri in props.get("aggregates", {}).get("properties", [])
        ],
        reverse=True,
    )

    op = Div(
        Select(
            Option("must", value="must"),
            Option("should", value="should"),
            Option("not", value="not"),
            cls="op",
            style="margin: 1ch; padding: 0.5ch;",
        ),
        style="display: inline-block; margin: 0.1ch;",
    )
    predicate = Div(
        Select(
            Option("fts", value="fts"),
            Option(" - ", value="_", title="No value"),
            Option("id", value="id"),
            Option("semantic", value="semantic"),
            *[Option(f"{c} {p}", value=p) for c, p in props],
            cls="pred",
            style="margin: 1ch; padding: 0.5ch;",
        ),
        style="display: inline-block; margin: 0.1ch;",
    )
    obj = Div(
        Input(type="text", style="width: 30vw", cls="obj"),
        style="display: inline-block; margin: 0.1ch;",
    )

    block = Div(
        Button(
            "-",
            style="padding: 0.2ch; border: 1px solid #ccc; border-radius: 8px;",
            cls="block_remove",
        ),
        Button(
            "+",
            style="padding: 0.2ch; border: 1px solid #ccc; border-radius: 8px;",
            cls="block_add",
        ),
        op,
        predicate,
        obj,
        style="border-bottom: 1px solid #bbb",
    )

    aggregates_chooser = Div(
        Button(
            "-",
            style="padding: 0.2ch; border: 1px solid #ccc; border-radius: 8px;",
            cls="agg_remove",
        ),
        Button(
            "+",
            style="padding: 0.2ch; border: 1px solid #ccc; border-radius: 8px;",
            cls="agg_add",
        ),
        Select(
            Option(" - ", value="-"),
            *[Option(p, value=p) for c, p in props],
            cls="agg",
            style="margin: 1ch; padding: 0.5ch;",
        ),
        style="margin: 0.1ch;",
    )

    return (
        (
            Script(type="module", src="https://pyscript.net/releases/2025.3.1/core.js"),
            Div(
                H4("Filters"),
                block,
                H4("Aggregates"),
                aggregates_chooser,
                Div(
                    Button(
                        "Go",
                        id="go",
                        style="background-color: #999; color: white; border-radius: 8px; padding: 4px",
                    ),
                    Div(id="results"),
                ),
            ),
        ),
        Script(
            """from pyscript import display, when, fetch, window
from pyscript.web import page
import json

@when("click", ".block_add")
def block_add_click(event):
    block = event.target.parentElement
    new_block = block.cloneNode(True)
    new_block.querySelector(".block_remove").onclick = block_remove_click
    new_block.querySelector(".block_add").onclick = block_add_click
    block.parentElement.insertBefore(new_block, block.nextSibling)

@when("click", ".block_remove")
def block_remove_click(event):
    existing = page.find(".block_remove")
    if len(existing) == 1:
        return
    block = event.target.parentElement
    block.parentElement.removeChild(block)

@when("click", ".agg_add")
def agg_add_click(event):
    block = event.target.parentElement
    new_block = block.cloneNode(True)
    new_block.querySelector(".agg_remove").onclick = agg_remove_click
    new_block.querySelector(".agg_add").onclick = agg_add_click
    block.parentElement.insertBefore(new_block, block.nextSibling)    


@when("click", ".agg_remove")
def agg_remove_click(event):
    existing = page.find(".agg_remove")
    if len(existing) == 1:
        return
    block = event.target.parentElement
    block.parentElement.removeChild(block)    


@when("click", "#go")
async def go_click(event):
    # await window.navigator.clipboard.writeText("een twee drie")

    ops = page.find(".op")
    preds = page.find(".pred")
    objs = page.find(".obj")

    opts = {}
    for i, op in enumerate(ops):
        opts[i] = {'op': op.value}
    for i, pred in enumerate(preds):
        if pred.value != "_":
            opts[i]['p'] = pred.value
    for i, obj in enumerate(objs):
        if obj.value:
            opts[i]['o'] = obj.value
    opts = {'filters': [x for x in opts.values()]}

    aggs = page.find(".agg")
    if len(aggs) > 0:
        opts['aggregates'] = [agg.value for agg in aggs if agg.value != "-"]

    opts['format'] = 'html'    

    response = await fetch('/bikidata', 
        method="POST",
        headers={ "Content-Type": "application/json"},
        body =  json.dumps(opts)
    )
    if response.ok:
        data = await response.text()        
        page.find("#results").innerHTML = data
    else:
        print(response.status)
""",
            type="mpy",
        ),
    )
