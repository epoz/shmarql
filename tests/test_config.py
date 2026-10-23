from pathlib import Path

from shmarql.config import Settings


def test_defaults(monkeypatch):
    for name in (
        "SITE_TITLE",
        "DOCS_PATH",
        "PROFILES_PATH",
        "CORS_ORIGINS",
        "ENDPOINT",
    ):
        monkeypatch.delenv(name, raising=False)
    settings = Settings(_env_file=None)
    assert settings.site_title == "SHMARQL"
    assert settings.docs_path == Path("docs")
    assert settings.profiles_path == Path("profiles.yaml")
    assert settings.cors_origins == []
    assert settings.lodeon_config_path is None
    assert settings.endpoint == ""


def test_environment_variables(monkeypatch):
    monkeypatch.setenv("SITE_TITLE", "My KG")
    monkeypatch.setenv("DOCS_PATH", "/srv/docs")
    monkeypatch.setenv("SPARQL_TIMEOUT", "5.5")
    monkeypatch.setenv("CORS_ORIGINS", "https://a.example, https://b.example")
    monkeypatch.setenv("SUPPORTED_LANGUAGES", '["de", "en"]')
    monkeypatch.setenv("LODEON_CONFIG_PATH", "")
    monkeypatch.setenv("ENDPOINT", "https://query.wikidata.org/sparql")
    settings = Settings(_env_file=None)
    assert settings.site_title == "My KG"
    assert settings.docs_path == Path("/srv/docs")
    assert settings.sparql_timeout == 5.5
    assert settings.cors_origins == ["https://a.example", "https://b.example"]
    assert settings.supported_languages == ["de", "en"]
    assert settings.lodeon_config_path is None
    assert settings.endpoint == "https://query.wikidata.org/sparql"


def test_dotenv_file(tmp_path, monkeypatch):
    monkeypatch.delenv("SITE_TITLE", raising=False)
    monkeypatch.delenv("ENDPOINT", raising=False)
    env = tmp_path / ".env"
    env.write_text("SITE_TITLE=From dotenv\nENDPOINT=http://override.test/sparql\nDEBUG=1\n")
    settings = Settings(_env_file=env)
    assert settings.site_title == "From dotenv"
    assert settings.endpoint == "http://override.test/sparql"
    assert settings.debug is True


def test_environment_beats_dotenv(tmp_path, monkeypatch):
    env = tmp_path / ".env"
    env.write_text("SITE_TITLE=From dotenv\n")
    monkeypatch.setenv("SITE_TITLE", "From environment")
    assert Settings(_env_file=env).site_title == "From environment"
