# Phase 6: Evaluation Scorecard

This phase adds run-level scoring and run-to-run comparison for demo and regression monitoring.

## What Was Added

## Scorecard logic
- New module: `lib/runScorecard.js`
- Computes per-run score object:
  - latency score
  - cost score
  - tool success rate
  - refusal rate (heuristic)
  - groundedness heuristic
- Produces `overall` score (0-100) + metric breakdown.

## Run summary integration
- `packages/core/events/index.js`
  - `summarizeRunEvents(...)` now includes `score`
  - repository/job summaries carry score where available
  - added `compareRuns(runA, runB)` helper
- `worker/index.js`
  - on run completion/failure, updates run metadata with computed score and token/cost fields

## API additions
- `GET /runs/compare/:runA/:runB`
  - returns run A summary, run B summary, and comparison output.

## UI updates
- `client/runs.html`
  - run list now shows score
  - details still show full summary/events
  - new comparison panel (select Run A/Run B and compare)

## Tests
- `tests/run-scorecard-phase6.test.js`
- `tests/runs-compare-route-phase6.test.js`

## Notes
- Scorecard is heuristic by design for MVP observability.
- It is intended for trend/comparison guidance rather than absolute quality certification.
