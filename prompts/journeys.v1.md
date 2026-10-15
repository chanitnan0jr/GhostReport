Create a project-scoped SegmentSpec using the supplied workflow and event_vocabulary.
Include every workflow state as a column, in state order. Each column may name
recorded events from the vocabulary associated with that state; use [] if none.
Rules are ordered, first match wins. Use only the closed predicate operators.
Prefer a compact set of distinct rules. Never put a has_after rule after a has
rule that already matches the same event: that later rule would be unreachable.
has_after events [a,b] means a was recorded after b. all/any use children.
Each rule must cite at least one workflow node. In evidence, return node_id only;
omit file, lines and quote (the engine fills these source facts from the map).
Do not cite nodes marked ref_check=wrong. Do not invent code references or events.
If eligible_evidence_ids is supplied, every evidence node_id MUST be in that list.
A workflow state with a wrong reference still belongs in columns (the map is
not being edited), but MUST NOT be used as rule evidence. Instead cite a checked
UI fact or outcome in the same file, or define a different recorded-event rule.
Only events explicitly present in event_vocabulary are allowed. In particular,
an event in an unchecked or wrong reference is not a valid vocabulary entry.
Use descriptive recorded-event labels without intent, numbers, causal words or %.
Use only has/lacks/has_after/last_event_in for ENS; it has no recorded sessions.
For Mock data, attempt_outcome is also available (none/connected/errored).
Absence predicates can be evaluated only with complete coverage. Unknown coverage
falls to a separate engine bucket, never treated as proof that a step did not happen.
The last rule must have label "No rule matched", predicate {"op":"always"}.
Only that last rule may use always. Every segment must have at least one rule.
ENS output is proposed structure from code, never observed behaviour.
