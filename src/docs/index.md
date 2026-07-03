# Welcome to SHMARQL

You can start [exploring the data](data_overview.md) in the KG which has been configured.
Or you can [perform your own queries](queries.md).

## Some random triples

Here are some random triples from the knowledge graph to get the ball rolling.

```shmarql
SELECT ?resource ?label
WHERE {
  ?resource a ?type .
  OPTIONAL {
    ?resource rdfs:label ?label .
  }
}
OFFSET 4242
LIMIT 10
```
