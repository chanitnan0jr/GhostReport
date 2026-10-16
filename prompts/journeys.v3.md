Create a project-scoped SegmentSpec using the supplied workflow and event_vocabulary.

Column contract:
Copy every state_id from required_columns in exactly that order into columns.
required_columns is the engine-derived scaffold of ALL Workflow Map states.
Never omit, duplicate, rename or reorder a state_id. Do not substitute an event
name or add outcome/ui_fact nodes. Only nodes with kind="state" are columns.
States without analytics, or with no recorded traffic, MUST still be included.
For each column, events may contain supplied vocabulary names supported by the
workflow for that state. Keep events=[] if none are supported. An empty events
array does not permit removing the column. Counts come from the engine, not you.

Rules are ordered, first match wins. Use only the closed predicate operators.
Prefer a compact set of distinct rules. Never put a has_after rule after a has
rule that already matches the same event: that later rule would be unreachable.

Predicate contract (applies recursively to every child):
- has and lacks require exactly 1 event in events. Never pass multiple events.
- has_after requires exactly 2 events: [a,b] means a was recorded after b.
- last_event_in requires 1 to 20 events; it checks the last recorded event.
- These event operators accept no children and no non-null outcome.
- all and any require 1 to 10 children; events must be empty, outcome null/omitted.
  all means every child matches; any means at least one child matches.
- attempt_outcome requires outcome: none, connected or errored; no events/children.
- always takes no arguments; use it only for the final catch-all rule.
Unused fields may be omitted, or events/children may be [] and outcome null.

Examples using symbolic event names A and B (replace with supplied vocabulary):
Valid single absence: {"op":"lacks","events":["A"]}
Invalid: {"op":"lacks","events":["A","B"]}
Neither A nor B recorded:
{"op":"all","children":[{"op":"lacks","events":["A"]},{"op":"lacks","events":["B"]}]}
At least one of A or B not recorded:
{"op":"any","children":[{"op":"lacks","events":["A"]},{"op":"lacks","events":["B"]}]}
Choose all or any explicitly according to the rule's intended recorded-event logic.
Never silently treat a multi-event has/lacks as either interpretation.

Each rule must cite at least one workflow node. In evidence, return node_id only;
omit file, lines and quote (the engine fills these source facts from the map).
Do not cite nodes marked ref_check=wrong. Do not invent code references or events.
If eligible_evidence_ids is supplied, every evidence node_id MUST be in that list.
A workflow state with a wrong reference still belongs in columns (the map is
not being edited), but MUST NOT be used as rule evidence. Instead cite a checked
UI fact or outcome in the same file, or define a different recorded-event rule.
Only events explicitly present in event_vocabulary are allowed. A vocabulary entry
is an allowed name, not proof the app emits that event; use the checked Workflow
Map to assess instrumentation. Do not invent names from wrong or unchecked refs.
Use descriptive recorded-event labels without intent, numbers, causal words or %.
For ENS use has/lacks/has_after/last_event_in, composed with all/any as needed,
plus the mandatory final always. ENS has no recorded sessions.
For Mock data, attempt_outcome is also available (none/connected/errored).
Absence predicates can be evaluated only with complete coverage. Unknown coverage
falls to a separate engine bucket, never treated as proof that a step did not happen.
The last rule must have label "No rule matched", predicate {"op":"always"}.
Only that last rule may use always. Every segment must have at least one rule.
ENS output is proposed structure from code, never observed behaviour.

When asked to repair a draft, use your previous assistant JSON and the validation
problems to correct it. Check the column contract again before returning JSON.
