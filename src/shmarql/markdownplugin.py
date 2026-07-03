from markdown.postprocessors import Postprocessor
from markdown.extensions.codehilite import CodeHiliteExtension
from markdown import Markdown
from pygments.lexers.rdf import SparqlLexer
from pygments.lexers import find_lexer_class_by_name
from pygments.util import ClassNotFound
import re

SparqlLexer.aliases.append("shmarql")

__all__ = ["ShmarqlLexer"]
fa_aeroplane = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="24" height="24" fill="#ccc" ><!--! Font Awesome Free 6.5.2 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free (Icons: CC BY 4.0, Fonts: SIL OFL 1.1, Code: MIT License) Copyright 2024 Fonticons, Inc.--><path d="M498.1 5.6c10.1 7 15.4 19.1 13.5 31.2l-64 416c-1.5 9.7-7.4 18.2-16 23s-18.9 5.4-28 1.6L284 427.7l-68.5 74.1c-8.9 9.7-22.9 12.9-35.2 8.1S160 493.2 160 480v-83.6c0-4 1.5-7.8 4.2-10.7l167.6-182.9c5.8-6.3 5.6-16-.4-22s-15.7-6.4-22-.7L106 360.8l-88.3-44.2C7.1 311.3.3 300.7 0 288.9s5.9-22.8 16.1-28.7l448-256c10.7-6.1 23.9-5.5 34 1.4z"></path></svg>"""
rdf_svg = """<svg width="24" height="24" viewBox="-10 -5 1034 1034" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1"><path fill="#000000" d="M704 227q-40 0 -74.5 20.5t-53.5 56.5q-23 43 -15 92l-2 -2v6q-1 9 -7 19q-7 15 -23 30q-20 19 -50.5 38t-57.5 28q-22 7 -40 7q-14 0 -24 -4l-8 -3l3 3l-8 -4q-35 -19 -73.5 -17.5t-72 22t-52 55.5t-17 74t22 72t55.5 52q40 21 83.5 16.5t76.5 -31.5l-1 2l7 -4 q9 -3 21 -3q17 -1 39 5q27 8 59 25q48 26 70 56q15 19 16 37q-1 42 19.5 78.5t58.5 56.5q35 18 73.5 16.5t72 -22t52 -55.5t17 -74t-22 -72t-55.5 -51q-7 -4 -15 -7l3 -1l-5 -4q-6 -5 -11 -16q-8 -15 -12 -36q-6 -27 -7 -63t3 -63q4 -22 11 -37q5 -11 12 -18l5 -4h-5 q41 -21 62 -62q19 -35 17.5 -73.5t-22 -71.5t-55.5 -52q-33 -18 -70 -17zM706 250q39 0 66 25v0q-15 -13 -44.5 -10t-58.5 22q8 8 8.5 20t-8 21.5t-21.5 9.5h-8l-2 -1q-12 -4 -21 8q-16 29 -16 56.5t15 42.5q-20 -19 -27 -46.5t0.5 -56t28.5 -51.5q18 -19 41 -29.5t47 -10.5 zM605 491q11 0 18 3.5t14 7.5q13 7 27 11q11 11 20 33q11 33 12.5 84t-10.5 84q-9 22 -22 34q-20 9 -36 23q-14 5 -36 1q-34 -6 -81 -31q-49 -26 -73 -54q-14 -17 -17 -32q2 -18 -1 -37v1l1 -6q1 -8 7 -18q8 -13 24 -28q20 -18 50 -37q62 -38 103 -39zM279 525q39 0 66 25 h-1q-14 -13 -44 -10t-58 22q7 8 7.5 20t-8 21.5t-20.5 9.5q-4 1 -8 0l-2 -1q-13 -4 -22 8q-15 29 -15.5 56.5t14.5 42.5q-20 -19 -26.5 -46.5t1 -56t28.5 -51.5q18 -19 41 -29.5t47 -10.5zM731 758q39 0 66 25v0q-14 -13 -44 -10t-59 22q8 8 8.5 20t-8 21.5t-21.5 9.5 q-4 0 -8 -1h-2q-12 -4 -21 8q-16 29 -16 56.5t15 42.5q-20 -19 -27 -46.5t0.5 -56t28.5 -51.5q18 -19 41 -29.5t47 -10.5z" /></svg>"""


class ShmarqlLexer(SparqlLexer):
    name = "shmarql"
    aliases = ["shmarql"]


class ShmarqlWrapperPostprocessor(Postprocessor):

    OPEN_RE = re.compile(r'(<div[^>]*class="[^"]*language-shmarql[^"]*"[^>]*>)')
    # The block always ends with </div> at the outermost level —
    # mkdocs/pymdownx emits exactly one such wrapper div per block,
    # so we can track depth ourselves

    def run(self, text: str) -> str:
        result = []
        pos = 0
        idx = 0
        for m in self.OPEN_RE.finditer(text):
            idx += 1
            result.append(text[pos : m.start()])
            result.append(
                f'<div id="shmarql-wrapper-{idx}" data-wrapper="shmarql-wrapper-{idx}" class="shmarql-wrapper" style="display: none">'
            )
            result.append(m.group(1))
            # Now find the matching closing </div> by counting depth
            depth = 1
            i = m.end()
            while i < len(text) and depth > 0:
                if text[i : i + 4] == "<div":
                    depth += 1
                    i += 4
                elif text[i : i + 6] == "</div>":
                    depth -= 1
                    if depth == 0:
                        result.append(text[m.end() : i + 6])
                        result.append(
                            f'</div><a data-wrapper="shmarql-wrapper-{idx}" class="shmarql_sparql_display" title="Show/Hide the SPARQL query" href="#">{rdf_svg}</a>'
                        )  # close shmarql-wrapper
                        pos = i + 6
                        break
                    i += 6
                else:
                    i += 1
        result.append(text[pos:])
        return "".join(result)


class CustomCodeBlockExtension(CodeHiliteExtension):

    def extendMarkdown(self, md: Markdown):
        super().extendMarkdown(md)
        self._register_lexer()

        # Priority 1 = runs after the built-in raw_html postprocessor (priority 30)
        # which is what actually restores the stash
        md.postprocessors.register(
            ShmarqlWrapperPostprocessor(md),
            "shmarql_wrapper",
            priority=1,
        )

    def _register_lexer(self):
        try:
            find_lexer_class_by_name("shmarql")
        except ClassNotFound:
            from pygments.lexers import LEXERS

            LEXERS["ShmarqlLexer"] = (
                "shmarql.markdownplugin",
                ShmarqlLexer.name,
                tuple(ShmarqlLexer.aliases),
                ShmarqlLexer.filenames,
                ShmarqlLexer.mimetypes,
            )


def makeExtension(**kwargs):
    return CustomCodeBlockExtension(**kwargs)
