"""Chunking the corpus.

Ten sentences about fruit needed no chunking, which is exactly why it
demonstrated nothing about handling real documents.
"""

from pathlib import Path

from app.knowledge import MAX_CHUNK_CHARS, load_chunks


def test_the_corpus_loads(tmp_path: Path) -> None:
    chunks = load_chunks()

    assert len(chunks) > 5
    assert all(chunk.text.strip() for chunk in chunks)


def test_each_chunk_names_its_document_and_section() -> None:
    """The citation shown with an answer is only useful if it points somewhere."""
    chunks = load_chunks()

    assert all('.md' in chunk.source for chunk in chunks)
    assert any('trace.md' in chunk.source for chunk in chunks)


def test_a_section_becomes_its_own_chunk(tmp_path: Path) -> None:
    """A chunk spanning two subjects retrieves well for neither."""
    (tmp_path / 'doc.md').write_text(
        '# Title\n\n## First\nAbout apples.\n\n## Second\nAbout oranges.\n'
    )

    chunks = load_chunks(tmp_path)

    assert len(chunks) == 2
    assert 'apples' in chunks[0].text and 'oranges' not in chunks[0].text
    assert chunks[0].source == 'doc.md — First'


def test_the_body_is_kept_separately_for_display(tmp_path: Path) -> None:
    """The citation already names the section, so repeating the heading under
    itself reads as a stutter -- and the source file's hard wrapping should not
    become line breaks in the middle of a rendered sentence."""
    (tmp_path / 'doc.md').write_text('# Design\n\n## Rate limiting\nCounters live\nin process.\n')

    chunk = load_chunks(tmp_path)[0]

    assert chunk.body == 'Counters live in process.'
    assert 'Rate limiting' not in chunk.body


def test_the_heading_travels_with_the_text(tmp_path: Path) -> None:
    """Retrieval matches words in the chunk, and a section is largely about what
    its own title says it is about."""
    (tmp_path / 'doc.md').write_text('# Design\n\n## Rate limiting\nCounters live in process.\n')

    chunk = load_chunks(tmp_path)[0]

    assert 'Rate limiting' in chunk.text
    assert 'Design' in chunk.text


def test_a_title_with_no_prose_is_not_a_chunk(tmp_path: Path) -> None:
    """Embedding "Design decisions" on its own would match every question and
    answer none."""
    (tmp_path / 'doc.md').write_text('# Design decisions\n\n## Real section\nSomething true.\n')

    chunks = load_chunks(tmp_path)

    assert len(chunks) == 1
    assert 'Real section' in chunks[0].source


def test_a_long_section_is_split_on_paragraphs(tmp_path: Path) -> None:
    """An embedding of a thousand words is an average of everything in them and
    matches nothing sharply."""
    paragraph = 'word ' * 60
    (tmp_path / 'doc.md').write_text(f'# T\n\n## Long\n{paragraph}\n\n{paragraph}\n\n{paragraph}\n')

    chunks = load_chunks(tmp_path)

    assert len(chunks) > 1
    assert all(len(chunk.text) <= MAX_CHUNK_CHARS + 200 for chunk in chunks)
    # Split, but all still attributed to the section it came from.
    assert {chunk.source for chunk in chunks} == {'doc.md — Long'}
