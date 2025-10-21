from fasthtml.common import *
from monsterui.all import *
from mistletoe.contrib.pygments_renderer import PygmentsRenderer
from urllib.parse import quote
from .fragments import fragments_sparql
from .config import LOGINS, SITE_TITLE, ENDPOINT, DATA_LOAD_PATHS
import yaml


def navbar(session={}):
    user = session.get("user")
    if LOGINS:
        login_link = (
            A(
                f"Logout {user.get('username')}",
                href="/logout",
                cls="btn btn-sm btn-outline",
            )
            if user
            else A("Login", href="/login", cls="btn btn-sm btn-primary")
        )

    return Div(
        NavBar(
            A("Query", href="/shmarql/") if ENDPOINT or DATA_LOAD_PATHS else None,
            (
                A("Users", href="/admin/users", cls="btn btn-sm btn-outline")
                if user and user.get("username") == "admin"
                else None
            ),
            login_link if LOGINS else None,
            brand=DivLAligned(
                A(UkIcon("home", height=30, width=30), href="/"),
                A(H3(SITE_TITLE, cls="text-zinc-100"), href="/"),
            ),
        ),
        cls="bg-sky-600 text-white",
    )


def footer():
    return Div(
        "Made with ❤️ in Amsterdam by ",
        A("epoz", href="https://epoz.org", target="_blank", cls="text-sky-200"),
        " for the ",
        A(
            "ISE Group at FIZ Karlsruhe",
            href="https://www.fiz-karlsruhe.de/en/bereiche/information-service-engineering",
            target="_blank",
        ),
        cls="bg-slate-800 text-center text-zinc-500 pt-4 pb-4 mt-8",
    )


def base(content, extra_script=None, title="SHMARQL", session={}):
    return (
        Title(title),
        extra_script,
        navbar(session=session),
        Container(content, cls="lg:w-4/5 w-11/12"),
        footer(),
    )


class LanguageAwarePygmentsRenderer(PygmentsRenderer):
    def render_block_code(self, token):
        tmp = super().render_block_code(token)

        query = quote(token.content)
        runlink = to_xml(
            A(
                UkIcon("send", height=30, width=30),
                href=f"/shmarql/?query={query}",
            )
        )

        if token.language == "shmarql":
            query_result = to_xml(fragments_sparql(token.content))
            return f"{runlink}{query_result}"
        elif token.language == "sparql":
            return f'{runlink}<div class="code-block" data-language="{token.language}">\n{tmp}\n</div>'
        else:
            return f'<div class="code-block" data-language="{token.language}">\n{tmp}\n</div>'


def build_nav(navlist: list, depth=0.25):
    buf = []
    for navitem in navlist:
        for title, item in navitem.items():
            if isinstance(item, str):
                buf.append(Li(A(title, href=item), cls="mt-2"))
            else:
                buf.append(P(title, cls=TextT.bold))
                buf.append(build_nav(item, depth=depth + 0.25))
    return Ul(*buf, cls=(f"pr-2", TextT.sm), style=f"padding-left: {depth}ch")


def markdown_container(filepath: str, nav=[], session={}):
    sidebar = None
    if nav:
        sidebar = Div(build_nav(nav), cls="pt-11 w-3/5")

    md_content = open(filepath, "r").read()
    c = render_md(md_content, renderer=LanguageAwarePygmentsRenderer)
    return base(Div(sidebar, Div(c), cls="flex gap-12"), session=session)
