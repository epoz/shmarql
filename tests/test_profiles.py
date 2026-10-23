import hashlib

import pytest

from shmarql.profiles import Profile, ProfileError, ProfileRegistry, profile_key

YAML = """
default: second
display:
  label_predicates: ["http://example.org/name"]
profiles:
  - name: first
    title: First store
    endpoint: http://one.test/sparql
    uri_prefixes: http://one.example/
  - name: second
    endpoint: http://two.test/sparql
    headers: {Authorization: "Bearer x"}
    timeout: 3
    uri_prefixes: ["http://two.example/", "http://two.example/deep/"]
"""


def test_key_is_hash_of_address():
    endpoint = "https://query.wikidata.org/sparql"
    expected = hashlib.sha256(endpoint.encode()).hexdigest()[:12]
    assert profile_key(endpoint) == expected
    assert profile_key("  " + endpoint + " ") == expected  # normalised
    assert Profile(name="wd", endpoint=endpoint).key == expected
    assert Profile(name="wd", endpoint=endpoint).sparql_path == f"/sparql/{expected}"


def test_load_from_yaml(tmp_path):
    path = tmp_path / "profiles.yaml"
    path.write_text(YAML)
    registry = ProfileRegistry.from_yaml(path)
    assert len(registry) == 2
    assert registry.default.name == "second"
    second = registry.get("second")
    assert second.headers == {"Authorization": "Bearer x"}
    assert second.timeout == 3.0
    assert registry.by_key(second.key) is second
    assert registry.get(second.key) is second
    assert registry.get("first").uri_prefixes == ("http://one.example/",)
    assert registry.display == {"label_predicates": ["http://example.org/name"]}


def test_default_override_and_fallback(tmp_path):
    path = tmp_path / "profiles.yaml"
    path.write_text(YAML)
    assert ProfileRegistry.from_yaml(path, default_override="first").default.name == "first"
    assert (
        ProfileRegistry.from_yaml(path, default_override="http://two.test/sparql").default.name
        == "second"
    )
    data = {
        "profiles": [{"name": "a", "endpoint": "http://a/"}, {"name": "b", "endpoint": "http://b/"}]
    }
    assert ProfileRegistry.from_data(data).default.name == "a"
    data["profiles"][1]["default"] = True
    assert ProfileRegistry.from_data(data).default.name == "b"


def test_default_override_by_endpoint(tmp_path):
    path = tmp_path / "profiles.yaml"
    path.write_text(YAML)
    registry = ProfileRegistry.from_yaml(path, default_override="http://one.test/sparql")
    assert registry.default.name == "first"
    # Endpoint addresses resolve like profile names and hash keys.
    assert registry.get("http://one.test/sparql").name == "first"
    assert registry.get(" http://one.test/sparql ").name == "first"


def test_unknown_default_is_an_error():
    with pytest.raises(ProfileError):
        ProfileRegistry.from_data(
            {"default": "nope", "profiles": [{"name": "a", "endpoint": "http://a/"}]}
        )


def test_unknown_default_endpoint_is_an_error():
    with pytest.raises(ProfileError):
        ProfileRegistry.from_data(
            {
                "default": "http://nope.test/sparql",
                "profiles": [{"name": "a", "endpoint": "http://a/"}],
            }
        )


def test_duplicate_addresses_are_rejected():
    with pytest.raises(ProfileError, match="same endpoint"):
        ProfileRegistry.from_data(
            [{"name": "a", "endpoint": "http://a/"}, {"name": "b", "endpoint": "http://a/"}]
        )


def test_missing_endpoint_is_rejected():
    with pytest.raises(ProfileError):
        ProfileRegistry.from_data([{"name": "a"}])


def test_mapping_form_and_missing_file(tmp_path):
    registry = ProfileRegistry.from_data({"profiles": {"x": {"endpoint": "http://x/"}}})
    assert registry.get("x").endpoint == "http://x/"
    assert len(ProfileRegistry.from_yaml(tmp_path / "nope.yaml")) == 0


def test_for_uri_prefers_longest_prefix(tmp_path):
    path = tmp_path / "profiles.yaml"
    path.write_text(YAML)
    registry = ProfileRegistry.from_yaml(path)
    assert registry.for_uri("http://one.example/thing").name == "first"
    assert registry.for_uri("http://two.example/deep/thing").name == "second"
    assert registry.for_uri("http://elsewhere/") is None


def test_public_list_hides_upstream_details(tmp_path):
    path = tmp_path / "profiles.yaml"
    path.write_text(YAML)
    public = ProfileRegistry.from_yaml(path).public_list()
    assert [p["name"] for p in public] == ["first", "second"]
    assert public[1]["default"] is True
    for entry in public:
        assert "endpoint" not in entry and "headers" not in entry
        assert entry["sparql"] == f"/sparql/{entry['key']}"
