"""
TIS-Public CLI — ad-hoc question runner.

Wraps tis_public_service.ask() with argparse for command-line use.
Primary consumer: B3 adversarial test (batch-runs ~200 questions).
Also useful for ad-hoc verification of corpus + harness changes.

Run inside the teivaka_api container:

    python -m app.services.tis_public_cli "What is Teivaka?"

Output: pretty-printed answer + metadata to stdout.
JSON output mode: --json (machine-readable for batch test runners).
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import uuid

from app.services.tis_public_service import ask


def _format_pretty(result, question: str) -> str:
    lines = []
    lines.append("=" * 70)
    lines.append(f"Q: {question}")
    lines.append("=" * 70)
    lines.append(f"session_id:           {result.session_id}")
    lines.append(f"latency_ms:           {result.latency_ms}")
    lines.append(f"confidence_score:     {result.confidence_score}")
    lines.append(f"cited_chunk_ids:      {result.cited_chunk_ids}")
    lines.append(f"refusal_category:     {result.refusal_category}")
    lines.append(f"handoff_to_whatsapp:  {result.handoff_to_whatsapp}")
    lines.append("-" * 70)
    if result.answer_text:
        lines.append(result.answer_text)
    else:
        lines.append(f"(refusal: {result.refusal_category})")
    lines.append("=" * 70)
    return "\n".join(lines)


def _format_json(result, question: str) -> str:
    return json.dumps({
        "question": question,
        "session_id": result.session_id,
        "latency_ms": result.latency_ms,
        "confidence_score": result.confidence_score,
        "cited_chunk_ids": result.cited_chunk_ids,
        "refusal_category": result.refusal_category,
        "handoff_to_whatsapp": result.handoff_to_whatsapp,
        "answer_text": result.answer_text,
    }, ensure_ascii=False)


async def main_async(question: str, session_id: str, as_json: bool) -> int:
    result = await ask(question=question, session_id=session_id)
    if as_json:
        print(_format_json(result, question))
    else:
        print(_format_pretty(result, question))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description="TIS-Public CLI — ask the public RAG harness one question.",
    )
    parser.add_argument(
        "question",
        help="The visitor question to ask (will be trimmed + length-capped to 500 chars).",
    )
    parser.add_argument(
        "--session-id",
        default=None,
        help="Optional session id; default is a random uuid prefixed with 'cli-'.",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Emit JSON output (for batch test runners).",
    )
    args = parser.parse_args()

    session_id = args.session_id or f"cli-{uuid.uuid4().hex[:12]}"
    return asyncio.run(main_async(args.question, session_id, args.json))


if __name__ == "__main__":
    sys.exit(main())
