# SHMARQL Documentation

## Using a full-text index

There is support for creating full-text indexes for search over your knowledge graphs using the [SQLite FTS5 Extension](https://www.sqlite.org/fts5.html).

For example, given the `foaf.ttl` file in this documentation directory, you can index it by running:

```
docker run --rm -it -v $(pwd):/data/ ghcr.io/epoz/shmarql python -m app.fts /data/nfdico.nt /data/nfdico.sqlite
```

(make sure you are in the ./docs/ directory when you run the command)

## Serving a LODE documentation page for your TBox

If you have a TBox ontology available, you can use SHMARQL to server up some automatic LODE documentaiton for your ontology.

For example, given the `foaf.ttl` file in this documentation directory, you could run a SHMARQL instance like this:

```
docker run --rm -it -p 8000:8000 -e TBOX_PATH=https://raw.githubusercontent.com/epoz/shmarql/main/docs/foaf.ttl ghcr.io/epoz/shmarql:latest
```

You can then open the IRI: `http://localhost:8000/_LODE` - and this should show a LODE documentation page for the FOAF ontology.

But this is not enough if you would also like the ontology to resolve for a domain in which you are creating the terminology.
You can specify for which domain the SHMARQL lode should be listening for, like this:

```
docker run --rm -it -p 8000:8000 -e DOMAIN=xmlns.com -e TBOX_PATH=https://raw.githubusercontent.com/epoz/shmarql/main/docs/foaf.ttl ghcr.io/epoz/shmarql:latest
```

Now you can try and visit: `http://localhost:8000/foaf/0.1/` -and you should also see the documentation page. If you are serving your page via HTTPS (like you should), you also need to specify the scheme, eg.

```
docker run --rm -it -p 8000:8000 -e SCHEME=https -e DOMAIN=xmlns.com -e TBOX_PATH=https://raw.githubusercontent.com/epoz/shmarql/main/docs/foaf.ttl ghcr.io/epoz/shmarql:latest
```

Note: this will only work if your shmarql instance is actually behind some form of https proxy.
