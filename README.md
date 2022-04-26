# SPARQL-SHMARQL

Running example can be viewed here: [https://epoz.org/shmarql](https://epoz.org/shmarql)

A SPARQL endpoint explorer, that allows you to "bounce" the _subject_, _predicate_ or _object_ around for a public SPARQL endpoint so that you can explore the shape of the data.
useful if you encounter a new dataset that you do not know and would like to quickly get a feel of what the data looks like.

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
