"""Evaluations: does the thing behave, not does the wiring compile.

The test suite stubs the model everywhere, deliberately -- tests must be fast,
free and deterministic. That leaves a gap nothing else covers: whether the agent
actually refuses to invent a temperature, whether retrieval finds the passage
that answers the question, whether an out-of-scope question is declined.

These run against the real model, cost real money, and are not deterministic --
which is why they report a pass rate over several attempts rather than passing
or failing once.
"""
