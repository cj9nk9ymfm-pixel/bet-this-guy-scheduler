# Bet This Guy scheduler

[![Publish and grade official picks](https://github.com/cj9nk9ymfm-pixel/bet-this-guy-scheduler/actions/workflows/btg-maintenance.yml/badge.svg)](https://github.com/cj9nk9ymfm-pixel/bet-this-guy-scheduler/actions/workflows/btg-maintenance.yml)

This repository runs Bet This Guy's automatic publishing, grading and closing-line capture.

## Health

The badge above is green when the latest maintenance run succeeded and red when attention is needed. Open **Actions**, choose the latest run and read its summary to see:

- whether the scheduler was in an active NFL window or a quiet period;
- which maintenance jobs ran;
- whether publishing, grading and closing-line capture completed; and
- whether a quiet-period check avoided provider calls.

## API budget guardrails

The timer checks every five minutes, but provider calls are throttled automatically:

- During active NFL windows, closing-line capture checks every five minutes, grading runs about every ten minutes and publishing runs about every fifteen minutes.
- During quiet periods, most runs make zero provider calls.
- A lightweight publishing and grading checkpoint runs every six hours during quiet periods.
- Manual and workflow-change verification runs execute all three jobs.

The repository contains no sportsbook or stats-provider API keys. The maintenance credential is stored only as an encrypted GitHub Actions secret.
