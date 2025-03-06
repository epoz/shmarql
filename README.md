# SHMARQL

A Linked Data publishing platform for semantic web professionals in a hurry. Make compelling queries and documentation of your RDF data, using an open-source, simple platform.

Documentation here: https://shmarql.com/

## TL;DR

SHMARQL also has a built-in triplestore which you can use to share your RDF data over a SPARQL interface. To use it, you need to specify the path from which to load the datafiles at startup, using an environment variable: `DATA_LOAD_PATHS`.
This also means that the path in which the data is stored is "visible" to the docker container via for example a mounted volume.

Here is an example, where you have some .ttl files stored in your current directory:

```shell
docker run --rm -p 8000:8000 -it -v $(pwd):/data -e DATA_LOAD_PATHS=/data  ghcr.io/epoz/shmarql:latest
```

This will load all .ttl files found in the specified directory, and make it available under a /sparql endpoint, eg. http://localhost:8000/sparql

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
