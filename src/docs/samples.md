## Term count

```sparql
# counts  all defined terms in the triple store

PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

SELECT (NOW() AS ?date) (xsd:integer(COUNT(?term)) AS ?count)
WHERE {
    ?term a <http://schema.org/DefinedTerm> .
}
```

## Instance count

```sparql
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

SELECT (NOW() AS ?date) ?type (xsd:integer(COUNT(?s)) AS ?count)
WHERE {
  ?subject a ?type .
}
GROUP BY ?type
ORDER BY ?type
```

## Resource count

```sparql
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

SELECT (NOW() AS ?date) (xsd:integer(COUNT(DISTINCT ?resource)) AS ?count)
WHERE {
  ?resource ?p ?o .
}
```

## Triple count

```sparql
# counts all triples in a triple store and returns
# the total number together with a current timestamp

PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

SELECT (NOW() AS ?date) (xsd:integer(COUNT(*)) AS ?count) WHERE {
   ?s ?p ?o
}

```

## Service Queries

```sparql
# shmarql-view: barchart
#
PREFIX cto: <https://w3id.org/cto#>
PREFIX ct: <http://data.linkedct.org/resource/linkedct/>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX owl: <http://www.w3.org/2002/07/owl#>
PREFIX schema: <http://schema.org/>
PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX wikibase: <http://wikiba.se/ontology#>
PREFIX bd: <http://www.bigdata.com/rdf#>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX dc: <http://purl.org/dc/elements/1.1/>
PREFIX nfdicore: <https://nfdi.fiz-karlsruhe.de/ontology/>
PREFIX iconclass: <https://iconclass.org/>
PREFIX cto: <https://nfdi4culture.de/ontology#>

SELECT ?resource ?resourceLabel ?dataCatalogue
WHERE {
   {
      SELECT ?resource ?resourceLabel ?dataCatalogue WHERE {
        ?resource cto:subjectConcept iconclass:31A44411 .
        ?resource rdfs:label ?resourceLabel .
        BIND("Corpus Vitrearum / NFDI4Culture" AS ?dataCatalogue) .
      } LIMIT 2
   } UNION {
      SERVICE <https://query.wikidata.org/sparql> {
         SELECT ?resource ?resourceLabel ?dataCatalogue WHERE {
  			?resource wdt:P1257 "31A44411" .
  			BIND("Wikidata" AS ?dataCatalogue) .
         } LIMIT 2
      }
   } UNION {
      SERVICE <https://api.data.netwerkdigitaalerfgoed.nl/datasets/Rijksmuseum/collection/services/collection/sparql> {
         SELECT ?resource ?resourceLabel ?dataCatalogue WHERE {
  			?resource dc:subject <http://iconclass.org/31A44411> .
  			?resource dc:title ?resourceLabel .
  			BIND("Rijksmuseum Amsterdam" AS ?dataCatalogue) .
         } LIMIT 2
      }
   }
}
```

## Classes

```shmarql
SELECT DISTINCT ?uri (COUNT(?x) as ?c) ?label WHERE {
                        ?x a ?uri
                        OPTIONAL{
        {
            ?uri <http://www.w3.org/2000/01/rdf-schema#label> ?label
        }
    }
                    } GROUP BY ?uri ?label ORDER BY DESC(?c)
```
