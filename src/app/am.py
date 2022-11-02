from fastapi import Request, Response
from fastapi.responses import HTMLResponse
from typing import Optional
from onelogin.saml2.auth import OneLogin_Saml2_Auth
from .main import app
from starlette.responses import RedirectResponse
from datetime import datetime, timedelta
from jose import jwt

from .config import (
    SECRET_KEY,
    ACCESS_TOKEN_EXPIRE_DAYS,
    SP_X509_CERT,
    SP_CERT_PK,
    IDP_X509_CERT,
    IDP_ENTITY,
    SITE_URI,
    IDP_URI,
)

ALGORITHM = "HS256"

saml_settings = {
    "strict": True,  # can set to True to see problems such as Time skew/drift
    "debug": False,
    "idp": {
        "entityId": IDP_ENTITY,
        "singleSignOnService": {
            "url": IDP_URI,
            "binding": "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect",
        },
        "x509cert": IDP_X509_CERT,
    },
    "sp": {
        "entityId": f"{SITE_URI}api/saml/sp",
        "assertionConsumerService": {
            "url": f"{SITE_URI}api/saml/callback",
            "binding": "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST",
        },
        "x509cert": SP_X509_CERT,
        "privateKey": SP_CERT_PK,
    },
}


async def prepare_from_fastapi_request(request, debug=False):
    form_data = await request.form()
    rv = {
        "http_host": request.client.host,
        "server_port": request.url.port,
        "script_name": request.url.path,
        "post_data": {},
        "get_data": {},
    }
    if request.query_params:
        rv["get_data"] = (request.query_params,)
    if "SAMLResponse" in form_data:
        SAMLResponse = form_data["SAMLResponse"]
        rv["post_data"]["SAMLResponse"] = SAMLResponse
    if "RelayState" in form_data:
        RelayState = form_data["RelayState"]
        rv["post_data"]["RelayState"] = RelayState
    return rv


@app.get("/api/saml/sp")
@app.get("/api/saml/metadata")
async def metadata(request: Request):
    req = await prepare_from_fastapi_request(request)
    auth = OneLogin_Saml2_Auth(req, saml_settings)
    settings = auth.get_settings()
    metadata = settings.get_sp_metadata()
    errors = settings.validate_metadata(metadata)
    if len(errors) == 0:
        return Response(content=metadata, media_type="application/xml")


@app.get("/api/saml/login")
async def saml_login(request: Request):
    req = await prepare_from_fastapi_request(request)
    auth = OneLogin_Saml2_Auth(req, saml_settings)
    callback_url = auth.login()
    response = RedirectResponse(url=callback_url)
    return response


@app.post("/api/saml/callback")
async def saml_login_callback(request: Request):
    req = await prepare_from_fastapi_request(request, True)
    auth = OneLogin_Saml2_Auth(req, saml_settings)
    auth.process_response()  # Process IdP response
    errors = auth.get_errors()  # This method receives an array with the errors
    if len(errors) == 0:
        if (
            not auth.is_authenticated()
        ):  # This check if the response was ok and the user data retrieved or not (user authenticated)
            return "User Not authenticated"
        else:
            # Attributes we are using:
            A = {
                "email": "urn:oid:0.9.2342.19200300.100.1.3",
                "displayName": "urn:oid:2.16.840.1.113730.3.1.241",
            }
            auth_attrs = auth.get_attributes()
            email = auth_attrs.get(A["email"])[0]
            displayName = auth_attrs.get(A["displayName"])[0]
            access_token = create_access_token(data={"sub": email})

            r = HTMLResponse(
                """<script>document.location = '/'</script><div>OK, SAML login succeeded</div>"""
            )
            age = 60 * 60 * 24 * 30  # 30 days age
            r.set_cookie("access_token", access_token, max_age=age)
            return r
    else:
        print(
            "Error when processing SAML Response: %s %s"
            % (", ".join(errors), auth.get_last_error_reason())
        )
        return "Error in callback"


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt
