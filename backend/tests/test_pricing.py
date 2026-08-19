import pytest

from app.pricing import PRICES, cost_usd, price_for


def test_a_dated_snapshot_is_priced_as_its_family() -> None:
    """Responses name the snapshot they ran on, pricing is published per family,
    and nothing reconciles the two but this."""
    assert price_for('gpt-4.1-mini-2025-04-14') == PRICES['gpt-4.1-mini']


def test_the_longer_family_wins() -> None:
    """gpt-4.1-mini also starts with gpt-4.1, and charging mini traffic at the
    full model's rate would overstate the bill fourfold."""
    assert price_for('gpt-4.1-mini-2025-04-14') != PRICES['gpt-4.1']
    assert price_for('gpt-4.1-2025-04-14') == PRICES['gpt-4.1']


def test_cost_is_split_by_direction() -> None:
    # 1M input at $0.40 and 1M output at $1.60.
    assert cost_usd('gpt-4.1-mini', 1_000_000, 1_000_000) == pytest.approx(2.00)


def test_cached_input_is_billed_once_at_its_own_rate() -> None:
    """Cached tokens are part of the input count, so charging them at both rates
    would bill the same tokens twice."""
    everything_cached = cost_usd('gpt-4.1-mini', 1_000_000, 0, cached_input_tokens=1_000_000)

    assert everything_cached == pytest.approx(0.10)


def test_an_unpriced_model_reports_nothing_rather_than_free() -> None:
    """0.0 would read as "this call was free", which is a worse lie than "I do
    not know what this cost"."""
    assert cost_usd('some-model-we-have-no-price-for', 1000, 1000) is None
