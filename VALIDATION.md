# TCG 1 Billion Monitor v1.9.1 - Railway Milestone Bug Fix Validation

## Fix verified

- Default schedule includes 10M, 5M, 2M, 500K, 100K, 50K, 10K, and 5K remaining.
- `MILESTONE_REMAINING` can replace the countdown schedule from Railway Variables.
- JSON-array and plain-number formats are parsed.
- Invalid empty schedules fall back safely to the default schedule.
- The final one-billion milestone is always included.
- Removed milestone locks are preserved so re-adding a milestone does not unexpectedly resend it.
- Existing `/data` SQLite data remains compatible.
- Email and Teams locks stay independent.

## Automated tests

- Return code: 0
- Tests: 44
- Passed: 41
- Failed: 0
- Skipped: 3
- Railway smoke test: PASS

## Syntax

- `server.js`: PASS
- `scraper.js`: PASS
- `client.js`: PASS
- `config.js`: PASS
- `db.js`: PASS
- `mailer.js`: PASS
- `milestones.js`: PASS
- `teams.js`: PASS

## Dependency archive

- SHA-256 verification: PASS
- Railway build performs no npm installation.

## Flat package

- All files are at ZIP root.
- No containing folder.
- No nested asset folder.

## Test output

```text
0.521921
  type: 'test'
  ...
# Subtest: crossing several thresholds exposes every unsent milestone with the most urgent first
ok 5 - crossing several thresholds exposes every unsent milestone with the most urgent first
  ---
  duration_ms: 2.50273
  type: 'test'
  ...
# Subtest: existing milestone state gains the new 10M, 5M and 2M delivery locks without losing old locks
ok 6 - existing milestone state gains the new 10M, 5M and 2M delivery locks without losing old locks
  ---
  duration_ms: 0.439128
  type: 'test'
  ...
# Subtest: low-confidence readings do not arm notifications
ok 7 - low-confidence readings do not arm notifications
  ---
  duration_ms: 0.986171
  type: 'test'
  ...
# Subtest: reset clears all email and Teams locks
ok 8 - reset clears all email and Teams locks
  ---
  duration_ms: 0.775931
  type: 'test'
  ...
# Subtest: Railway milestone variable parses plain numbers and sorts them from largest to smallest
ok 9 - Railway milestone variable parses plain numbers and sorts them from largest to smallest
  ---
  duration_ms: 1.061861
  type: 'test'
  ...
# Subtest: Railway milestone variable accepts a JSON array
ok 10 - Railway milestone variable accepts a JSON array
  ---
  duration_ms: 0.687095
  type: 'test'
  ...
# Subtest: an invalid Railway milestone variable safely falls back to the default schedule
ok 11 - an invalid Railway milestone variable safely falls back to the default schedule
  ---
  duration_ms: 0.319809
  type: 'test'
  ...
# Subtest: dynamic milestone builder always includes the final one-billion milestone
ok 12 - dynamic milestone builder always includes the final one-billion milestone
  ---
  duration_ms: 0.390247
  type: 'test'
  ...
# Subtest: delivery locks survive when a milestone is temporarily removed from Railway settings
ok 13 - delivery locks survive when a milestone is temporarily removed from Railway settings
  ---
  duration_ms: 0.316551
  type: 'test'
  ...
# Subtest: secureEqual compares values without accepting different lengths
ok 14 - secureEqual compares values without accepting different lengths
  ---
  duration_ms: 1.863015
  type: 'test'
  ...
# Subtest: signed auth tokens validate and expire
ok 15 - signed auth tokens validate and expire
  ---
  duration_ms: 66.186103
  type: 'test'
  ...
# Subtest: cookie parser handles multiple cookies
ok 16 - cookie parser handles multiple cookies
  ---
  duration_ms: 1.94774
  type: 'test'
  ...
# Subtest: uses Railway volume mount automatically for SQLite
ok 17 - uses Railway volume mount automatically for SQLite
  ---
  duration_ms: 2.93764
  type: 'test'
  ...
# Subtest: explicit DB_PATH overrides Railway volume path
ok 18 - explicit DB_PATH overrides Railway volume path
  ---
  duration_ms: 4.032996
  type: 'test'
  ...
# Subtest: counter source is locked to the TCG product page despite legacy environment variables
ok 19 - counter source is locked to the TCG product page despite legacy environment variables
  ---
  duration_ms: 0.708824
  type: 'test'
  ...
# Subtest: parses comma-separated card totals
ok 20 - parses comma-separated card totals
  ---
  duration_ms: 2.739778
  type: 'test'
  ...
# Subtest: parses totals split by spaces or punctuation
ok 21 - parses totals split by spaces or punctuation
  ---
  duration_ms: 0.381116
  type: 'test'
  ...
# Subtest: ignores years and implausibly large timestamps
ok 22 - ignores years and implausibly large timestamps
  ---
  duration_ms: 1.884394
  type: 'test'
  ...
# Subtest: prefers the number closest to the counter label
ok 23 - prefers the number closest to the counter label
  ---
  duration_ms: 0.490375
  type: 'test'
  ...
# Subtest: selects the live phyzbatched value instead of a one-billion target in network data
ok 24 - selects the live phyzbatched value instead of a one-billion target in network data
  ---
  duration_ms: 0.499157
  type: 'test'
  ...
# Subtest: returns null when no usable total exists
ok 25 - returns null when no usable total exists
  ---
  duration_ms: 0.235106
  type: 'test'
  ...
# (node:7375) ExperimentalWarning: SQLite is an experimental feature and might change at any time
# (Use `node --trace-warnings ...` to show where the warning was created)
# Subtest: SQLite state, recipients and logs persist across reopen
ok 26 - SQLite state, recipients and logs persist across reopen
  ---
  duration_ms: 31.321229
  type: 'test'
  ...
# Subtest: legacy homepage settings are migrated to /product and stale counter is reset
ok 27 - legacy homepage settings are migrated to /product and stale counter is reset
  ---
  duration_ms: 64.813753
  type: 'test'
  ...
# Subtest: builds a 500,000-cards-away email for every enabled recipient
ok 28 - builds a 500,000-cards-away email for every enabled recipient
  ---
  duration_ms: 76.479279
  type: 'test'
  ...
# Subtest: builds a 10,000,000-cards-away email and points to the 5,000,000 milestone next
ok 29 - builds a 10,000,000-cards-away email and points to the 5,000,000 milestone next
  ---
  duration_ms: 13.013404
  type: 'test'
  ...
# Subtest: builds the final one-billion email from the editable final template
ok 30 - builds the final one-billion email from the editable final template
  ---
  duration_ms: 8.315425
  type: 'test'
  ...
# Subtest: test email does not require a milestone and identifies itself as a test
ok 31 - test email does not require a milestone and identifies itself as a test
  ---
  duration_ms: 7.998781
  type: 'test'
  ...
# Subtest: refuses to send with no enabled recipients
ok 32 - refuses to send with no enabled recipients
  ---
  duration_ms: 1.528286
  type: 'test'
  ...
# Subtest: extracts the counter from an exact selector
ok 33 - extracts the counter from an exact selector # SKIP
  ---
  duration_ms: 1.605918
  type: 'test'
  ...
# Subtest: extracts the counter from text near the label without a selector
ok 34 - extracts the counter from text near the label without a selector # SKIP
  ---
  duration_ms: 0.195104
  type: 'test'
  ...
# Subtest: extracts only the Cards PhyzBatched value from a product-page JSON payload
ok 35 - extracts only the Cards PhyzBatched value from a product-page JSON payload
  ---
  duration_ms: 1.281208
  type: 'test'
  ...
# Subtest: ignores unrelated payloads that do not identify the Cards PhyzBatched counter
ok 36 - ignores unrelated payloads that do not identify the Cards PhyzBatched counter
  ---
  duration_ms: 0.32592
  type: 'test'
  ...
# Subtest: extracts a large counter placed immediately above the label
ok 37 - extracts a large counter placed immediately above the label # SKIP
  ---
  duration_ms: 0.204233
  type: 'test'
  ...
# Subtest: WebSocket hub authenticates, sends initial state and broadcasts updates
ok 38 - WebSocket hub authenticates, sends initial state and broadcasts updates
  ---
  duration_ms: 138.205279
  type: 'test'
  ...
# Subtest: builds an Adaptive Card message for a countdown milestone
ok 39 - builds an Adaptive Card message for a countdown milestone
  ---
  duration_ms: 10.030327
  type: 'test'
  ...
# Subtest: builds an Adaptive Card for the new 5,000,000-cards-away milestone
ok 40 - builds an Adaptive Card for the new 5,000,000-cards-away milestone
  ---
  duration_ms: 0.563492
  type: 'test'
  ...
# Subtest: builds a final one-billion Teams announcement
ok 41 - builds a final one-billion Teams announcement
  ---
  duration_ms: 0.356928
  type: 'test'
  ...
# Subtest: posts JSON to a configured Teams webhook
ok 42 - posts JSON to a configured Teams webhook
  ---
  duration_ms: 1.251824
  type: 'test'
  ...
# Subtest: stream mode validates the Teams route without network access
ok 43 - stream mode validates the Teams route without network access
  ---
  duration_ms: 4.0131
  type: 'test'
  ...
# Subtest: rejects an invalid or insecure webhook URL
ok 44 - rejects an invalid or insecure webhook URL
  ---
  duration_ms: 1.168401
  type: 'test'
  ...
1..44
# tests 44
# suites 0
# pass 41
# fail 0
# cancelled 0
# skipped 3
# todo 0
# duration_ms 2086.689961


```

## Smoke output

```text
Railway smoke test passed: health, login, state, persistence, recipients, email and Microsoft Teams test flows.


```
