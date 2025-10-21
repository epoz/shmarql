import random
from urllib.parse import quote
from fasthtml.common import *
from monsterui.all import *
from fastlite import database
from .layout import base
from .config import ADMIN_DATABASE, log, LOGINS
from passlib.context import CryptContext
from functools import wraps

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

if LOGINS:
    admin_database = database(ADMIN_DATABASE)
    users = admin_database.t.users
    if "users" not in admin_database.t:
        users.create(
            username=str, name=str, password=str, activation_date=str, pk="username"
        )
        admin_password = "".join(random.choice("01234567890abcdef") for _ in range(20))
        users.insert(
            username="admin",
            name="Administrator",
        )
        reset_admin_password()
    users.dataclass()


def reset_admin_password(admin_filepath: str):
    admin_database = database(admin_filepath)
    users = admin_database.t.users
    users.dataclass()
    admin_password = "".join(random.choice("01234567890abcdef") for _ in range(20))
    admin_user = users["admin"]
    admin_user.password = pwd_context.hash(admin_password)
    users.update(admin_user)
    log.info(f"*****>>> admin user password: [ {admin_password} ] <<<*****")


ar = APIRouter()


def login_required(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        session = kwargs.get("session")
        if not session or not session.get("user"):
            return RedirectResponse(url="/login", status_code=302)
        return func(*args, **kwargs)

    return wrapper


@ar.get("/admin/users")
def admin_users(session, msg: str = None):
    if not session.get("user"):
        return RedirectResponse("/login", status_code=302)
    user = session.get("user")
    if user.get("username") != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
    content = Div(
        Div(
            Modal(
                ModalTitle("Delete User confirmation"),
                P(
                    "Are you sure you want to delete this user? This action cannot be undone.",
                    cls=TextPresets.muted_sm,
                    id="user_confirm_text",
                ),
                footer=ModalCloseButton("Close", cls=ButtonT.secondary),
                id="my-modal",
            ),
        ),
        H1("User Management", cls="text-3xl font-bold mb-6 text-center"),
        (
            Div(
                msg,
                cls="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4",
            )
            if msg
            else None
        ),
        A("Add User", href="/admin/adduser", cls="btn btn-sm btn-primary mb-4"),
        Table(
            Thead(
                Tr(
                    Th("Username", cls="border px-4 py-2"),
                    Th("Name", cls="border px-4 py-2"),
                    Th(" ", cls="border px-4 py-2"),
                )
            ),
            Tbody(
                *[
                    Tr(
                        Td(
                            A(
                                u.username,
                                href=f"/admin/adduser?username={quote(u.username)}&name={quote(u.name)}",
                            ),
                            cls="border px-4 py-2",
                        ),
                        Td(u.name, cls="border px-4 py-2"),
                        Td(
                            (
                                Button(
                                    UkIcon(
                                        "user-round-x",
                                        height=15,
                                        width=15,
                                        title="Delete User",
                                    ),
                                    data_uk_toggle="target: #my-modal",
                                    hx_get="/admin/deleteuser?username="
                                    + quote(u.username),
                                    hx_target="#user_confirm_text",
                                    hx_swap="innerHTML",
                                )
                            ),
                            cls="border px-4 py-2",
                        ),
                    )
                    for u in users()
                    if u.username != "admin"
                ]
            ),
        ),
        cls="max-w-4xl mx-auto mt-8 p-6 bg-white rounded-lg shadow-md",
    )
    return base(content, title="User Management", session=session)


@ar.get("/admin/deleteuser")
def delete_user_get(session, username: str):
    return Div(
        "Are you sure you want to delete user ",
        B(username),
        "?",
        Button(
            "Delete",
            hx_post=f"/admin/deleteuser?username={quote(username)}",
            hx_redirect="true",
            cls="btn btn-sm btn-danger ml-2",
        ),
        cls="p-4",
    )


@ar.post("/admin/deleteuser")
def delete_user_post(session, username: str):
    if not session.get("user"):
        raise HTTPException(status_code=403, detail="Not authorized")
    user = session.get("user")
    if user.get("username") != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
    if username == "admin":
        raise HTTPException(status_code=400, detail="Cannot delete admin user")
    try:
        users.delete(username)
        msg = quote(f"User [{username}] deleted successfully")
    except Exception as e:
        msg = quote(f"Error deleting user [{username}]: {str(e)}")

    return Response(headers={"HX-Redirect": f"/admin/users?msg={msg}"})


@ar.post("/admin/adduser")
def add_user_post(session, username: str, name: str, password: str):
    if not session.get("user"):
        raise HTTPException(status_code=403, detail="Not authorized")
    user = session.get("user")
    if user.get("username") != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
    if username == "admin":
        raise HTTPException(status_code=400, detail="Cannot create another admin user")
    try:
        x_user = users[username]
        x_user.name = name
        if password:
            x_user.password = pwd_context.hash(password)
        users.update(x_user)
        msg = quote(f"User [{username}] updated successfully")
    except NotFoundError:
        if len(password) < 8:
            msg = quote("Password must be at least 8 characters long")
            return RedirectResponse(
                f"/admin/adduser?msg={msg}&username={quote(username)}&name={quote(name)}",
                status_code=302,
            )
        users.insert(
            username=username,
            name=name,
            password=pwd_context.hash(password),
        )
        msg = quote(f"User [{username}] created successfully")
    return RedirectResponse(f"/admin/users?msg={msg}", status_code=302)


@ar.get("/admin/adduser")
def add_user_get(session, username: str = "", name: str = "", msg: str = None):
    if not session.get("user"):
        return RedirectResponse("/login", status_code=302)

    heading = "Create a new User"
    btn_text = "Create"
    if username or name:
        heading = f"Modify user [{username}]"
        btn_text = "Modify"

    content = Div(
        H1(heading, cls="text-3xl font-bold mb-6 text-center"),
        (
            Div(
                msg,
                cls="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4",
            )
            if msg
            else None
        ),
        Form(
            Div(
                Label("Username:", cls="block text-sm font-medium mb-1"),
                Input(
                    name="username",
                    value=username,
                    type="text",
                    required=True,
                    cls="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500",
                ),
                cls="mb-4",
            ),
            Div(
                Label("Display name:", cls="block text-sm font-medium mb-1"),
                Input(
                    name="name",
                    value=name,
                    type="text",
                    required=True,
                    cls="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500",
                ),
                cls="mb-4",
            ),
            Div(
                Label("Password:", cls="block text-sm font-medium mb-1"),
                Input(
                    name="password",
                    type="text",
                    cls="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500",
                ),
                cls="mb-6",
            ),
            Button(
                btn_text,
                type="submit",
                cls="w-full bg-blue-500 text-white py-2 px-4 rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500",
            ),
            method="post",
            action="/admin/adduser",
            cls="space-y-4",
        ),
        cls="max-w-md mx-auto mt-8 p-6 bg-white rounded-lg shadow-md",
    )
    return base(content, title="Add User", session=session)


@ar.get("/logout")
def logout(session):
    session.clear()
    return RedirectResponse("/login", status_code=302)


@ar.post("/login")
def login(session, username: str, password: str):
    try:
        user = users.selectone(where="username=?", where_args=(username,))
        if user and pwd_context.verify(password, user.password):
            session["user"] = {"username": user.username, "name": user.name}
            return RedirectResponse("/", status_code=302)
    except Exception as e:
        log.debug(f"Login error: {str(e)}")
    return login_page(session, msg="Invalid username or password")


@ar.get("/login")
def login_page(session, msg: str | None = None):
    if session.get("user"):
        return RedirectResponse("/", status_code=302)

    content = (
        Div(
            H1("Login", cls="text-3xl font-bold mb-6 text-center"),
            (
                Div(
                    msg,
                    cls="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4",
                )
                if msg
                else None
            ),
            Form(
                Div(
                    Label("Username:", cls="block text-sm font-medium mb-1"),
                    Input(
                        name="username",
                        type="text",
                        required=True,
                        cls="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500",
                    ),
                    cls="mb-4",
                ),
                Div(
                    Label("Password:", cls="block text-sm font-medium mb-1"),
                    Input(
                        name="password",
                        type="password",
                        required=True,
                        cls="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500",
                    ),
                    cls="mb-6",
                ),
                Button(
                    "Login",
                    type="submit",
                    cls="w-full bg-blue-500 text-white py-2 px-4 rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500",
                ),
                method="post",
                action="/login",
                cls="space-y-4",
            ),
            cls="max-w-md mx-auto mt-8 p-6 bg-white rounded-lg shadow-md",
        ),
    )

    return base(content, title="Login")
