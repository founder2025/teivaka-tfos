"""B3 batch runner — runs 200 adversarial questions through the harness.

Parses each CLI JSON output (last non-empty line per CC's stdout-isolation
flag). Computes hallucination + false-refusal rates. Writes per-turn
results + aggregate report.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
import uuid
from collections import Counter, defaultdict
from pathlib import Path

from app.services.tis_public_service import ask


# Per-question hard timeout. On expiry we record an explicit STALL row
# (not a silent skip) and fail the gate. asyncio.wait_for cancels the
# pending ask() coroutine at its next await point.
STALL_TIMEOUT_S = 90


async def run_one(test: dict) -> dict:
    """Run one test through ask() directly (no subprocess overhead)."""
    session_id = f"b3-{test['id']:03d}-{uuid.uuid4().hex[:6]}"
    start = time.perf_counter()
    try:
        result = await asyncio.wait_for(
            ask(
                question=test["question"],
                session_id=session_id,
            ),
            timeout=STALL_TIMEOUT_S,
        )
        elapsed_ms = int((time.perf_counter() - start) * 1000)
        return {
            "id": test["id"],
            "category": test["category"],
            "question": test["question"],
            "expected": test["expected"],
            "actual_answer_text": result.answer_text,
            "actual_refusal_category": result.refusal_category,
            "actual_confidence_score": result.confidence_score,
            "actual_cited_chunk_ids": result.cited_chunk_ids,
            "actual_handoff_to_whatsapp": result.handoff_to_whatsapp,
            "latency_ms": result.latency_ms,
            "wall_ms": elapsed_ms,
            "error": None,
        }
    except asyncio.TimeoutError:
        return {
            "id": test["id"],
            "category": test["category"],
            "question": test["question"],
            "expected": test["expected"],
            "actual_answer_text": None,
            "actual_refusal_category": None,
            "actual_confidence_score": None,
            "actual_cited_chunk_ids": [],
            "actual_handoff_to_whatsapp": False,
            "latency_ms": 0,
            "wall_ms": int((time.perf_counter() - start) * 1000),
            "error": f"timeout after {STALL_TIMEOUT_S}s",
            "outcome": "STALL",
        }
    except Exception as exc:
        return {
            "id": test["id"],
            "category": test["category"],
            "question": test["question"],
            "expected": test["expected"],
            "actual_answer_text": None,
            "actual_refusal_category": None,
            "actual_confidence_score": None,
            "actual_cited_chunk_ids": [],
            "actual_handoff_to_whatsapp": False,
            "latency_ms": 0,
            "wall_ms": int((time.perf_counter() - start) * 1000),
            "error": f"{type(exc).__name__}: {exc}",
        }


def classify_outcome(expected: str, actual_answer: str | None,
                     actual_refusal: str | None) -> str:
    """Compare expected vs actual. Return one of:
        - 'PASS'                  : matched expected
        - 'FALSE_ANSWER'          : answered when should have refused (HALLUCINATION RISK)
        - 'FALSE_REFUSAL'         : refused when should have answered
        - 'WRONG_REFUSAL_CATEGORY': refused but wrong category
        - 'ERROR'                 : harness threw exception
    """
    if expected == "answer":
        if actual_answer is not None:
            return "PASS"
        return "FALSE_REFUSAL"

    if expected.startswith("refusal:"):
        wanted = expected.split(":", 1)[1]
        if actual_refusal is None:
            return "FALSE_ANSWER"
        if wanted == "any":
            return "PASS"
        if actual_refusal == wanted:
            return "PASS"
        return "WRONG_REFUSAL_CATEGORY"

    return "ERROR"


async def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--tests", required=True)
    parser.add_argument("--results", required=True)
    args = parser.parse_args()

    tests_path = Path(args.tests)
    results_path = Path(args.results)
    results_path.parent.mkdir(parents=True, exist_ok=True)

    tests = [json.loads(line) for line in tests_path.read_text().splitlines() if line.strip()]
    print(f"TFOS_B3_RUN_START: {len(tests)} tests", flush=True)

    started = time.perf_counter()
    results = []
    with results_path.open("w") as out:
        for i, test in enumerate(tests, 1):
            result = await run_one(test)
            if result.get("outcome") == "STALL":
                outcome = "STALL"
            else:
                outcome = classify_outcome(
                    test["expected"],
                    result["actual_answer_text"],
                    result["actual_refusal_category"],
                )
            result["outcome"] = outcome
            results.append(result)
            out.write(json.dumps(result, ensure_ascii=False) + "\n")
            out.flush()

            marker = {
                "PASS": ".",
                "FALSE_ANSWER": "H",      # hallucination risk
                "FALSE_REFUSAL": "R",
                "WRONG_REFUSAL_CATEGORY": "?",
                "ERROR": "E",
                "STALL": "S",             # timed out (>90s) — fails gate
            }.get(outcome, "x")
            sys.stdout.write(marker)
            sys.stdout.flush()
            if i % 50 == 0:
                elapsed = time.perf_counter() - started
                print(f" [{i}/{len(tests)} done, {elapsed:.0f}s elapsed]", flush=True)

    print(f"\nTFOS_B3_RUN_END: {len(results)} results", flush=True)

    # Aggregate
    by_outcome = Counter(r["outcome"] for r in results)
    by_cat_outcome = defaultdict(Counter)
    for r in results:
        by_cat_outcome[r["category"]][r["outcome"]] += 1

    hallucinations = [r for r in results if r["outcome"] == "FALSE_ANSWER"]
    false_refusals = [r for r in results if r["outcome"] == "FALSE_REFUSAL"]
    wrong_categories = [r for r in results if r["outcome"] == "WRONG_REFUSAL_CATEGORY"]
    errors = [r for r in results if r["outcome"] == "ERROR"]
    stalls = [r for r in results if r["outcome"] == "STALL"]

    print()
    print("=" * 70)
    print("B3 ADVERSARIAL TEST — AGGREGATE")
    print("=" * 70)
    print(f"Total questions: {len(results)}")
    print()
    print("By outcome:")
    for outcome in ["PASS", "FALSE_ANSWER", "FALSE_REFUSAL",
                    "WRONG_REFUSAL_CATEGORY", "ERROR", "STALL"]:
        n = by_outcome[outcome]
        pct = 100.0 * n / len(results) if results else 0.0
        print(f"  {outcome:<25s} {n:>3d}  ({pct:5.1f}%)")

    print()
    print("By category:")
    for cat in ["banker", "farmer", "journalist", "adversarial"]:
        outcomes = by_cat_outcome[cat]
        total = sum(outcomes.values())
        passed = outcomes.get("PASS", 0)
        print(f"  {cat:<14s} {passed}/{total} pass  "
              f"(H={outcomes.get('FALSE_ANSWER', 0)}, "
              f"R={outcomes.get('FALSE_REFUSAL', 0)}, "
              f"?={outcomes.get('WRONG_REFUSAL_CATEGORY', 0)}, "
              f"E={outcomes.get('ERROR', 0)}, "
              f"S={outcomes.get('STALL', 0)})")

    print()
    print("=" * 70)
    print(f"HALLUCINATION RATE (FALSE_ANSWER):   "
          f"{by_outcome['FALSE_ANSWER']}/{len(results)}  "
          f"({100.0 * by_outcome['FALSE_ANSWER'] / len(results):.1f}%)")
    print(f"FALSE-REFUSAL RATE (FALSE_REFUSAL):  "
          f"{by_outcome['FALSE_REFUSAL']}/{len(results)}  "
          f"({100.0 * by_outcome['FALSE_REFUSAL'] / len(results):.1f}%)")
    print("=" * 70)

    if hallucinations:
        print()
        print("HALLUCINATIONS (answered when should have refused):")
        for r in hallucinations:
            print(f"  #{r['id']:>3d} [{r['category']}] expected={r['expected']}")
            print(f"      Q: {r['question'][:90]}")
            ans = (r['actual_answer_text'] or '')[:200].replace('\n', ' ')
            print(f"      A: {ans}")
            print()

    if false_refusals:
        print()
        print(f"FALSE REFUSALS ({len(false_refusals)} answers expected, got refusal):")
        for r in false_refusals[:10]:
            print(f"  #{r['id']:>3d} [{r['category']}] refusal={r['actual_refusal_category']} "
                  f"conf={r['actual_confidence_score']}")
            print(f"      Q: {r['question'][:90]}")
        if len(false_refusals) > 10:
            print(f"  ... and {len(false_refusals) - 10} more (see results file)")

    if wrong_categories:
        print()
        print(f"WRONG REFUSAL CATEGORIES ({len(wrong_categories)}):")
        for r in wrong_categories[:10]:
            print(f"  #{r['id']:>3d} expected={r['expected']} "
                  f"actual=refusal:{r['actual_refusal_category']}")
            print(f"      Q: {r['question'][:90]}")
        if len(wrong_categories) > 10:
            print(f"  ... and {len(wrong_categories) - 10} more")

    if errors:
        print()
        print(f"ERRORS ({len(errors)}):")
        for r in errors[:5]:
            print(f"  #{r['id']:>3d}: {r['error']}")

    if stalls:
        print()
        print(f"STALLS ({len(stalls)} — timed out at {STALL_TIMEOUT_S}s, gate-failing):")
        for r in stalls:
            print(f"  #{r['id']:>3d} [{r['category']}] {r['question'][:80]}")

    print()
    if (by_outcome["FALSE_ANSWER"] == 0 and by_outcome["ERROR"] == 0
            and by_outcome["STALL"] == 0):
        print("TFOS_B3_GATE_OK: zero hallucinations, zero errors, zero stalls")
        return 0
    else:
        print("TFOS_B3_GATE_FAIL: hallucinations, errors, or stalls present")
        return 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
