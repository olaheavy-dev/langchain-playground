# The arrival trace

## What it measures
Every answer carries a trace of how it was produced. TracingMiddleware wraps each model call
and each tool call, so every segment is measured where it happens rather than inferred by
subtraction. The trace also reports model calls, input and output tokens, and an estimated
cost.

## Why total time is not the sum of the segments
The agent runs tool calls concurrently when the model asks for several at once, so segments
can overlap in real time. Laying them end to end would invent an order and overstate the
work, which is why each segment carries a start offset and the interface draws a timeline
rather than a stacked bar.

## Orchestration time
Whatever the measured steps do not account for is the agent's own orchestration. It is not
drawn as a segment, because it happens in the gaps between steps rather than in one block;
reporting the wall-clock total instead lets those gaps speak for themselves.

## Cost reporting
An unpriced model reports its cost as unknown rather than as zero, because a missing price
and a free call are different claims. Prices are recorded per million tokens with the month
they were checked.
