# Example running Virtuoso with a SHMARQL view

This is an exmaple for running a Virtuoso instance, with a prepared "view"
of the intended data pre-rolled.
It can be useful if you would like to have some data queryable in a form for an audience that is not
really familiar with knowledge bases and triple stores, and who just want to view and basically
query some data.

Run this with:

```
docker-compose up
```

This will then give you a simple web interface running on `http://localhost:42001` and a virtuoso instance on `http://localhost:42002`

Load some data into the triplestore, and then you can use the web interface to tailor what the initial display of the data is.

There are some default prefixes defined in the SHMARQL, but you can also add some more if you need to extend it, see this part:

```
document.shmarql_prefix = {
    "ddb":"https://www.deutsche-digitale-bibliothek.de/",
    "gnd": "https://d-nb.info/gnd/",
    "viaf": "http://viaf.org/viaf/"
}
```

in the [index.html](index.html) file.

Note that the SHMARQL list display is started with this query (also in `index.html`):

```
<div class="container-fluid" id="shmarql" data-endpoint="/sparql">
    select ?person ?label where { ?person ?p &lt;http://xmlns.com/foaf/0.1/Person&gt; .
?person &lt;http://www.w3.org/2000/01/rdf-schema#label&gt; ?label } LIMIT 500</div>
  </body>
```

The tricky part is that you need to take care that the HTML elements for < and > are taken care of properly. Possible a good idea to handle this differently.... 🥴 (adding it to the todo list, current thinking is to just add a q= query parameter in URL)
