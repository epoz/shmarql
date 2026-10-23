"""SHMARQL command line.

uv run shmarql                 # serve (same as `shmarql serve`)
uv run shmarql serve --reload  # serve with auto-reload for development
uv run shmarql profiles        # list configured profiles and their hash keys
"""

from __future__ import annotations

import argparse
import sys

import uvicorn

from .config import get_settings
from .profiles import ProfileError, ProfileRegistry


def _serve(args: argparse.Namespace) -> None:
    settings = get_settings()
    uvicorn.run(
        "shmarql.main:app_factory",
        factory=True,
        host=args.host or settings.host,
        port=args.port or settings.port,
        reload=args.reload,
        log_level="debug" if settings.debug else "info",
    )


def _profiles(_args: argparse.Namespace) -> None:
    settings = get_settings()
    try:
        registry = ProfileRegistry.from_yaml(settings.profiles_path, settings.endpoint)
    except ProfileError as exc:
        sys.exit(f"Invalid profiles configuration: {exc}")
    if not len(registry):
        print(f"No profiles configured in {settings.profiles_path}")
        return
    for profile in registry:
        marker = "*" if profile is registry.default else " "
        print(f"{marker} {profile.key}  {profile.name:<20} {profile.endpoint}")
    print("\n* = served at /sparql; every profile is also served at /sparql/<key>")


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="shmarql", description="SHMARQL Linked Data server")
    sub = parser.add_subparsers(dest="command")
    serve = sub.add_parser("serve", help="run the web server (default)")
    for p in (parser, serve):
        p.add_argument("--host", default=None, help="bind address (default: HOST setting)")
        p.add_argument("--port", type=int, default=None, help="port (default: PORT setting)")
        p.add_argument("--reload", action="store_true", help="auto-reload on code changes")
    sub.add_parser("profiles", help="list the configured SPARQL profiles and their keys")
    args = parser.parse_args(argv)
    if args.command == "profiles":
        _profiles(args)
    else:
        _serve(args)


if __name__ == "__main__":
    main()
