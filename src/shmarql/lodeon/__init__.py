"""Support for LODEON data stories (https://gitlab.rlp.net/adwmainz/digicademy/lodeon/lodeon-core).

LODEON's editor exports a story as Markdown with YAML front matter and fenced
"Special Nodes" (```` ```shmarql ````, ```` ```lodeon-visualization ````, ...). The
LODEON renderer projects some fences (embed, graph explorer, leaflet, verovio) to
HTML server-side and hands the rest to the browser runtime (``runtime.js``). This
package reproduces that pipeline: :class:`StoryRenderer` applies the vendored
LODEON node projections, and the Markdown renderer emits the same
``<pre class="lodeon-*-source">`` shells that ``runtime.js`` hydrates.
"""

from .dispatcher import StoryRenderer, extract_front_matter, is_datastory

__all__ = ["StoryRenderer", "extract_front_matter", "is_datastory"]
