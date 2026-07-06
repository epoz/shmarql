import os, click, zipfile
from shmarql.config import log
from mkdocs.__main__ import cli as mkdocs_cli
from .am import reset_admin_password


@click.option(
    "-f",
    "--filepath",
    type=click.Path(exists=True),
    help="Path to the admin database file",
    required=True,
)
@click.command("reset_admin")
def reset_admin(filepath: str):
    reset_admin_password(filepath)


@click.option(
    "-f",
    "--filepath",
    type=click.Path(exists=True),
    help="Path to the mkdocs.yml file",
)
@click.command("docs_build")
def docs_build(filepath: str):
    try:
        mkdocs_cli(["build", "--site-dir", "site"], standalone_mode=False)
    except Exception as e:
        log.error(str(e))


@click.option(
    "-d",
    "--dirname",
    type=click.Path(exists=False),
    help="Path to create for the new Shmarql site",
)
@click.command("init")
def init_site(dirname: str = "shmarql_site"):
    """
    Initializes a new Shmarql site with the specified directory name.
    """
    try:
        package_dir = os.path.dirname(__file__)
        zip_path = os.path.join(package_dir, "sample_site.zip")
        with zipfile.ZipFile(zip_path) as zf:
            zf.extractall(dirname)
    except Exception as e:
        log.error(str(e))


@click.group()
def cli():
    pass


cli.add_command(docs_build)
cli.add_command(reset_admin)
cli.add_command(init_site)

if __name__ == "__main__":
    cli()
