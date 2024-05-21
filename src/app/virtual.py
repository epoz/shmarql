# A Virtual GRAPH that dynamically fills up based on queries performed
import sys, sqlite3, io
from tree_sitter import Language, Parser
import pyoxigraph as px

if sys.platform == "darwin":
    SPARQL = Language("/usr/local/lib/sparql.dylib", "sparql")
else:
    SPARQL = Language("/usr/local/lib/sparql.so", "sparql")

PARSER = Parser()
PARSER.set_language(SPARQL)


class VirtualGraph:
    def get_triples_from_fts(self, iris: list[str]):
        db = sqlite3.connect(self.FTS_FILEPATH)
        db.enable_load_extension(True)
        if sys.platform == "darwin":
            db.load_extension("/usr/local/lib/fts5stemmer.dylib")
            db.load_extension("/usr/local/lib/spellfix.dylib")
        else:
            db.load_extension("/usr/local/lib/spellfix")
            db.load_extension("/usr/local/lib/fts5stemmer")

        try:
            vals = ", ".join([f"'{i.strip('<>')}'" for i in iris])
            SQL = f"SELECT subject, predicate, txt FROM literal_index WHERE subject in ({vals}) LIMIT 10000"
            return [
                f"<{subject}> <{predicate}> {txt} ."
                for subject, predicate, txt in db.execute(SQL)
            ]
        except sqlite3.OperationalError:
            return []

    def quads_for_pattern(self, subject, predicate, obj):
        raise NotImplementedError()

    def __len__(self):
        return len(self.store)

    def __init__(self, FTS_FILEPATH):
        self.store = px.Store()
        self.FTS_FILEPATH = FTS_FILEPATH

    def query(self, query: str):
        cst = PARSER.parse(query.encode("utf8"))
        iris = [
            n.text.decode("utf8")
            for n, name in SPARQL.query("(iri_reference) @aniri").captures(
                cst.root_node
            )
        ]
        triples = self.get_triples_from_fts(iris)
        if len(triples) > 0:
            self.store.bulk_load(
                io.StringIO("\n".join(triples)), "application/n-triples"
            )
        return self.store.query(query)
