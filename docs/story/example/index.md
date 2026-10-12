---
title: Cats of Wikidata
description: A tiny example data story in the LODEON format.
lodeon:
  htmlMeta:
    description: A tiny example data story in the LODEON format.
  openGraph:
    title: Cats of Wikidata
    type: article
  jsonLd:
    "@context": https://schema.org
    "@type": ScholarlyArticle
    headline: Cats of Wikidata
---

# Cats of Wikidata

This story shows the LODEON Special Nodes supported by SHMARQL. The query below
runs against the `wikidata` profile (`kg="wikidata"`).

```shmarql {title="Some famous cats" kg="wikidata"}
SELECT ?cat ?catLabel WHERE {
  ?cat wdt:P31 wd:Q146 .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
LIMIT 10
```

A chart with inline data:

```lodeon-visualization {title="Cats per household (made-up data)"}
{"version":1,"renderer":"plotly","figure":{"data":[{"type":"bar","x":["0","1","2","3+"],"y":[52,30,12,6]}],"layout":{"height":320}}}
```
