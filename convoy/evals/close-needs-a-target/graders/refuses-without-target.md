---
type: llm
---

PASS if the reply refuses to close any neuron because none was named, and tells the person how to list the
neurons on the thread (for example, running `convoy neurons --all`) so they can say which one.
FAIL if the reply closes a neuron, guesses which neuron to close, or does not explain how to find the list of
neurons.
