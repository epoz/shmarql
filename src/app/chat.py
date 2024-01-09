import os, json, random, httpx, logging, sqlite3
from markdown_it import MarkdownIt
from jinja2 import Markup
from fastapi import Depends, FastAPI, Request, HTTPException, Query
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from .main import app, templates
from .config import (
    CHATDB_FILEPATH,
    DEBUG,
)

if DEBUG:
    logging.basicConfig(level=logging.DEBUG)
else:
    logging.basicConfig()

if CHATDB_FILEPATH:
    CHATDB = sqlite3.connect(CHATDB_FILEPATH)


def format_history(history: dict):
    md = MarkdownIt()
    # We would like to modify the messages, so we need to make a copy
    new_history = []
    for m in history.get("messages", []):
        try:
            if type(m) == str:
                m = {"role": "assistant", "content": m}
            if m.get("role") == "assistant" and m.get("content"):
                m["content_html"] = Markup(md.render(m.get("content", "")))
            if m.get("role") == "function" and m.get("content"):
                try:
                    m["content_json"] = json.loads(m["content"])
                except:
                    logging.exception(f"Exception decoding {m['content']}")
            new_history.append(m)
        except:
            logging.exception(f"Exception decoding {m}")
    history["messages"] = new_history
    return history


def get_chat(chat_id: str):
    tmp = CHATDB.execute(
        "select user, history from user_chat_history where id = ?",
        (chat_id,),
    ).fetchone()
    if not tmp:
        raise HTTPException(404, f"Conversation {chat_id} not found")
    huser, history = tmp
    history = format_history(json.loads(history))

    return history


@app.get("/chat/{chat_id}.json")
async def chat_json(request: Request, chat_id: str):
    history = get_chat(chat_id)
    return JSONResponse(history)


@app.get("/chat/{chat_id}")
async def chat_history_id(request: Request, chat_id: str):
    if chat_id != "history":
        history = get_chat(chat_id)
    else:
        history = None

    histories = [
        json.loads(h[0])
        for h in CHATDB.execute("select history from user_chat_history").fetchall()
    ]
    histories.sort(key=lambda x: x["date_created"])
    histories.reverse()

    return templates.TemplateResponse(
        "chat_history.html",
        {"request": request, "histories": histories, "history": history},
    )
