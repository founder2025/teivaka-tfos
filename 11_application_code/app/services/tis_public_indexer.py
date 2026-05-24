"""
TIS-Public corpus indexer.

Reads markdown files from site_corpus/sources/, splits them by heading,
embeds each chunk via OpenAI text-embedding-3-small, and upserts into
shared.tis_public_corpus.

MUST run as an ops job using the teivaka superuser DATABASE_URL per
MBI Inviolable #7 (shared.* is read-only at runtime). Invocation:

    docker exec -e DATABASE_URL="postgresql+asyncpg://teivaka:<PWD>@db:5432/teivaka_db" \\
        teivaka_api python -m app.services.tis_public_indexer

Optional flags:
    --dry-run             Read + chunk only; do NOT embed or write to DB
    --corpus-version vX   Override default corpus version (default: 'v1')
    --corpus-dir PATH     Override corpus source path
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import logging
import re
import sys
from dataclasses import dataclass
from pathlib import Path

import openai
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.config import settings


logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

DEFAULT_CORPUS_DIR = Path("/opt/teivaka/frontend/site_corpus/sources")
DEFAULT_CORPUS_VERSION = "v1"
EMBEDDING_MODEL = "text-embedding-3-small"  # 1536-dim, matches vector(1536) column
HEADING_SPLIT_RE = re.compile(r"^(#{1,3})\s+(.+)$", re.MULTILINE)

# Files that exist in site_corpus/sources/ but should NOT be embedded.
# refusal_scripts.md is a classifier/instruction reference loaded into the
# system prompt at runtime — embedding it would muddy retrieval since one
# vector would average 16 unrelated refusal categories.
EXCLUDE_FROM_INDEXING = {"refusal_scripts.md"}


@dataclass
class Chunk:
    chunk_id: str
    source_file: str
    section: str
    content: str
    token_count_estimate: int


def slugify(s: str) -> str:
    """Convert heading text to a URL-safe slug."""
    slug = s.lower().strip()
    slug = re.sub(r"[^\w\s-]", "", slug)
    slug = re.sub(r"[\s_]+", "-", slug)
    slug = slug.strip("-")
    return slug[:48]  # cap so chunk_id stays under 64 chars


def chunk_markdown(source_path: Path) -> list[Chunk]:
    """Split a markdown file into chunks by H1/H2/H3 headings.

    A chunk = a heading line + all content up to the next heading.
    """
    file_text = source_path.read_text(encoding="utf-8")
    file_stem = source_path.stem

    matches = list(HEADING_SPLIT_RE.finditer(file_text))
    if not matches:
        return [
            Chunk(
                chunk_id=f"{file_stem}__root",
                source_file=source_path.name,
                section=file_stem.replace("_", " ").title(),
                content=file_text.strip(),
                token_count_estimate=len(file_text) // 4,
            )
        ]

    chunks: list[Chunk] = []
    for i, match in enumerate(matches):
        section_title = match.group(2).strip()
        section_slug = slugify(section_title)

        start = match.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(file_text)
        content = file_text[start:end].strip()

        chunk_id = f"{file_stem}__{section_slug}"
        if len(chunk_id) > 64:
            chunk_id = f"{file_stem}__{hashlib.sha256(section_slug.encode()).hexdigest()[:16]}"

        chunks.append(
            Chunk(
                chunk_id=chunk_id,
                source_file=source_path.name,
                section=section_title,
                content=content,
                token_count_estimate=len(content) // 4,
            )
        )
    return chunks


async def embed_chunks(chunks: list[Chunk]) -> list[list[float]]:
    """Embed all chunks via OpenAI in a single batch call."""
    client = openai.AsyncOpenAI(api_key=settings.openai_api_key)
    inputs = [c.content for c in chunks]

    logger.info("Embedding %d chunks via %s", len(chunks), EMBEDDING_MODEL)
    response = await client.embeddings.create(
        model=EMBEDDING_MODEL,
        input=inputs,
    )
    return [d.embedding for d in response.data]


async def replace_corpus_version(
    chunks: list[Chunk],
    embeddings: list[list[float]],
    corpus_version: str,
) -> int:
    """Replace all chunks for a given corpus_version atomically.

    Strategy: DELETE all rows matching corpus_version, then INSERT the new
    set, all inside one transaction. Prevents orphan rows when chunk_ids
    change between indexing runs (e.g., heading renames or section removals).

    If the run fails partway, the transaction rolls back and the previous
    indexing of this corpus_version remains intact.
    """
    engine = create_async_engine(settings.database_url)
    inserted = 0

    async with engine.begin() as conn:
        # 1. Delete all existing rows for this corpus_version
        result = await conn.execute(
            text("DELETE FROM shared.tis_public_corpus WHERE corpus_version = :v"),
            {"v": corpus_version},
        )
        logger.info("Deleted %d existing rows for corpus_version=%s",
                    result.rowcount or 0, corpus_version)

        # 2. Insert all new chunks
        for chunk, embedding in zip(chunks, embeddings):
            await conn.execute(
                text("""
                    INSERT INTO shared.tis_public_corpus
                        (chunk_id, source_file, section, content, embedding,
                         corpus_version, token_count, created_at, updated_at)
                    VALUES
                        (:chunk_id, :source_file, :section, :content,
                         CAST(:embedding AS vector),
                         :corpus_version, :token_count, NOW(), NOW());
                """),
                {
                    "chunk_id": chunk.chunk_id,
                    "source_file": chunk.source_file,
                    "section": chunk.section,
                    "content": chunk.content,
                    "embedding": str(embedding),
                    "corpus_version": corpus_version,
                    "token_count": chunk.token_count_estimate,
                },
            )
            inserted += 1

    await engine.dispose()
    return inserted


async def main_async(corpus_dir: Path, corpus_version: str, dry_run: bool) -> int:
    if not corpus_dir.is_dir():
        logger.error("Corpus dir not found: %s", corpus_dir)
        return 2

    md_files = sorted(corpus_dir.glob("*.md"))
    md_files = [f for f in md_files if not f.name.endswith(".bak") and ".bak-" not in f.name]
    md_files = [f for f in md_files if f.name not in EXCLUDE_FROM_INDEXING]

    if not md_files:
        logger.error("No .md files found in %s", corpus_dir)
        return 2

    logger.info("Found %d corpus file(s) in %s", len(md_files), corpus_dir)

    all_chunks: list[Chunk] = []
    for md_file in md_files:
        chunks = chunk_markdown(md_file)
        logger.info("  %s -> %d chunk(s)", md_file.name, len(chunks))
        all_chunks.extend(chunks)

    logger.info("Total chunks: %d", len(all_chunks))

    if dry_run:
        logger.info("DRY-RUN: skipping embed + DB write.")
        logger.info("Chunk listing:")
        for c in all_chunks:
            logger.info("  [%s] %s :: %s (%d est tokens, %d chars)",
                        c.chunk_id, c.source_file, c.section,
                        c.token_count_estimate, len(c.content))
        return 0

    embeddings = await embed_chunks(all_chunks)
    if len(embeddings) != len(all_chunks):
        logger.error("Embedding count mismatch: got %d for %d chunks",
                     len(embeddings), len(all_chunks))
        return 3

    inserted = await replace_corpus_version(all_chunks, embeddings, corpus_version)
    logger.info("Inserted %d rows into shared.tis_public_corpus (version=%s)",
                inserted, corpus_version)
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="TIS-Public corpus indexer.")
    parser.add_argument("--corpus-dir", type=Path, default=DEFAULT_CORPUS_DIR,
                        help=f"Corpus source directory (default: {DEFAULT_CORPUS_DIR})")
    parser.add_argument("--corpus-version", default=DEFAULT_CORPUS_VERSION,
                        help=f"Corpus version tag (default: {DEFAULT_CORPUS_VERSION})")
    parser.add_argument("--dry-run", action="store_true",
                        help="Chunk and report, but do NOT embed or write to DB.")
    args = parser.parse_args()

    return asyncio.run(main_async(args.corpus_dir, args.corpus_version, args.dry_run))


if __name__ == "__main__":
    sys.exit(main())
