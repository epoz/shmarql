# Fizzysearch

Shmarql has support for [Fizzysearch](https://ise-fizkarlsruhe.github.io/fizzysearch/) built-in. This means you can add extra search options to an existing triplestore, like flexible fulltext searches, RDF2Vec searches or semantic embeddings.

## Fulltext

When a FTS index has been configured, you can do queries that look like this:

```sparql hl_lines="2"
select ?s where {
    ?s fizzy:fts "something" .
}
```

This will then do a fulltext query looking for all triples that have a literal string matching the word "something".
It is also possible to use wildcards and boolean queries.

## RDF2vec

When a RDF2Vec index has been configured, you can do queries that look like this:

```sparql hl_lines="2"
select distinct ?s (STR(?o) AS ?oLabel) where {
  ?s fizzy:rdf2vec <https://example.com/entity/xyz> .
  ?s rdfs:label ?o .
}
```

This searches for all entities similar to `<https://example.com/entity/xyz>`, and then selects the rdfs:label for display.
