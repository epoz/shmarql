from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi import Request, BackgroundTasks, HTTPException
from .config import TBOX_PATH
from .main import app, templates
from pylode import OntDoc, PylodeError


@app.get("/lode", response_class=HTMLResponse, include_in_schema=False)
def show_lode(request: Request):
    if not TBOX_PATH:
        raise HTTPException(status_code=404, detail="No TBOX_PATH has been configured")
    try:
        od = OntDoc(TBOX_PATH)
        html = od.make_html()
        return html
    except PylodeError as e:
        raise HTTPException(status_code=500, detail=f"TBOX_PATH PyLODE error {e}")
