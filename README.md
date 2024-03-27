# SPARQL-SHMARQL

Running example can be viewed here: [https://epoz.org/shmarql](https://epoz.org/shmarql)

A SPARQL endpoint explorer, that allows you to "bounce" the _subject_, _predicate_ or _object_ around for a public SPARQL endpoint so that you can explore the shape of the data.
useful if you encounter a new dataset that you do not know and would like to quickly get a feel of what the data looks like.

## Running

You can test/run a local copy, if you have Docker installed by doing:

```shell
docker run --rm -p 8000:8000 -it ghcr.io/epoz/shmarql:latest
```

This will pull the latest version from the Github package registry, delete the container again after running, and export it on port 8000.
You can then view it in your browser at: [http://localhost:8000/](http://localhost:8000/)

## Using the built-in triplestore

SHMARQL also has a built-in triplestore which you can use to share your RDF data over a SPARQL interface. To use it, you need to specify the path from which to load the datafiles at startup, using an environment variable: `DATA_LOAD_PATHS`.
This also means that the path in which the data is stored is is "visible" to the docker container via for example a mounted volume.

Here is an example, where you have some .ttl files stored in a directory named `./databases`

```shell
docker run --rm -p 8000:8000 -it -v $(pwd)/databases:/data -e DATA_LOAD_PATHS=/data  ghcr.io/epoz/shmarql:latest
```

This will load all .ttl files found in the specified directory, and make it available under a /sparql endpoint, eg. http://localhost:8000/sparql

## Using full-text searches in queries

```shell
docker run --rm -it -p 8000:8000 -it -e DEBUG=1 -e FTS_FILEPATH=/fts -e DATA_LOAD_PATHS=https://yogaontology.org/ontology.ttl ghcr.io/epoz/shmarql:latest
```

[Try this query](http://localhost:8000/sparql#query=SELECT%20*%20WHERE%20%7B%0A%20%20%3Fsub%20%3Chttp%3A%2F%2Fshmarql.com%2Ffts%3E%20%22Sa*%22%20.%0A%7D&endpoint=http%3A%2F%2Flocalhost%3A8000%2Fsparql&requestMethod=POST&tabTitle=Query&headers=%7B%7D&contentTypeConstruct=application%2Fn-triples%2C*%2F*%3Bq%3D0.9&contentTypeSelect=application%2Fsparql-results%2Bjson%2C*%2F*%3Bq%3D0.9&outputFormat=table)

```sparql
SELECT * WHERE {
  ?sub <http://shmarql.com/fts> "Sa*" .
}
```

## RDF2vec

Under development is RDF2vec support. This can be enabled by adding the path to store the embeddings like so:

```shell
docker run --rm -it -p 8000:8000 -it -e DEBUG=1 -e RDF2VEC_FILEPATH=/vec -e DATA_LOAD_PATHS=https://yogaontology.org/ontology.ttl ghcr.io/epoz/shmarql:latest
```

Then you can query the triples for similar entities by using the magic predicate: `<http://shmarql.com/vec>` similar to the fulltext query above.

☣️ This is a new experimental feature, and needs more extenstive testing.

## Development instructions

If you would like to run and modify the code in this repo, there is a [Dockerfile](Dockerfile) which includes the necessary versions of the required libraries.

First, build the Docker image like so:

```shell
docker build -t shmarql .
```

Now you can run a local copy with:

```shell
docker run -it --rm -p 8000:8000 shmarql
```
