import time, random, logging, os, sqlite3
import pyoxigraph as px
import voyager
from sentence_transformers import SentenceTransformer
from .config import SBERT_FILEPATH
import torch

if SBERT_FILEPATH:
    SBERT_MODEL = SentenceTransformer("all-mpnet-base-v2")

device = "cuda" if torch.cuda.is_available() else "cpu"


def sbert_search(q: str):
    if not SBERT_FILEPATH:
        return None

    DB = sqlite3.connect(SBERT_FILEPATH + ".db")

    index = voyager.Index.load(SBERT_FILEPATH)
    q_emb = SBERT_MODEL.encode([q], convert_to_numpy=True)
    ids, distance = index.query(q_emb, 99)
    ids_as = ",".join(str(anid) for anid in ids[0])
    sql_query = f"SELECT id, uri FROM sbert_index WHERE id IN ({ids_as})"
    results = [
        uri.strip("<>") for id, uri in DB.execute(sql_query) if uri.startswith("<")
    ]
    logging.debug(f"SBERT search for {q} found {len(results)}")
    return results


def init_sbert(triple_func, sbert_filepath):
    # If there are multiple workers, we do not want them all to do an init.
    # Do a short wait to stagger start times and let one win, the rest will lock and open read_only
    time.sleep(random.random() / 2)

    if os.path.exists(sbert_filepath):
        logging.debug(f"SBERT {sbert_filepath} already exists, skipping")
        return

    logging.debug(f"SBERT init {sbert_filepath}")
    open(sbert_filepath, "w").write(
        ""
    )  # Write empty file to casue waiting workers to skip init

    subject_map = {}
    for s, p, o, _ in triple_func(None, None, None):
        if type(s) != px.NamedNode:
            continue
        if type(o) == px.Literal:
            subject_map.setdefault(str(s), []).append(o.value)

    tmp = ["\n".join(subject_map[s]) for s in sorted(list(subject_map.keys()))]

    embeddings = SBERT_MODEL.encode(
        tmp,
        show_progress_bar=True,
        convert_to_numpy=True,
    )

    index = voyager.Index(voyager.Space.Cosine, 768)
    index.add_items(embeddings)
    index.save(sbert_filepath)
    logging.debug(f"SBERT {sbert_filepath} created")

    DB = sqlite3.connect(sbert_filepath + ".db")
    DB_SCHEMA = """
CREATE TABLE IF NOT EXISTS sbert_index (id INTEGER PRIMARY KEY, uri TEXT);
CREATE INDEX IF NOT EXISTS sbert_index_uri ON sbert_index (uri);"""
    DB.executescript(DB_SCHEMA)
    to_insert = [(i, s) for i, s in enumerate(sorted(list(subject_map.keys())))]
    DB.executemany("INSERT OR IGNORE INTO sbert_index VALUES (?, ?)", to_insert)
    DB.commit()
    logging.debug(f"SBERT mapping saved in {sbert_filepath}.db")
