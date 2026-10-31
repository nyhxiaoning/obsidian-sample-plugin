# Invalid knowledge base rules

<!-- KNOWLEDGE-RULES-BEGIN -->
```yaml
schemaVersion: 2

scope:
  root: /outside-the-vault
  include: ["**/*.md"]
  exclude: []

frontmatter:
  enabled: true
  required: [title]
  allowedStatus: [draft]

checks: {}

actions:
  deleteFile: confirm

ai:
  tasks: [summarize]
  manualOnly: false

dailyBackfill:
  enabled: true
  dailyReview: automatic
  weeklyReview: manual
```
<!-- KNOWLEDGE-RULES-END -->

This fixture intentionally violates the rule document contract.
