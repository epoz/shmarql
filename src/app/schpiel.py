from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi import Request, BackgroundTasks, HTTPException
from .config import SCHPIEL_PATH, SCHPIEL_TOKEN
from .main import app, templates
from markdown_it import MarkdownIt
from markupsafe import Markup
import os
from .lode import can_lode
from pydantic import BaseModel


def sanitize_path(path):
    return os.path.relpath(os.path.normpath(os.path.join("/", path)), "/")


class SchpielUpdate(BaseModel):
    token: str
    pathname: str
    content: str


def find_md_file(pagename):
    for dirpath, dirnames, filenames in os.walk(SCHPIEL_PATH):
        for filename in filenames:
            filepath = os.path.join(dirpath, filename)
            yield filepath


@app.post("/_SCHPIEL")
def update(request: Request, data: SchpielUpdate):
    if SCHPIEL_TOKEN is None:
        raise HTTPException(
            status_code=404, detail="Path not found (SCHPIEL_TOKEN not configured)"
        )
    if data.token != SCHPIEL_TOKEN:
        raise HTTPException(status_code=401, detail="The TOKEN does not match")
    if SCHPIEL_PATH is None:
        raise HTTPException(
            status_code=404, detail="Path not found (SCHPIEL_PATH not configured)"
        )
    filepath = os.path.join(SCHPIEL_PATH, sanitize_path(data.pathname))
    open(filepath, "w").write(data.content)
    return f"Wrote [{data.pathname}] of size {len(data.content)}"


@app.get("/{pagename:path}", response_class=HTMLResponse, include_in_schema=False)
def schpiel(request: Request, background_tasks: BackgroundTasks, pagename: str):
    lode_html = can_lode(request, pagename)
    if lode_html:
        return lode_html

    if SCHPIEL_PATH is None:
        return RedirectResponse("/shmarql")

    if pagename == "":
        pagename = "index"
    for filepath in find_md_file(pagename):
        filepath_ = filepath.replace(SCHPIEL_PATH, "").strip("/")
        if filepath_ == f"{pagename}.md":
            md_content = open(filepath).read()
            md = MarkdownIt()
            contents = md.render(md_content)
            return templates.TemplateResponse(
                "schpiel.html", {"request": request, "contents": Markup(contents)}
            )
        if filepath_ == pagename or filepath_ == f"{pagename}.html":
            return HTMLResponse(open(filepath).read())

    if pagename == "index":
        return RedirectResponse("/shmarql")

    raise HTTPException(status_code=404, detail=f"[{pagename}] not found")
