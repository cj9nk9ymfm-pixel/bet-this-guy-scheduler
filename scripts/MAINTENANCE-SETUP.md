# Maintenance scheduler activation

Status: activated. The workflow runs from the default branch of this repository (`cj9nk9ymfm-pixel/bet-this-guy-scheduler`) every five minutes and calls the protected maintenance endpoint. Check the badge in `README.md` or the latest Actions run summary for current health. The steps below are kept for reference when rotating the token or reinstalling the scheduler.

Closing-line capture runs separately, from the Cloudflare Worker cron in `closing-cron/`, because GitHub starts scheduled runs late. To install or update it:

1. Deploy `closing-cron/` to the `bet-this-guy-scheduler` Worker. Either run `npx wrangler deploy` from `closing-cron/`, or connect Workers Builds to this repository with **Root directory** set to `closing-cron`.
2. Set the Worker secret `MAINTENANCE_TOKEN` to the same value as `BTG_MAINTENANCE_TOKEN`, either with `npx wrangler secret put MAINTENANCE_TOKEN` or in the dashboard under **Settings**, then **Variables and Secrets**.
3. During an active NFL window, check the Worker's cron runs in the dashboard. Each run should log `closing: completed`.

The workflow in `.github/workflows/btg-maintenance.yml` must be installed on a GitHub repository's default branch. The source repository on git.chatgpt-team.site does not run GitHub Actions.

1. Connect the user's GitHub account and choose an authorized repository for the small scheduler workflow. Keep the website hosted on Sites.
2. Generate a cryptographically random token (at least 32 bytes). Set the same value as secret MAINTENANCE_TOKEN in Sites and BTG_MAINTENANCE_TOKEN in GitHub Actions. Never commit, log, or place it in a URL. Deploy the saved Site version to apply its environment revision.
3. Install the workflow, run workflow_dispatch, and verify all three jobs succeed. Confirm scheduled runs follow without visitors. If networking or provider access fails, repair it before claiming activation.
4. Scheduled runs target every five minutes, offset from the hour. GitHub scheduling is best effort and can be delayed. Check account Actions limits before enabling; public schedules can disable after inactivity. See https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule.

The protected POST endpoint accepts only publish, grade, or closing; never arbitrary picks, odds, results, or code. It returns failure if a job throws, allowing the workflow to retry. Concurrent requests for a given job share work within a Worker instance. Weekly publication's database constraints protect across instances. Grading continues to use provisional/final confirmation rules; a completed job does not mean every pending pick is gradeable. Rotate all three secrets together: `MAINTENANCE_TOKEN` in Sites, `BTG_MAINTENANCE_TOKEN` in GitHub Actions and `MAINTENANCE_TOKEN` on the Cloudflare Worker.
