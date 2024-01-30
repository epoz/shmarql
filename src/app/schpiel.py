from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi import Request, BackgroundTasks, HTTPException
from .config import SCHPIEL_PATH, SCHPIEL_TOKEN
from .main import app, templates
from markdown_it import MarkdownIt
from pygments import highlight
from pygments.lexers import get_lexer_by_name
from pygments.formatters import HtmlFormatter
from markupsafe import Markup
import os
from .lode import can_lode
from pydantic import BaseModel
from urllib.parse import quote


class CustomHtmlFormatter(HtmlFormatter):
    def __init__(self, url=None, **options):
        super().__init__(**options)
        self.url = url

    def wrap(self, source):
        for i, t in source:
            yield i, t + "<br>"
        yield i + 1, f'<a style="margin-top: 1vh" href="{self.url}"><svg style="color: #34d8e4" xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="currentColor" class="bi bi-play-btn" viewBox="0 0 16 16"><path d="M6.79 5.093A.5.5 0 0 0 6 5.5v5a.5.5 0 0 0 .79.407l3.5-2.5a.5.5 0 0 0 0-.814l-3.5-2.5z"/><path d="M0 4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V4zm15 0a1 1 0 0 0-1-1H2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V4z"/></svg></a>'


def pygments_highlighter(md):
    def _highlight(self, tokens, idx, options, env):
        token = tokens[idx]
        lang = token.info.strip() if token.info else "text"
        code = token.content.strip()
        url = f"/sparql#query={quote(code)}"
        try:
            lexer = get_lexer_by_name(lang, stripall=True)
        except Exception:
            lexer = get_lexer_by_name("text")
        if lang == "sparql":
            formatter = CustomHtmlFormatter(url=url, noclasses=True)
        else:
            formatter = HtmlFormatter(noclasses=True)
        return highlight(code, lexer, formatter)

    md.add_render_rule("fence", _highlight)


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
            pygments_highlighter(md)
            contents = md.render(md_content)
            return templates.TemplateResponse(
                "schpiel.html", {"request": request, "contents": Markup(contents)}
            )
        if filepath_ == pagename or filepath_ == f"{pagename}.html":
            return HTMLResponse(open(filepath).read())

    if pagename == "index":
        return RedirectResponse("/shmarql")

    raise HTTPException(status_code=404, detail=f"[{pagename}] not found")
