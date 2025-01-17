A Linked Data publishing platform for semantic web professionals in a hurry.
Make compelling queries and documentation of your RDF data, using an open-source, simple platform.

## [TL;DR](https://en.wikipedia.org/wiki/TL;DR)

Similar to LODView, LODE, YASGUI and a triplestore, but in Python with modern web standards.

## Quickstart

You have some RDF documents in a folder on your disk somewhere, and you have Docker installed, then from the folder that contains your .nt or .ttl files, run:

```shell
docker run --rm -it \
  -v $(pwd):/data -e DATA_LOAD_PATHS=/data \
  -p 8000:8000 ghcr.io/epoz/shmarql
```

Now you can browse and query your data at [http://localhost8000:shmarql/](http://localhost:/shmarql/)
