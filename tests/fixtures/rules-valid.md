# Knowledge base rules

<!-- KNOWLEDGE-RULES-BEGIN -->
```yaml
schemaVersion: 1

scope:
  root: 000ai知识库价值写作体系
  include:
    - "**/*.md"
  exclude:
    - "系统/**"

frontmatter:
  enabled: true
  required:
    - title
    - status
    - created
    - updated
  allowedStatus:
    - draft
    - reviewing
    - verified
    - deprecated

checks:
  fileName: true
  directory: true
  source: true
  duplicateTopic: true
  relatedLinks: true

actions:
  patchFrontmatter: confirm
  applyTemplate: confirm
  moveFile: confirm
  regenerateIndex: allowed
  deleteFile: denied

ai:
  tasks:
    - classify
    - summarize
    - suggestRelations
    - suggestChanges
  manualOnly: true

dailyBackfill:
  enabled: true
  dailyReview: manual
  weeklyReview: manual
```
<!-- KNOWLEDGE-RULES-END -->

Keep the executable configuration synchronized with the guidance below.
