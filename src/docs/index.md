# Welcome to SHMARQL

## Instance Count

```shmarql
# shmarql-view: piechart
# shmarql-names: type
# shmarql-values: count
# shmarql-label: Instance Count

PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

SELECT ?type (xsd:integer(COUNT(?subject)) AS ?count)
WHERE {
  ?subject a ?type .
}
GROUP BY ?type
ORDER BY ?count
```

Or you can also view the above as a table.

```shmarql
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

SELECT ?type (xsd:integer(COUNT(?subject)) AS ?count)
WHERE {
  ?subject a ?type .
}
GROUP BY ?type
ORDER BY desc(?count)
```

Or as a barchart.

```shmarql
# shmarql-view: barchart
# shmarql-x: type
# shmarql-y: count
# shmarql-label: Instance Count

PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

SELECT ?type (xsd:integer(COUNT(?subject)) AS ?count)
WHERE {
  ?subject a ?type .
}
GROUP BY ?type
ORDER BY desc(?count)
```

## Property Counts

```shmarql
select ?p (xsd:integer(COUNT(?s)) AS ?count) where {?s ?p ?o}
group by ?p
order by desc(?count)
```
