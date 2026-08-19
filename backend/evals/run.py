"""Run the evals and print a scorecard.

    uv run python -m evals.run              # every case, three attempts each
    uv run python -m evals.run --repeats 5
    uv run python -m evals.run --tag honesty

Model output varies between identical calls, so a single attempt tells you very
little: one pass could be luck and one failure could be noise. Each case runs
several times and reports how often it held.
"""

import argparse
import asyncio
import json
import time
from dataclasses import dataclass, field
from pathlib import Path

from evals.cases import CASES, Case


@dataclass
class Result:
    case: Case
    passes: int = 0
    attempts: int = 0
    details: list[str] = field(default_factory=list)
    cost_usd: float = 0.0
    priced: bool = True

    @property
    def rate(self) -> float:
        return self.passes / self.attempts if self.attempts else 0.0


async def run_case(case: Case, repeats: int, index: int) -> Result:
    result = Result(case=case)
    for attempt in range(repeats):
        # A fresh thread every attempt: a shared one would let the agent answer
        # the second attempt from the first one's context, which measures memory
        # rather than the behaviour under test.
        thread_id = f'eval-{index}-{attempt}-{time.time_ns()}'
        try:
            reply = await case.run(thread_id)
            ok, detail = case.check(reply)
        except Exception as error:  # noqa: BLE001 -- a crash is a failed case
            ok, detail = False, f'{type(error).__name__}: {error}'
            reply = None

        result.attempts += 1
        result.passes += int(ok)
        result.details.append(('pass: ' if ok else 'FAIL: ') + detail)

        trace = getattr(reply, 'trace', None)
        if trace is not None:
            if trace.cost_usd is None:
                result.priced = False
            else:
                result.cost_usd += trace.cost_usd
    return result


def _money(usd: float) -> str:
    """A whole suite can cost less than a cent, and "$0.00" makes it look free."""
    if usd >= 0.01:
        return f'about ${usd:.2f}'
    return f'about ${usd:.4f}'


def render(results: list[Result], repeats: int, elapsed: float) -> str:
    width = max(len(result.case.name) for result in results)
    lines = [
        '',
        f'{"case".ljust(width)}  rate    attempts',
        f'{"-" * width}  ------  --------',
    ]
    for result in results:
        mark = '✓' if result.rate == 1 else ('~' if result.rate > 0 else '✗')
        lines.append(
            f'{result.case.name.ljust(width)}  {mark} {result.rate:>4.0%}  '
            f'{result.passes}/{result.attempts}'
        )
        for detail in result.details:
            if detail.startswith('FAIL'):
                lines.append(f'{" " * width}    {detail}')

    passed = sum(result.passes for result in results)
    attempted = sum(result.attempts for result in results)
    cost = sum(result.cost_usd for result in results)
    priced = all(result.priced for result in results)

    lines += [
        f'{"-" * width}  ------  --------',
        f'{"total".ljust(width)}  {passed / attempted:>6.0%}  {passed}/{attempted}',
        '',
        f'{len(results)} cases x {repeats} attempts in {elapsed:.0f}s, '
        + (_money(cost) if priced else 'cost partly unknown'),
        '',
    ]
    return '\n'.join(lines)


async def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repeats', type=int, default=3)
    parser.add_argument('--tag', help='only cases carrying this tag')
    parser.add_argument(
        '--out', type=Path, default=Path('evals/latest.json'), help='where to write results'
    )
    args = parser.parse_args()

    cases = [case for case in CASES if not args.tag or args.tag in case.tags]
    if not cases:
        print(f'No cases tagged {args.tag!r}.')
        return 1

    print(f'Running {len(cases)} cases, {args.repeats} attempts each. This calls the real model.')
    started = time.perf_counter()
    # Cases are independent and mostly waiting on the network, so they run
    # together; attempts within a case stay sequential to keep the output
    # readable when one fails.
    results = await asyncio.gather(
        *(run_case(case, args.repeats, index) for index, case in enumerate(cases))
    )
    elapsed = time.perf_counter() - started

    report = render(list(results), args.repeats, elapsed)
    print(report)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(
        json.dumps(
            {
                'repeats': args.repeats,
                'elapsed_seconds': round(elapsed, 1),
                'cases': [
                    {
                        'name': result.case.name,
                        'why': result.case.why,
                        'tags': result.case.tags,
                        'passes': result.passes,
                        'attempts': result.attempts,
                        'details': result.details,
                    }
                    for result in results
                ],
            },
            indent=2,
        )
        + '\n'
    )
    print(f'Written to {args.out}')

    # Non-zero when anything failed, so this can gate a release if you want it to.
    return 0 if all(result.rate == 1 for result in results) else 1


if __name__ == '__main__':
    raise SystemExit(asyncio.run(main()))
