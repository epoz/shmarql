---
title: Demo Story
description: A small data story.
lodeon:
  htmlMeta:
    description: A small data story.
  openGraph:
    title: Demo Story
  jsonLd:
    "@context": https://schema.org
    "@type": ScholarlyArticle
    headline: Demo Story
---

# Demo Story

![Painting](assets/pic.png)

```shmarql {title="People" kg="main"}
SELECT ?s WHERE { ?s a <http://schema.org/Person> }
```

```lodeon-visualization {title="Distribution"}
{"version":1,"renderer":"plotly","figure":{"data":[{"type":"bar","x":["a"],"y":[1]}]}}
```

```lodeon-embed {title="External viewer"}
{"version":1,"renderer":"iframe","url":"https://player.example.org/viewer/one","caption":"An embed"}
```
