import click
import yaml
from shmarql.config import log
from mkdocs.__main__ import cli as mkdocs_cli


@click.option(
    "-f",
    "--filepath",
    type=click.Path(exists=True),
    help="Path to the mkdocs.yml file",
)
@click.command("docs_build")
def docs_build(filepath: str):
    nav = yaml.safe_load(open(filepath).read())
    SRC_MKDOCS = "./src/mkdocs.yml"
    log.debug(f"Assuming the site mkdocs.yml file is in:   {SRC_MKDOCS}")
    try:
        site_mkdocs = yaml.load(open(SRC_MKDOCS).read(), yaml.UnsafeLoader)
    except FileNotFoundError:
        log.error(f"No {SRC_MKDOCS} file found, exiting.")
        return
    changed = False
    for key in ("site_name", "site_url", "nav"):
        if key in nav:
            site_mkdocs[key] = nav[key]
            changed = True

    open(SRC_MKDOCS, "w").write(yaml.dump(site_mkdocs))
    click.echo(f"Wrote new {SRC_MKDOCS} file")

    try:
        mkdocs_cli(["build", "--site-dir", "site"], standalone_mode=False)
    except Exception as e:
        log.error(str(e))


@click.group()
def cli():
    pass


cli.add_command(docs_build)

if __name__ == "__main__":
    cli()
