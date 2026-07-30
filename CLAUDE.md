# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Classic Tetris implemented in vanilla JavaScript with the HTML5 Canvas 2D API. No dependencies, no `package.json`, no build step, no test suite — the entire game logic lives in a single file, `game.js` (~300 lines).

## Running the game

There is no build/lint/test tooling. To run:

```bash
start index.html       # Windows: just open the file directly
```

or serve it statically (needed if you hit CORS/module issues, otherwise optional):

```bash
python3 -m http.server 8000
npx serve .
php -S localhost:8000
```

Then verify changes by opening the page in a browser and playing — there are no automated tests.

## Architecture

Three files, each with a single responsibility:

- `index.html` — DOM shell: main `<canvas id="board">` (300×600, i.e. `COLS×BLOCK` by `ROWS×BLOCK`), a side panel (score/lines/level/next-piece canvas/controls), and a hidden `#overlay` div reused for both Pause and Game Over states.
- `style.css` — dark/retro arcade visual theme only.
- `game.js` — all game logic and rendering. Uses module-level `let` globals (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropInterval`, etc.) reset in `init()` rather than a class/state object — keep this pattern when extending rather than introducing a competing state container.

### Core data model

- **Board**: a `ROWS × COLS` matrix (`createBoard()`). Each cell is `0` (empty) or an integer `1–7` indexing into `COLORS`/`PIECES` to identify which piece color occupies it.
- **Pieces**: `PIECES` holds the 7 tetromino shapes as square matrices of small ints; `current`/`next` are `{ type, shape, x, y }`. Rotation (`rotateCW`) is a transpose + row-reverse — it does not use precomputed rotation states (no SRS), so any rotation-system change means touching this function directly.

### Game loop

`init()` seeds state and kicks off `requestAnimationFrame(loop)`. `loop(ts)` accumulates elapsed time into `dropAccum`; once it exceeds `dropInterval` the current piece drops one row (or locks if blocked), then `draw()` renders the frame and reschedules itself. Pause/resume works by cancelling/restarting this rAF chain (`togglePause`), not by branching inside `loop`.

### Key functions and how they connect

- `collide(shape, ox, oy)` — the single source of truth for "is this position legal" (walls, floor, and locked cells). Every movement/rotation/lock path routes through it.
- `tryRotate()` — rotates `current.shape` then tries wall-kick offsets `[0, -1, 1, -2, 2]` via `collide`, keeping the first that fits.
- `lockPiece()` → `merge()` (bakes the piece into `board`) → `clearLines()` (scans bottom-up, splices full rows, unshifts empty ones, updates score/lines/level/`dropInterval`) → `spawn()` (promotes `next` to `current`, generates a new `next`, and calls `endGame()` if the new piece immediately collides).
- `ghostY()` — projects `current` straight down via repeated `collide` checks; used both for the ghost-piece render and for hard-drop's landing row.
- Scoring: `LINE_SCORES = [0, 100, 300, 500, 800]` × `level` on line clears; hard drop adds 2×rows dropped; soft drop adds 1 per row. Level increases every 10 lines; `dropInterval = max(100, 1000 - (level-1)*90)`.

### Rendering

`draw()` clears and redraws the whole board every frame in a fixed layering order: grid → locked board cells → ghost piece (`globalAlpha = 0.2`) → current piece. `drawNext()` renders the preview piece centered in the smaller `#next-canvas` using the same `drawBlock()` helper. There is no dirty-rect optimization — the whole canvas repaints each tick.

### Input

A single `keydown` listener switches on `e.code` (arrow keys move/rotate/soft-drop, `Space` hard-drops, `P` toggles pause) and is gated by `paused`/`gameOver`. `restartBtn` re-invokes `init()`.

## Tunable constants (top of `game.js`)

`COLS`, `ROWS`, `BLOCK`, `COLORS`, `LINE_SCORES`, initial `dropInterval`. If `COLS`/`ROWS`/`BLOCK` change, also update the `#board` canvas `width`/`height` in `index.html` to match (`COLS×BLOCK` by `ROWS×BLOCK`).
