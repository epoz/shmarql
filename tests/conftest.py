from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from rdflib import Graph

from shmarql.config import Settings
from shmarql.main import create_app
from shmarql.profiles import ProfileRegistry

from fake_endpoint import FakeSparqlEndpoint

FIXTURES = Path(__file__).parent / "fixtures"

MAIN_ENDPOINT = "http://triplestore.test/sparql"
OTHER_ENDPOINT = "http://other.test/sparql"


@pytest.fixture
def data_graph() -> Graph:
    g = Graph()
    g.parse(FIXTURES / "data.ttl", format="turtle")
    return g


@pytest.fixture
def endpoint(data_graph) -> FakeSparqlEndpoint:
    return FakeSparqlEndpoint(data_graph)


@pytest.fixture
def registry() -> ProfileRegistry:
    return ProfileRegistry.from_data(
        {
            "default": "main",
            "profiles": [
                {
                    "name": "main",
                    "title": "Main store",
                    "description": "The test triplestore",
                    "endpoint": MAIN_ENDPOINT,
                    "headers": {"X-Api-Key": "secret"},
                    "uri_prefixes": ["http://example.org/"],
                },
                {
                    "name": "other",
                    "title": "Other store",
                    "endpoint": OTHER_ENDPOINT,
                    "allow_update": True,
                    "uri_prefixes": ["http://other.example/"],
                },
            ],
        }
    )


@pytest.fixture
def settings(tmp_path) -> Settings:
    return Settings(
        _env_file=None,
        site_title="Test Site",
        docs_path=FIXTURES / "docs",
        profiles_path=tmp_path / "missing.yaml",
    )


@pytest.fixture
def client(settings, registry, endpoint):
    app = create_app(settings=settings, registry=registry, transport=endpoint.transport)
    with TestClient(app) as c:
        yield c
