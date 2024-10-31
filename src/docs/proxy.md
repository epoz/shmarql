# Running behind a web proxy

It is possible to run shmarql behind a webserver (like nginx, Caddy) and have requests to only certain paths be served.
Only a certain prefix, like `"/shmarql*"` then needs to be forwarded by the webserver to the the shmarql Docker container, and all other content for the website can still be served by the main webserver.

A typical config line (from Caddy) would look something like this:

```
reverse_proxy /shmarql* http://shmarql:8000
```

## Alternative mountpoints

All the styling and static files needed by shmarql are designed to be served under the prefix, making integration easier. It is also possible to have the entire shmarql application to be mounted under a different extended prefix, for example, "/yet/another/example/shmarql" by using the `MOUNT` configuration option.

To do this when running shmarql, you need to start it like this:

```shell
docker run --rm -it -e MOUNT=/yet/another/example -v $(pwd):/data -e DATA_LOAD_PATHS=/data -p 8000:8000 ghcr.io/epoz/shmarql
```

Note the `-e MOUNT=/yet/another/example` configuration variable.

Then the reverse proxy setting would look like this:

```
reverse_proxy /yet/another/example/shmarql* http://shmarql:8000
```
