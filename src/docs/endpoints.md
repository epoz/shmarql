# Using other triplestores

## Configuring an existing triplestore

It is possible to use the built-in triplestore, or you can use Shmarql to act as a front-end to an existing triplestore. Popular choices would be products like Virtuoso, Fuseki, GraphDB, QLever or Oxigraph.
You then install, configure and run a triplestore separately from the Shmarql installation and "point" at your existing triplestore by configuring the ENDPOINT variable. For example:

```shell hl_lines="2"
docker run --rm -it -p 8000:8000 \
     -e ENDPOINT=http://192.168.1.15:8890/sparql \
     ghcr.io/epoz/shmarql
```

The above will provide a Shmarql view of a Virtuoso instance running on an IP address that can be reached from inside the Shmarql container. This could also be any existing public SPARQL endpoint.

## Multiple Endpoints

It is also possible to have multiple endpoints exposed, for performance, reliability or testing reasons. Use the ENDPOINTS variable, with a space-separated list of addresses prefixed with a name + | symbol, for example:

`virtuoso|http://192.168.1.15:8890/sparql qlever|http://192.168.1.15:7019/`

The Shmarql query processor will choose one of the endpoints at random to service requests, or you can explicitly choose an endpoint to use by adding a comment to you SPARQL query, of the form `# shmarql-engine: some_name` where `some_name` is one of the names used in your ENDPOINTS variable.

For example, using this run command:

```shell hl_lines="2"
docker run --rm -it  -p 8000:8000 \
    -e 'virtuoso|http://192.168.1.15:8890/sparql qlever|http://192.168.1.15:7019/' \
    ghcr.io/epoz/shmarql
```

you can specify the endpoint in a query like so:

```sparql hl_lines="1"
# shmarql-engine: qlever
select * where {?s ?p ?o} limit 42
```
