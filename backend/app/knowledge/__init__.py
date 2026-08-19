"""The knowledge base: this project's own documentation.

Ten sentences about fruit demonstrated retrieval cleanly, but showed no judgment
about real documents -- no chunking, no structure, no citations worth reading.
This corpus is the project explaining itself, which also makes the demo
self-describing: ask it how streaming works and it answers from the file that
says so.
"""

import re
from dataclasses import dataclass
from pathlib import Path

DOCS_DIR = Path(__file__).parent

# Chunks are split on headings first, because a heading marks a change of
# subject and a chunk that spans two subjects retrieves well for neither. Long
# sections are then split again on paragraphs, since an embedding of a thousand
# words is an average of everything in them and matches nothing sharply.
MAX_CHUNK_CHARS = 700


@dataclass(frozen=True)
class Chunk:
    # What gets embedded: the heading travels with the prose, because a section
    # is largely about what its own title says it is about.
    text: str
    # Where it came from, shown with the answer so a claim can be traced back to
    # the document that made it.
    source: str
    # The prose without the heading, and without the source file's hard wrapping,
    # for showing to a reader who can already see the citation above it.
    body: str


def _split_long(body: str) -> list[str]:
    """Break an oversized section on paragraph boundaries rather than mid-idea."""
    paragraphs = [part.strip() for part in body.split('\n\n') if part.strip()]
    chunks: list[str] = []
    current = ''
    for paragraph in paragraphs:
        candidate = f'{current}\n\n{paragraph}'.strip()
        if current and len(candidate) > MAX_CHUNK_CHARS:
            chunks.append(current)
            current = paragraph
        else:
            current = candidate
    if current:
        chunks.append(current)
    return chunks


def load_chunks(directory: Path | None = None) -> list[Chunk]:
    """Read the corpus, one chunk per section."""
    directory = directory or DOCS_DIR
    chunks: list[Chunk] = []

    for path in sorted(directory.glob('*.md')):
        title = ''
        for block in re.split(r'\n(?=#)', path.read_text()):
            block = block.strip()
            if not block:
                continue

            heading_match = re.match(r'^(#+)\s+(.*)', block)
            heading = heading_match.group(2).strip() if heading_match else ''
            body = block[heading_match.end() :].strip() if heading_match else block

            # A document title with no prose of its own is a label for what
            # follows, not a chunk: embedding "Design decisions" on its own
            # would match every question and answer none.
            if heading_match and len(heading_match.group(1)) == 1:
                title = heading
                if not body:
                    continue

            label = f'{path.stem}.md — {heading}' if heading else f'{path.stem}.md'
            # The heading travels with the text: retrieval matches on the words
            # in the chunk, and a section reads as being about its own title.
            for part in _split_long(body):
                chunks.append(
                    Chunk(
                        text=f'{title}: {heading}\n{part}'.strip(),
                        source=label,
                        body=' '.join(part.split()),
                    )
                )

    return chunks
