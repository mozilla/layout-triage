# Firefox Platform Layout Triage

The script in this repository updates and generates triage duty cycle rotations for the Firefox Platform Layout team. Data is published as JSON for consumption by [release management auto-nag bots](https://github.com/mozilla/relman-auto-nag/blob/master/auto_nag/scripts/configs/layout_round_robin.json), as well as [ICAL](https://mozilla.github.io/layout-triage/layout-triage.ics) for consumption by team members.

## Installation

1. Clone the repository.
2. Run `npm install`.
3. Copy `config.template.json` to `config.json` and edit as needed.
4. If desired, run `npm run init` to fetch the current state of the triage history from GitHub.

## Adding a Triage Cycle

Run `npm run update`. Output (JSON and ICAL files) will be placed in the `dist` directory.

## Publishing Updated Data

Run `npm run publish`. This will publish everything in the `dist` directory to the `gh-pages` branch and push it to GitHub.

## Resetting All Data

**Note:** This will erase all triage history in `dist/history.json` and start triage rotation over using the first team member listed on `config.json`.

Run `npm run reset`.
