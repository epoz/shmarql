from pygments.lexers.rdf import SparqlLexer
from markdown.extensions.codehilite import CodeHiliteExtension
from markdown import Markdown
from pygments.lexers import find_lexer_class_by_name
from pygments.util import ClassNotFound

SparqlLexer.aliases.append("shmarql")

__all__ = ["ShmarqlLexer"]


class ShmarqlLexer(SparqlLexer):
    """A custom lexer for SPARQL syntax, mirroring the default SparqlLexer."""

    name = "shmarql"
    aliases = ["shmarql"]


class CustomCodeBlockExtension(CodeHiliteExtension):
    """Extend the CodeHilite extension to recognize `shmarql` blocks."""

    def extendMarkdown(self, md: Markdown):
        super().extendMarkdown(md)
        try:
            _ = find_lexer_class_by_name("shmarql")
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
    return CustomCodeBlockExtension(lang="shmarql")
