Here is an overview of the various settings that can be configured at startup.

In keeping with principles of [Twelve-factor apps](https://12factor.net/config)
we configure the system via environment variables.

## DEBUG

Default is 0

When set to 1, more debug info is printed to the logs.

```shell
docker run -e DEBUG=1 --rm ghcr.io/epoz/shmarql:latest
```

## ENDPOINT

The address of a SPARQL triplestore to which queries are made. eg.

```shell
docker run -e ENDPOINT=https://query.wikidata.org/sparql -p 8000:8000 --rm ghcr.io/epoz/shmarql:latest
```

## DATA_LOAD_PATHS

A directory or URL from which triples can be loaded. This can either be the path in the filesystem of the running container (which then also needs to be mapped as a volume). For example, if you have a .ttl file on disk somewhere, from that same directory run:

```shell
docker run -e DATA_LOAD_PATHS=/data -v $(pwd):/data -p 8000:8000 --rm ghcr.io/epoz/shmarql:latest
```

This will look for all files named, .nt .ttl .nt.gz or .ttl.gz and load them into a local triplestore.

### Specifying HTTP locations

You can also specify (one or more) HTTP locations to load the data from, for example:

```shell
docker run -e DATA_LOAD_PATHS=https://yogaontology.org/ontology.ttl   -p 8000:8000 --rm ghcr.io/epoz/shmarql:latest
```

## SITE_URI

The external URL from which this instance is reached over the internet. This is useful if you want to use SHMARQL to do the content-negotiation for you to resolve class documentation in an ontology, or to show resolvable URIs from a knowledge graph.

## QUERIES_DB

The full path to a location on a fileystem of a database file used to store cached queries.

## FTS_FILEPATH

The path on a filesystem used to do fulltext queries using [fizzysearch](https://ise-fizkarlsruhe.github.io/fizzysearch/).

## RDF2VEC_FILEPATH

The path on a filesystem used to do RDF2Vec queries using [fizzysearch](https://ise-fizkarlsruhe.github.io/fizzysearch/).

## MOUNT

A prefix mount point that will be added to the start of all web requests served. This is useful if the SHMARQL instance is being proxied as part of a bigger application, and you wish to have all requests be prefixed with a certain path.

It should normally start (and end) with a slash, for example:

```shell
docker run -e MOUNT=/yoga/ -e DATA_LOAD_PATHS=https://yogaontology.org/ontology.ttl -p 8000:8000 --rm ghcr.io/epoz/shmarql:latest
```

And now, you would access this from the browser at http://127.0.0.1:8000/yoga/shmarql

## SCHPIEL_PATH

A path to a location from which files will be served over HTTP. These files are "overlayed" into the files served from the docs folder, and have priority over the docs. So you can replace items in the docs folder by files from here. See also the `MOUNT` configuration option.
