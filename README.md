# SPARQL-SHMARQL

Running example can be viewed here: [https://epoz.org/shmarql](https://epoz.org/shmarql)

A SPARQL endpoint explorer, that allows you to "bounce" the _subject_, _predicate_ or _object_ around for a public SPARQL endpoint so that you can explore the shape of the data.
useful if you encounter a new dataset that you do not know and would like to quickly get a feel of what the data looks like.

This makes use of [Transcrypt](https://www.transcrypt.org/) to manipulate and format the results using Python in stead of Javascript.
If you would like to modify/run this code yourself, you thus need to first install Transcrypt in a suitable Python environment, and then transpile the code to Javascript so that it can be loaded in the browser.

## Development instructions

If you would like to run and modify the code in this repo, there is a [Dockerfile](Dockerfile) which includes the necessary versions of the required libraries.

First, build the Docker image like so:

```shell
docker build -t shmarql_dev .
```

If all goes well, this should give you a "shmarql_dev" image which you can use to compile your own copy of the Javascript code to run SHMARQL on a webpage.

To compile the file `shmarql.py` you need to run:

```shell
docker run --rm -it -v $(pwd):/out shmarql_dev -bm -od s shmarql.py
```

Which should compile the Python code and place the output in a sub-directory `./s/`
