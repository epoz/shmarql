import click
import yaml
from shmarql.config import log


@click.option(
    "-f",
    "--filepath",
    type=click.Path(exists=True),
    help="Path to the mkdocs.yml file",
)
@click.command("mkdocs_nav")
def mkdocs_nav(filepath: str):
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


@click.group()
def cli():
    pass


cli.add_command(mkdocs_nav)

if __name__ == "__main__":
    cli()
