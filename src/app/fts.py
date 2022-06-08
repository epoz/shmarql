import os, sqlite3, sys, argparse, gzip
from rdflib import Literal
import rdflib.plugins.parsers.ntriples as NT
import rdflib.parser
import logging
from rich.progress import wrap_file

"""Allows Fulltext searches over all the literals in the triplestore
Uses the language to choose the stemming algorithm, for now only does English and German.
All literals _without_ a specified language go into a non-stemmed catch-all, which also includes German and English.
"""

DB_SCHEMA = """
CREATE VIRTUAL TABLE IF NOT EXISTS literal_index USING fts5(uri UNINDEXED, txt)
CREATE VIRTUAL TABLE IF NOT EXISTS literal_index_en USING fts5(uri UNINDEXED, txt, tokenize = 'snowball english unicode61')
CREATE VIRTUAL TABLE IF NOT EXISTS literal_index_de USING fts5(uri UNINDEXED, txt, tokenize = 'snowball german unicode61')
"""

INDEX_BUF_SIZE = 999


def check(bufs, db, size_limit=0):
    for lang, buf in bufs.items():
        if len(buf) > size_limit:
            db.executemany(f"INSERT INTO literal_index{lang} VALUES (?, ?)", buf)
            logging.info(f"Inserted {len(buf)} items into {lang} index")
            bufs[lang] = []


def init_fts(graph, fts_filepath):
    db = sqlite3.connect(fts_filepath)
    db.enable_load_extension(True)
    if sys.platform == "darwin":
        db.load_extension("/usr/local/lib/fts5stemmer.dylib")
    else:
        db.load_extension("/usr/local/lib/fts5stemmer")
    cursor = db.cursor()
    for s in filter(None, DB_SCHEMA.split("\n")):
        cursor.execute(s)
    count = db.execute("SELECT count(*) FROM literal_index_en").fetchone()[0]
    if count < 1:
        # There are no literals in the DB yet, let's index
        bufs = {"_en": [], "_de": [], "": []}
        for s, p, o in graph.triples((None, None, None)):
            uri_txt = (str(s), str(o))
            if isinstance(o, Literal):
                bufs[""].append(uri_txt)
                if o.language == "de":
                    bufs["_de"].append(uri_txt)
                elif o.language == "en":
                    bufs["_en"].append(uri_txt)
            check(bufs, db, INDEX_BUF_SIZE)
        check(bufs, db)
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
