import os, sqlite3, sys, argparse, gzip
from rdflib import Literal, URIRef, Namespace
import rdflib.plugins.parsers.ntriples as NT
from rdflib.plugins.sparql.evaluate import evalBGP
from rdflib.plugins.sparql import CUSTOM_EVALS
from rdflib.term import Variable
import rdflib.parser
import logging
from rich.progress import wrap_file
from .config import FTS_FILEPATH

"""Allows Fulltext searches over all the literals in the triplestore

Later: Add some options to do language-specific stemming.
"""

DB_SCHEMA = """
CREATE VIRTUAL TABLE IF NOT EXISTS literal_index USING fts5(uri UNINDEXED, txt);
CREATE VIRTUAL TABLE IF NOT EXISTS literal_index_vocab USING fts5vocab('literal_index', 'row');
CREATE VIRTUAL TABLE IF NOT EXISTS literal_index_spellfix USING spellfix1;
"""

INDEX_BUF_SIZE = 999

SHMARQL_NS = Namespace("https://epoz.org/shmarql/")


def search(q: Literal):
    db = sqlite3.connect(FTS_FILEPATH)
    db.enable_load_extension(True)
    if sys.platform == "darwin":
        db.load_extension("/usr/local/lib/fts5stemmer.dylib")
        db.load_extension("/usr/local/lib/spellfix.dylib")
    else:
        db.load_extension("/usr/local/lib/spellfix")
        db.load_extension("/usr/local/lib/fts5stemmer")

    cursor = db.execute(
        "SELECT distinct uri FROM literal_index WHERE txt match (SELECT word FROM literal_index_spellfix WHERE word MATCH ? LIMIT 1)",
        (str(q),),
    )
    return [row[0] for row in cursor.fetchall()]


def get_q(ctx, s, uris):
    for uri in uris:
        if isinstance(s, URIRef):
            if str(s) != uri:
                continue
        c = ctx.push()
        c[s] = URIRef(uri)
        yield c.solution()


def fts_eval(ctx, part):
    if part.name != "BGP":
        raise NotImplementedError()
    rest = []

    for s, p, o in part.triples:
        if p == SHMARQL_NS.fts_match:
            if isinstance(o, Literal):
                return get_q(
                    ctx, s, search(o)
                )  # but this will only do the first query found... need to support > 1
        else:
            rest.append((s, p, o))

    if rest:
        return evalBGP(ctx, rest)


CUSTOM_EVALS["fts_eval"] = fts_eval


def check(buf, db, size_limit=0):
    if len(buf) > size_limit:
        logging.debug(f"Doing an insert into literal_index of {len(buf)} entries")
        db.executemany(f"INSERT INTO literal_index VALUES (?, ?)", buf)
        buf = []
    return buf


def init_fts(graph, fts_filepath):
    db = sqlite3.connect(fts_filepath)
    db.enable_load_extension(True)
    if sys.platform == "darwin":
        db.load_extension("/usr/local/lib/fts5stemmer.dylib")
        db.load_extension("/usr/local/lib/spellfix.dylib")
    else:
        db.load_extension("/usr/local/lib/spellfix")
        db.load_extension("/usr/local/lib/fts5stemmer")
    db.executescript(DB_SCHEMA)

    count = db.execute("SELECT count(*) FROM literal_index").fetchone()[0]
    if count < 1:
        # There are no literals in the DB yet, let's index
        logging.debug("Nothing found in FTS, now indexing...")
        buf = []
        for s, p, o in graph.triples((None, None, None)):
            uri_txt = (str(s), str(o))
            if isinstance(o, Literal):
                buf.append(uri_txt)
            buf = check(buf, db, INDEX_BUF_SIZE)
        check(buf, db)

        db.execute(
            "INSERT INTO literal_index_spellfix(word) select term from literal_index_vocab"
        )

        db.commit()


class NTFileReader:
    """
    Specify a n-triples file to read, (can be gzip compressed) and will emit the tripls from that file in the .triples call.
    For example:
      n = NTFileReader("somefile.nt.gz")
      for s,p,o in n.triples((None, None, None)):
          print(s)

    NOTE: currently the triple pattern passed in is simply ignored, all triples are returned.
          In future we could consider adding a filter
    """

    def __init__(self, inputfilepath, count=None):
        self.parser = NT.NTParser()
        self.inputfilepath = inputfilepath
        statinfo = os.stat(inputfilepath)
        self.inputfilepath_size = statinfo.st_size
        self.current_triple = (None, None, None)

    def add(self, triple):
        self.current_triple = triple

    def triples(self, triple):
        if self.inputfilepath.lower().endswith(".gz"):
            F = gzip.open(self.inputfilepath)
        else:
            F = open(self.inputfilepath)
        with wrap_file(F, self.inputfilepath_size) as inputfile:
            line = inputfile.readline()
            while len(line) > 0:
                self.parser.parse(rdflib.parser.StringInputSource(line), self)
                yield self.current_triple
                line = inputfile.readline()
        F.close()


if __name__ == "__main__":
    # For very large graphs, we also want to allow calling the init method from the cmdline
    argparser = argparse.ArgumentParser()
    argparser.add_argument(
        "inputfile",
        help="The inputfile to index, currently only ntriples (.nt) are supported",
    )
    argparser.add_argument(
        "fts_sqlite_file",
        help="The path to the sqlite file that will be created with the FTS data",
    )
    args = argparser.parse_args()
    nfr = NTFileReader(args.inputfile)
    init_fts(nfr, args.fts_sqlite_file)
