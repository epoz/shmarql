"""The Welcome Story: the project the editor opens when the browser has none yet.

LODEON ships it as a ``.lodeon.zip``; here it is generated so that its SPARQL node
points at the default profile of this site. It is an ordinary editable project.
"""

from __future__ import annotations

import io
import json
import zipfile
from typing import Any

from ..profiles import Profile

PROJECT_ID = "shmarql-welcome-story"
TIMESTAMP = "2026-10-12T00:00:00.000Z"
EXAMPLE_QUERY = (
    "SELECT ?subject ?predicate ?object WHERE {\n  ?subject ?predicate ?object .\n}\nLIMIT 10"
)


def _text(text: str, bold: bool = False) -> dict[str, Any]:
    node: dict[str, Any] = {"type": "text", "text": text}
    if bold:
        node["marks"] = [{"type": "bold"}]
    return node


def _heading(level: int, text: str) -> dict[str, Any]:
    return {
        "type": "heading",
        "attrs": {"semanticFormat": None, "level": level},
        "content": [_text(text)],
    }


def _paragraph(*parts: dict[str, Any]) -> dict[str, Any]:
    return {"type": "paragraph", "attrs": {"semanticFormat": None}, "content": list(parts)}


def _bullets(*items: tuple[str, str]) -> dict[str, Any]:
    return {
        "type": "bulletList",
        "content": [
            {"type": "listItem", "content": [_paragraph(_text(lead, bold=True), _text(rest))]}
            for lead, rest in items
        ],
    }


def welcome_document(profile: Profile | None, site_title: str) -> dict[str, Any]:
    content: list[dict[str, Any]] = [
        _heading(1, "Welcome to the story editor"),
        _paragraph(
            _text(
                f"Write data stories for {site_title} in a visual editor: combine text with "
                "live SPARQL queries, charts, maps, images, IIIF objects, embeds and more. "
                "The editor is LODEON's authoring environment. Your projects are stored "
                "locally in your browser, and you can export them as portable .lodeon.zip "
                "packages at any time."
            )
        ),
        _heading(2, "Start exploring"),
        _paragraph(
            _text(
                "This page is already a project. Edit the text, run the example node, add "
                "your own content, or remove anything you do not need."
            )
        ),
        _bullets(
            (
                "Insert Special Nodes",
                " — pick a query, visualization, map or media node from "
                "the toolbar to add it to the story.",
            ),
            (
                "Describe your story",
                " — fill in title, slug, contributors and license in the "
                "metadata panel on the left.",
            ),
            (
                "Preview and Publish",
                " — Preview shows the story as it will appear on this site; "
                "Publish adds it to the pages of this site.",
            ),
        ),
    ]
    if profile is not None:
        content += [
            _heading(3, "Try your first SPARQL node"),
            _paragraph(
                _text("Select "),
                _text("Run", bold=True),
                _text(
                    f" in the node below to query {profile.label}. Change the query and run "
                    "it again to explore the data."
                ),
            ),
            {
                "type": "sparnaturalNode",
                "attrs": {
                    "id": "welcome-sparql-node",
                    "kind": "sparnatural",
                    "title": f"A first look at {profile.label}",
                    "source": EXAMPLE_QUERY,
                    "queryJson": None,
                    "configId": profile.name if profile.sparnatural else "",
                    "knowledgeGraphProfileId": profile.name,
                    "result": None,
                    "resultPageSize": 10,
                    "viewConfig": {},
                    "collapsed": False,
                    "excludeFromRender": False,
                },
            },
        ]
    content.append(
        _paragraph(
            _text("Ready for an empty workspace? Select "),
            _text("New", bold=True),
            _text(". Already have a LODEON project? Select "),
            _text("Import", bold=True),
            _text("."),
        )
    )
    return {"type": "doc", "content": content}


def welcome_project(profile: Profile | None, site_title: str) -> dict[str, Any]:
    description = f"An introduction to writing data stories for {site_title}."
    return {
        "id": PROJECT_ID,
        "format": "lodeon-datastory",
        "version": 1,
        "title": "Welcome Story",
        "slug": "welcome-story",
        "metadata": {
            "description": description,
            "keywords": ["data story", "introduction"],
            "language": "en",
            "license": "",
            "contributors": [],
            "persistentIdentifiers": [],
        },
        "publishStoryZip": False,
        "publicationHistory": [],
        "createdAt": TIMESTAMP,
        "updatedAt": TIMESTAMP,
        "canonical": "prosemirror",
        "assets": [],
        "document": welcome_document(profile, site_title),
    }


def welcome_story_zip(profile: Profile | None, site_title: str) -> bytes:
    package = {
        "format": "lodeon-project-package",
        "version": 1,
        "exportedAt": TIMESTAMP,
        "generator": {"name": "LODEON"},
        "project": welcome_project(profile, site_title),
    }
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("project.lodeon.json", json.dumps(package, indent=2) + "\n")
    return buffer.getvalue()
