# puzzSLVer

Firefox extension that auto-solves puzzles on puzzle-*.com.

## Supported puzzles

| Site | Solver |
|---|---|
| puzzle-futoshiki.com | Futoshiki |
| puzzle-futoshiki.com/renzoku | Renzoku |
| puzzle-thermometers.com | Thermometers |
| puzzle-battleships.com | Battleships |

## Install

1. Go to [addons.mozilla.org](https://addons.mozilla.org) (search "puzzSLVer")
2. Click Add to Firefox
3. Visit any supported puzzle page — it solves automatically

Each solver can be toggled on/off in the extension preferences.

## Development

- `extension/` — the Firefox extension (load temporary at `about:debugging`)
- `solvers/` — Tampermonkey-ready `.user.js` source files
