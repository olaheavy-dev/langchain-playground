"""Turning token counts into money.

Prices are hardcoded and therefore go stale. They are listed per million tokens,
with the date they were checked, so a reader can tell at a glance whether to
trust the number -- which is better than a figure with no provenance that looks
authoritative forever.
"""

from dataclasses import dataclass

# USD per million tokens. Checked against OpenAI's published pricing, August 2026.
PRICES_CHECKED = '2026-08'


@dataclass(frozen=True)
class Price:
    input_per_million: float
    output_per_million: float
    # Input the provider served from its own cache, billed at a discount.
    cached_input_per_million: float


PRICES: dict[str, Price] = {
    'gpt-4.1-mini': Price(0.40, 1.60, 0.10),
    'gpt-4.1': Price(2.00, 8.00, 0.50),
    'gpt-4o-mini': Price(0.15, 0.60, 0.075),
    'gpt-4o': Price(2.50, 10.00, 1.25),
}


def price_for(model_name: str) -> Price | None:
    """Match on prefix, because responses name a dated snapshot such as
    gpt-4.1-mini-2025-04-14 while pricing is published per family."""
    for family, price in sorted(PRICES.items(), key=lambda item: -len(item[0])):
        if model_name.startswith(family):
            return price
    return None


def cost_usd(
    model_name: str,
    input_tokens: int,
    output_tokens: int,
    cached_input_tokens: int = 0,
) -> float | None:
    """What those tokens cost, or None for a model with no price on file.

    None rather than 0.0 on purpose: a missing price and a free call are not the
    same thing, and showing 0.0 for an unpriced model would understate a bill.
    """
    price = price_for(model_name)
    if price is None:
        return None

    # Cached input is billed at its own rate, so it must come out of the
    # full-price count rather than being charged twice.
    fresh_input = max(input_tokens - cached_input_tokens, 0)
    return (
        fresh_input * price.input_per_million
        + cached_input_tokens * price.cached_input_per_million
        + output_tokens * price.output_per_million
    ) / 1_000_000
