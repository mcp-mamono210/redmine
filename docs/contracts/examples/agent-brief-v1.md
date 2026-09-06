---
format_version: 1
redmine_issue_id: 1234
repository: example/agent-project
brief_revision: 1
requirements_fingerprint: sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
---

## Agent Brief

### Goal

Establish one machine-verifiable implementation contract for the example
change.

### Context

The example consumer needs a bounded Brief that can be reviewed before an Agent
is allowed to execute it.

### In Scope

- Validate the example contract artifact.
- Return explicit structural validation failures.

### Out of Scope

- Persisting the Brief.
- Changing workflow state.
- Starting an Agent.

### Requirements

- Accept the documented format version.
- Reject missing required metadata or sections.
- Keep runtime state outside the Brief.

### Architecture / Contract Constraints

- Treat the Redmine Issue as the requirements source of truth.
- Do not introduce an Agent execution or approval transition.

### Acceptance Criteria

- [ ] AC-1: The complete example conforms to Agent Brief format version 1.
- [ ] AC-2: Removing a required section produces a validation failure.

### Verification

- AC-1: Run the configured Agent Brief contract unit test and confirm that the tracked example is accepted.
- AC-2: Run the configured negative unit case and confirm that `section_missing` is returned.

### Deliverables

- A validated Agent Brief artifact.
- Validation evidence mapped to AC-1 and AC-2.

### Unresolved / Blocking

None.
