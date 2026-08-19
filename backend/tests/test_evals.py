"""The eval harness, tested with fake cases.

The evals themselves call a real model, so they cannot run here. What can be
checked for free is the machinery: that a failing case is reported as failing,
that a crash counts as a failure rather than stopping the run, and that the
scorecard adds up. A harness that has never been seen to fail is not evidence of
anything.
"""

import asyncio

import pytest

from evals.cases import Case
from evals.run import Result, render, run_case


def always(ok: bool, detail: str = 'because'):
    return lambda reply: (ok, detail)


def case(name: str, ok: bool, run=None) -> Case:
    async def default_run(thread_id: str):
        return None

    return Case(name=name, why='because', run=run or default_run, check=always(ok))


async def test_a_passing_case_scores_full_marks() -> None:
    result = await run_case(case('good', True), repeats=3, index=0)

    assert result.passes == 3
    assert result.rate == 1.0


async def test_a_failing_case_is_reported_not_swallowed() -> None:
    result = await run_case(case('bad', False), repeats=3, index=0)

    assert result.passes == 0
    assert all(detail.startswith('FAIL') for detail in result.details)


async def test_a_crash_counts_as_a_failure_and_the_run_continues() -> None:
    """One agent erroring should cost you that case, not the whole scorecard."""

    async def explode(thread_id: str):
        raise RuntimeError('model unavailable')

    result = await run_case(case('boom', True, run=explode), repeats=2, index=0)

    assert result.passes == 0
    assert 'RuntimeError: model unavailable' in result.details[0]


async def test_each_attempt_gets_its_own_thread() -> None:
    """Sharing one would let the second attempt answer from the first attempt's
    context, which measures memory rather than the behaviour under test."""
    seen: list[str] = []

    async def remember(thread_id: str):
        seen.append(thread_id)
        return None

    await run_case(case('threads', True, run=remember), repeats=3, index=0)

    assert len(set(seen)) == 3


async def test_the_scorecard_reports_a_partial_rate() -> None:
    """Model output varies, so 'passed twice out of three' is the honest summary
    and a single pass or fail would not be."""
    mixed = Result(case=case('flaky', True))
    mixed.attempts, mixed.passes = 3, 2
    mixed.details = ['pass: ok', 'pass: ok', 'FAIL: wrong city']

    report = render([mixed], repeats=3, elapsed=1.0)

    assert '2/3' in report
    assert '67%' in report
    # Failures are quoted under the row; passes are not, so the eye goes to what
    # went wrong.
    assert 'FAIL: wrong city' in report


async def test_sub_cent_totals_are_not_rounded_to_free() -> None:
    passing = Result(case=case('cheap', True))
    passing.attempts, passing.passes, passing.cost_usd = 1, 1, 0.0042

    assert '$0.0042' in render([passing], repeats=1, elapsed=1.0)


async def test_an_unpriced_run_says_so() -> None:
    unpriced = Result(case=case('mystery', True))
    unpriced.attempts, unpriced.passes, unpriced.priced = 1, 1, False

    assert 'cost partly unknown' in render([unpriced], repeats=1, elapsed=1.0)
