import logging, os, sqlite3
import igraph as ig
import gensim
import voyager
from .config import RDF2VEC_FILEPATH
import numpy as np


def rdf2vec_search(node_uri: str):
    if not RDF2VEC_FILEPATH:
        return None

    DB = sqlite3.connect(RDF2VEC_FILEPATH + ".db")
    found = False
    for row in DB.execute(
        "SELECT vector FROM rdf2vec_index WHERE uri = ?", (node_uri,)
    ):
        vector = np.frombuffer(row[0], dtype=np.float32)
        found = True
    if not found:
        return []

    index = voyager.Index.load(RDF2VEC_FILEPATH)
    ids, distance = index.query(vector, 99)
    ids_as = ",".join(str(anid) for anid in ids)
    results = [
        uri.strip("<>")
        for id, uri in DB.execute(
            f"SELECT id, uri FROM rdf2vec_index WHERE id IN ({ids_as})"
        )
        if uri.startswith("<")
    ]
    return results


def init_rdf2vec(triple_func, rdf2vec_filepath):
    logging.debug(f"Init RDF2Vec {rdf2vec_filepath}")
    if os.path.exists(rdf2vec_filepath):
        logging.debug(f"RDF2Vec {rdf2vec_filepath} already exists, skipping")
        return

    nodes = set()
    edges = set()
    as_ints = []
    for s, p, o, _ in triple_func(None, None, None):
        nodes.add(s)
        nodes.add(o)
        edges.add(p)
    nodemap = {n: i for i, n in enumerate(nodes)}
    nodemap_inv = {v: k for k, v in nodemap.items()}
    edgemap = {e: i for i, e in enumerate(edges)}
    edgemap_inv = {v: k for k, v in edgemap.items()}

    only_subjects = set()
    for s, p, o, _ in triple_func(None, None, None):
        as_ints.append((nodemap[s], edgemap[p], nodemap[o]))
        only_subjects.add(nodemap[s])

    graph = ig.Graph(n=len(nodes))
    graph.add_edges([(s, o) for s, p, o in as_ints])
    graph.es["p_i"] = [p for s, p, o in as_ints]

    data = set(
        tuple(
            [tuple(graph.random_walk(s, 15)) for s in only_subjects for x in range(100)]
        )
    )

    model = gensim.models.Word2Vec(
        sentences=data, vector_size=100, window=5, min_count=1, workers=4
    )
    vectors = [model.wv.get_vector(node_id) for node_id in nodemap_inv]

    index = voyager.Index(voyager.Space.Cosine, 100)
    index.add_items(vectors)
    index.save(rdf2vec_filepath)
    logging.debug(f"RDF2Vec {rdf2vec_filepath} created")

    DB = sqlite3.connect(rdf2vec_filepath + ".db")
    DB_SCHEMA = """
CREATE TABLE IF NOT EXISTS rdf2vec_index (id INTEGER PRIMARY KEY, uri TEXT, vector BLOB);
CREATE INDEX IF NOT EXISTS rdf2vec_index_uri ON rdf2vec_index (uri);
"""
    DB.executescript(DB_SCHEMA)
    to_insert = [
        (i, str(nodemap_inv[i]), vector.tobytes())
        for i, vector in zip(nodemap_inv, vectors)
    ]
    DB.executemany("INSERT OR IGNORE INTO rdf2vec_index VALUES (?, ?, ?)", to_insert)
    DB.commit()
    logging.debug(f"RDF2Vec mapping saved in {rdf2vec_filepath}.db")
