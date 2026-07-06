import zipfile
from pathlib import Path

BASE_DIR = Path(__file__).parent
DOCS_DIR = BASE_DIR / "docs"
MKDOCS_YML = BASE_DIR / "mkdocs.yml"
COMPOSE = BASE_DIR / "docker-compose-sample1.yml"
OUTPUT_ZIP = BASE_DIR / "sample_site.zip"

IGNORE_FILES = {".DS_Store", "Thumbs.db"}


def main() -> None:
    with zipfile.ZipFile(OUTPUT_ZIP, "w", zipfile.ZIP_DEFLATED) as zf:
        for path in DOCS_DIR.rglob("*"):
            if path.is_file() and path.name not in IGNORE_FILES:
                zf.write(path, path.relative_to(BASE_DIR))
        zf.write(MKDOCS_YML, "mkdocs.yml")
        zf.write(COMPOSE, "docker-compose.yml")

    print(f"Wrote {OUTPUT_ZIP}")


if __name__ == "__main__":
    main()
