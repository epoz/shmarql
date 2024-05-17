import os, sqlite3, sys, argparse, gzip
import logging
from rich.progress import wrap_file
from .config import FTS_FILEPATH
import pyoxigraph as px

"""Allows Fulltext searches over all the literals in the triplestore

Later: Add some options to do language-specific stemming.
"""

DB_SCHEMA = """
CREATE VIRTUAL TABLE IF NOT EXISTS literal_index USING fts5(subject UNINDEXED, predicate UNINDEXED, txt);
CREATE VIRTUAL TABLE IF NOT EXISTS literal_index_vocab USING fts5vocab('literal_index', 'row');
CREATE VIRTUAL TABLE IF NOT EXISTS literal_index_spellfix USING spellfix1;
CREATE TABLE IF NOT EXISTS lock(nonce PRIMARY KEY);
"""

INDEX_BUF_SIZE = 999999


def search(q: str):
    db = sqlite3.connect(FTS_FILEPATH)
    db.enable_load_extension(True)
    if sys.platform == "darwin":
        db.load_extension("/usr/local/lib/fts5stemmer.dylib")
        db.load_extension("/usr/local/lib/spellfix.dylib")
    else:
        db.load_extension("/usr/local/lib/spellfix")
        db.load_extension("/usr/local/lib/fts5stemmer")

    try:
        cursor = db.execute(
            "SELECT distinct subject FROM literal_index WHERE txt match ?",
            (q,),
        )
    except sqlite3.OperationalError:
        return []
    return [row[0] for row in cursor.fetchall()]


def check(buf, db, size_limit=0):
    if len(buf) > size_limit:
        logging.debug(f"Doing an insert into literal_index of {len(buf)} entries")
        db.executemany(f"INSERT INTO literal_index VALUES (?, ?, ?)", buf)
        buf = []
    return buf


def init_fts(triple_func, fts_filepath):
    logging.debug(f"Init FTS {fts_filepath}")
    db = sqlite3.connect(fts_filepath)
    db.enable_load_extension(True)
    if sys.platform == "darwin":
        db.load_extension("/usr/local/lib/fts5stemmer.dylib")
        db.load_extension("/usr/local/lib/spellfix.dylib")
    else:
        db.load_extension("/usr/local/lib/spellfix")
        db.load_extension("/usr/local/lib/fts5stemmer")
    db.executescript(DB_SCHEMA)

    try:
        db.execute("INSERT INTO lock VALUES (42)")
        db.commit()
    except sqlite3.IntegrityError:
        logging.debug("Lock not acquired, skipping indexing")
        return

    logging.debug("Lock acquired, checking index count...")
    count = db.execute("SELECT count(*) FROM literal_index").fetchone()[0]
    if count < 1:
        # There are no literals in the DB yet, let's index
        logging.debug("Nothing found in FTS, now indexing...")

        buf = []
        for s, p, o, _ in triple_func(None, None, None):
            uri_txt = (str(s).strip("<>"), str(p).strip("<>"), str(o))
            buf.append(uri_txt)
            buf = check(buf, db, INDEX_BUF_SIZE)
        check(buf, db)

        db.execute(
            "INSERT INTO literal_index_spellfix(word) select term from literal_index_vocab"
        )

    db.execute("DELETE FROM lock")
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
        self.inputfilepath = inputfilepath
        statinfo = os.stat(inputfilepath)
        self.inputfilepath_size = statinfo.st_size
        self.current_triple = (None, None, None)

    def triples(self, s, p, o):
        if self.inputfilepath.lower().endswith(".gz"):
            F = gzip.open(self.inputfilepath)
        else:
            F = open(self.inputfilepath)
        with wrap_file(F, self.inputfilepath_size) as inputfile:
            line = inputfile.readline()
            while len(line) > 0:
                line = line.strip()
                if line.endswith(" ."):
                    line = line[:-2]
                    parts = line.split(" ")
                    if len(parts) > 2:
                        s = parts[0]
                        p = parts[1]
                        o = " ".join(parts[2:])
                        yield s, p, o, None
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
    init_fts(nfr.triples, args.fts_sqlite_file)
