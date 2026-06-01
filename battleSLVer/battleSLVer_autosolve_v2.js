// ==UserScript==
// @name         Bimaru Solver v9.0 (Fleet-Backtracking Engine)
// @namespace    http://tampermonkey.net/
// @version      9.1
// @description  Battleships (Bimaru) Solver. pristine Fleet-Backtracking Architecture.
// @author       You
// @match        *://www.puzzle-battleships.com/*
// @grant        none
// @run-at       document-start
//
// "Once you eliminate the water, whatever remains, no matter how populated, must be the ship."
// — The Bimaru Deductive Maxim
// ==/UserScript==

(function () {
    'use strict';

    const SCRIPT_START = performance.now();
    let solverTriggered = false;

    // ========================
    //  3-TIER ZERO-LATENCY DETECTION
    // ========================

    // TIER 1: defineProperty trap — fires synchronously when Game is assigned
    let originalGame;
    Object.defineProperty(window, 'Game', {
        get() { return originalGame; },
        set(newValue) {
            originalGame = newValue;
            if (newValue && !(newValue instanceof HTMLElement)) {
                waitForData(newValue);
            }
        },
        configurable: true,
        enumerable: true
    });

    // TIER 2: Cold start — Game already exists
    if (window.Game && !(window.Game instanceof HTMLElement)) {
        originalGame = window.Game;
        waitForData(originalGame);
    }

    // TIER 3: Fallback poller
    const poller = setInterval(() => {
        if (solverTriggered) { clearInterval(poller); return; }
        const target = window.Game;
        if (target && !(target instanceof HTMLElement)) {
            waitForData(target);
        }
    }, 10);

    function waitForData(G) {
        const dataPoller = setInterval(() => {
            if (solverTriggered) { clearInterval(dataPoller); return; }
            if (window.task && G.currentState && G.currentState.cellStatus &&
                G.currentState.cellStatus.length > 0 && G.loaded) {
                solverTriggered = true;
                clearInterval(dataPoller);
                clearInterval(poller);

                const detectTime = performance.now() - SCRIPT_START;
                console.log(`%c[Bimaru] Task detected in ${detectTime.toFixed(2)}ms`, 'color: #007427ff;');
                console.log(`%c[Bimaru] Task: ${window.task}`, 'color: #000000ff;');

                launchSolver(G, window.task);
            }
        }, 1);
    }

    // ========================
    //  LAUNCHER
    // ========================

    function launchSolver(G, taskString) {
        const parts = taskString.split(';');
        const clues = parts[0].split(',').map(Number);
        const N = clues.length / 2;

        if (parts[1] && G.loadTaskState) G.loadTaskState(parts[1]);

        // Read fleet from Game.ships[N]
        const shipsArr = G.ships && G.ships[N];
        const fleet = {};
        let maxShipSize = 0;
        if (shipsArr) {
            for (let i = 0; i < shipsArr.length; i++) {
                fleet[i + 1] = shipsArr[i];
                if (shipsArr[i] > 0) maxShipSize = i + 1;
            }
        } else {
            maxShipSize = (N === 6) ? 3 : ((N === 15) ? 5 : 4);
            const fb = maxShipSize === 5 ? { 5: 1, 4: 2, 3: 3, 2: 4, 1: 5 } :
                (maxShipSize === 4 ? { 4: 1, 3: 2, 2: 3, 1: 4 } : { 3: 1, 2: 2, 1: 3 });
            Object.assign(fleet, fb);
        }

        const fleetStr = Object.entries(fleet).map(([s, c]) => `${c}×${s}`).reverse().join(', ');
        console.log(`%c[Bimaru] Fleet: ${fleetStr} | Grid: ${N}×${N}`, 'color: #076badff;');

        const t0 = performance.now();
        const result = solveLogic(taskString, fleet, N, G);
        const elapsed = (performance.now() - t0) * 1000; // microseconds

        if (result && result.grid) {
            console.log(`%c[Bimaru]  Solved in ${elapsed < 1000 ? elapsed.toFixed(1) + 'μs' : (elapsed / 1000).toFixed(2) + 'ms'}`, 'color: #66bb6a; font-weight: bold;');
            injectSolution(G, result.grid, N);
        } else {
            console.error('[Bimaru]  Core logic solver failed or returned null.');
        }
    }

    function isShip(v) { return v === 1 || v === 3 || v === 4 || v === 5 || v === 6 || v === 7 || v === 8; }

    function solveLogic(taskStr, fleet, size, G) {
        let parts = taskStr.split(';');
        let clues = parts[0].split(',').map(Number);
        let colClues = clues.slice(0, size);
        let rowClues = clues.slice(size);

        let grid = Array.from({ length: size }, () => new Array(size).fill(0));
        let rowShips = new Array(size).fill(0), colShips = new Array(size).fill(0);

        // Secondary List of Clues (clues - segments filled)
        let remRowClues = [...rowClues];
        let remColClues = [...colClues];

        let maxShipSize = Math.max(...Object.keys(fleet).map(Number));

        let stats = { passes: 0 };

        // --- ⚡ EVENT-DRIVEN QUEUES ⚡ ---
        let queueCells = [];
        let queueRows = new Set();
        let queueCols = new Set();

        function set(r, c, val) {
            if (grid[r][c] === 0) {
                grid[r][c] = val;

                // Instantly queue this coordinate AND its 4 orthogonal neighbors for localized evaluation
                queueCells.push({ r, c });
                if (r > 0) queueCells.push({ r: r - 1, c });
                if (r < size - 1) queueCells.push({ r: r + 1, c });
                if (c > 0) queueCells.push({ r, c: c - 1 });
                if (c < size - 1) queueCells.push({ r, c: c + 1 });

                queueRows.add(r);
                queueCols.add(c);

                if (isShip(val)) {
                    rowShips[r]++;
                    colShips[c]++;
                    remRowClues[r]--;
                    remColClues[c]--;
                }
            } else if (grid[r][c] === 1 && isShip(val) && val !== 1) {
                // UPGRADE: Cell is known as ship (1), now assigning specific shape (3-8)
                grid[r][c] = val;
                queueCells.push({ r, c });
                queueRows.add(r);
                queueCols.add(c);
            }
        }

        // Load Givens
        if (G.locked) {
            for (let r = 0; r < size; r++) {
                for (let c = 0; c < size; c++) {
                    let v = G.locked[r][c];
                    if (v !== undefined && v !== -1 && v !== '') {
                        let parsed = 0;
                        let code = parseInt(v, 10);
                        if (!isNaN(code)) {
                            switch (code) {
                                case 0: parsed = 2; break; // Water
                                case 1: parsed = 8; break; // Sub
                                case 2: parsed = 7; break; // Middle
                                case 3: parsed = 3; break; // Top
                                case 4: parsed = 6; break; // Right
                                case 5: parsed = 4; break; // Bottom
                                case 6: parsed = 5; break; // Left
                            }
                        } else if (typeof v === 'string') {
                            // Only fall back to character matching if the code wasn't numeric
                            if (v === 'S' || v === 'O') parsed = 8;
                            else if (v === 'W') parsed = 2;
                            else if (v === '^') parsed = 3;
                            else if (v === 'v') parsed = 4;
                            else if (v === '<') parsed = 5;
                            else if (v === '>') parsed = 6;
                            else if (v === 'X' || v === '+') parsed = 7;
                            else parsed = 1;
                        }

                        if (parsed !== 0) set(r, c, parsed);
                    }
                }
            }
        }

        /*
        // THEN Load Initial State from the DOM (User's manual clicks)
        // Since set() refuses to overwrite already-assigned cells, givens are completely protected!
        if (G.currentState && G.currentState.cellStatus) {
            for (let r = 0; r < size; r++) {
                for (let c = 0; c < size; c++) {
                    let st = G.currentState.cellStatus[r][c];
                    if (st !== 0) set(r, c, st);
                }
            }
        }
        */

        // ========================
        //  STEP-BY-STEP ISOLATED LOGIC
        // ========================

        // console.log("[Bimaru] 🧠 Running ISOLATED Test: Event-Driven Queue Propagation...");

        let equilibriumReached = false;
        while (!equilibriumReached) {

            while (queueCells.length > 0 || queueRows.size > 0 || queueCols.size > 0) {
                stats.passes++;

                // 1. Process specifically modified cells
                while (queueCells.length > 0) {
                    let { r, c } = queueCells.shift();
                    let v = grid[r][c];

                    if (!isShip(v)) continue;

                    // Rule 1: Diagonal fill with water for ALL ship-segments
                    for (let dr = -1; dr <= 1; dr += 2) {
                        for (let dc = -1; dc <= 1; dc += 2) {
                            let nr = r + dr, nc = c + dc;
                            if (nr >= 0 && nr < size && nc >= 0 && nc < size && grid[nr][nc] === 0) {
                                set(nr, nc, 2);
                            }
                        }
                    }

                    // Rule 3: Submarines
                    if (v === 8) {
                        if (r > 0 && grid[r - 1][c] === 0) set(r - 1, c, 2);
                        if (r < size - 1 && grid[r + 1][c] === 0) set(r + 1, c, 2);
                        if (c > 0 && grid[r][c - 1] === 0) set(r, c - 1, 2);
                        if (c < size - 1 && grid[r][c + 1] === 0) set(r, c + 1, 2);
                    }

                    // Rule 4: Cap Constraints
                    if (v === 3) {
                        if (r > 0 && grid[r - 1][c] === 0) set(r - 1, c, 2);
                        if (c > 0 && grid[r][c - 1] === 0) set(r, c - 1, 2);
                        if (c < size - 1 && grid[r][c + 1] === 0) set(r, c + 1, 2);
                        if (r < size - 1 && grid[r + 1][c] === 0) set(r + 1, c, 1);
                    }
                    if (v === 4) {
                        if (r < size - 1 && grid[r + 1][c] === 0) set(r + 1, c, 2);
                        if (c > 0 && grid[r][c - 1] === 0) set(r, c - 1, 2);
                        if (c < size - 1 && grid[r][c + 1] === 0) set(r, c + 1, 2);
                        if (r > 0 && grid[r - 1][c] === 0) set(r - 1, c, 1);
                    }
                    if (v === 5) {
                        if (c > 0 && grid[r][c - 1] === 0) set(r, c - 1, 2);
                        if (r > 0 && grid[r - 1][c] === 0) set(r - 1, c, 2);
                        if (r < size - 1 && grid[r + 1][c] === 0) set(r + 1, c, 2);
                        if (c < size - 1 && grid[r][c + 1] === 0) set(r, c + 1, 1);
                    }
                    if (v === 6) {
                        if (c < size - 1 && grid[r][c + 1] === 0) set(r, c + 1, 2);
                        if (r > 0 && grid[r - 1][c] === 0) set(r - 1, c, 2);
                        if (r < size - 1 && grid[r + 1][c] === 0) set(r + 1, c, 2);
                        if (c > 0 && grid[r][c - 1] === 0) set(r, c - 1, 1);
                    }

                    // Rule 5: Middle Segment Alignment
                    if (v === 7) {
                        let blockedH = (c === 0 || c === size - 1 || grid[r][c - 1] === 2 || grid[r][c + 1] === 2);
                        let blockedV = (r === 0 || r === size - 1 || grid[r - 1][c] === 2 || grid[r + 1][c] === 2);
                        if (blockedH && !blockedV) {
                            if (r > 0 && grid[r - 1][c] === 0) set(r - 1, c, 1);
                            if (r < size - 1 && grid[r + 1][c] === 0) set(r + 1, c, 1);
                        }
                        if (blockedV && !blockedH) {
                            if (c > 0 && grid[r][c - 1] === 0) set(r, c - 1, 1);
                            if (c < size - 1 && grid[r][c + 1] === 0) set(r, c + 1, 1);
                        }
                    }
                }

                // 2. Process modified Rows
                let rowsToProcess = Array.from(queueRows);
                queueRows.clear();
                for (let r of rowsToProcess) {
                    if (remRowClues[r] === 0) {
                        for (let c = 0; c < size; c++) if (grid[r][c] === 0) set(r, c, 2);
                    } else {
                        let emptyCountR = 0;
                        for (let c = 0; c < size; c++) if (grid[r][c] === 0) emptyCountR++;
                        if (emptyCountR > 0 && remRowClues[r] === emptyCountR) {
                            for (let c = 0; c < size; c++) if (grid[r][c] === 0) set(r, c, 1);
                        }
                    }
                }

                // 3. Process modified Cols
                let colsToProcess = Array.from(queueCols);
                queueCols.clear();
                for (let c of colsToProcess) {
                    if (remColClues[c] === 0) {
                        for (let r = 0; r < size; r++) if (grid[r][c] === 0) set(r, c, 2);
                    } else {
                        let emptyCountC = 0;
                        for (let r = 0; r < size; r++) if (grid[r][c] === 0) emptyCountC++;
                        if (emptyCountC > 0 && remColClues[c] === emptyCountC) {
                            for (let r = 0; r < size; r++) if (grid[r][c] === 0) set(r, c, 1);
                        }
                    }
                }
            } // End of Queue-Based loop

            // --- ADVANCED RULES (Run only when base constraints reach equilibrium) ---
            equilibriumReached = true;

            // Rule 7: Fleet Saturation Deductions
            let completedCounts = {};
            for (let s in fleet) completedCounts[s] = 0;
            let visited = Array.from({ length: size }, () => new Array(size).fill(false));
            let openStrings = [];

            for (let r = 0; r < size; r++) {
                for (let c = 0; c < size; c++) {
                    if (isShip(grid[r][c]) && !visited[r][c]) {
                        let comp = [], q = [{ r, c }];
                        visited[r][c] = true;
                        let isH = false, isV = false;

                        while (q.length > 0) {
                            let curr = q.shift();
                            comp.push(curr);
                            for (let [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
                                let nr = curr.r + dr, nc = curr.c + dc;
                                if (nr >= 0 && nr < size && nc >= 0 && nc < size && isShip(grid[nr][nc]) && !visited[nr][nc]) {
                                    visited[nr][nc] = true;
                                    q.push({ r: nr, c: nc });
                                    if (dr !== 0) isV = true;
                                    if (dc !== 0) isH = true;
                                }
                            }
                        }

                        let len = comp.length;
                        let isComplete = false;

                        if (len === 1) {
                            let r0 = comp[0].r, c0 = comp[0].c;
                            let bT = (r0 === 0 || grid[r0 - 1][c0] === 2);
                            let bB = (r0 === size - 1 || grid[r0 + 1][c0] === 2);
                            let bL = (c0 === 0 || grid[r0][c0 - 1] === 2);
                            let bR = (c0 === size - 1 || grid[r0][c0 + 1] === 2);
                            if (bT && bB && bL && bR) isComplete = true;
                            else openStrings.push({ comp, len });
                        } else if (isH) {
                            comp.sort((a, b) => a.c - b.c);
                            let L = comp[0], R = comp[comp.length - 1];
                            let bL = (L.c === 0 || grid[L.r][L.c - 1] === 2);
                            let bR = (R.c === size - 1 || grid[R.r][R.c + 1] === 2);
                            if (bL && bR) isComplete = true;
                            else openStrings.push({ comp, len, dir: 'H', L, R });
                        } else if (isV) {
                            comp.sort((a, b) => a.r - b.r);
                            let T = comp[0], B = comp[comp.length - 1];
                            let bT = (T.r === 0 || grid[T.r - 1][T.c] === 2);
                            let bB = (B.r === size - 1 || grid[B.r + 1][B.c] === 2);
                            if (bT && bB) isComplete = true;
                            else openStrings.push({ comp, len, dir: 'V', T, B });
                        }

                        if (isComplete) completedCounts[len] = (completedCounts[len] || 0) + 1;
                    }
                }
            }

            let saturatedSizes = new Set();
            for (let s in fleet) if (completedCounts[s] >= fleet[s]) saturatedSizes.add(Number(s));

            for (let open of openStrings) {
                let emptyCorridors = [];
                if (open.len === 1) {
                    let r = open.comp[0].r, c = open.comp[0].c;
                    for (let [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
                        let dist = 0, tr = r, tc = c;
                        while (true) {
                            tr += dr; tc += dc;
                            if (tr < 0 || tr >= size || tc < 0 || tc >= size || grid[tr][tc] === 2) break;
                            if (grid[tr][tc] === 0) dist++; else break;
                        }
                        if (dist > 0) emptyCorridors.push({ dr, dc, dist, startR: r + dr, startC: c + dc });
                    }
                } else if (open.dir === 'H') {
                    let distL = 0, tr = open.L.r, tc = open.L.c;
                    while (true) { tc--; if (tc < 0 || grid[tr][tc] === 2) break; if (grid[tr][tc] === 0) distL++; else break; }
                    if (distL > 0) emptyCorridors.push({ dr: 0, dc: -1, dist: distL, startR: tr, startC: open.L.c - 1 });

                    let distR = 0, tc2 = open.R.c;
                    while (true) { tc2++; if (tc2 >= size || grid[tr][tc2] === 2) break; if (grid[tr][tc2] === 0) distR++; else break; }
                    if (distR > 0) emptyCorridors.push({ dr: 0, dc: 1, dist: distR, startR: tr, startC: open.R.c + 1 });
                } else if (open.dir === 'V') {
                    let distT = 0, tr = open.T.r, tc = open.T.c;
                    while (true) { tr--; if (tr < 0 || grid[tr][tc] === 2) break; if (grid[tr][tc] === 0) distT++; else break; }
                    if (distT > 0) emptyCorridors.push({ dr: -1, dc: 0, dist: distT, startR: open.T.r - 1, startC: tc });

                    let distB = 0, tr2 = open.B.r;
                    while (true) { tr2++; if (tr2 >= size || grid[tr2][tc] === 2) break; if (grid[tr2][tc] === 0) distB++; else break; }
                    if (distB > 0) emptyCorridors.push({ dr: 1, dc: 0, dist: distB, startR: open.B.r + 1, startC: tc });
                }

                if (emptyCorridors.length === 0) continue;

                let maxL = open.len;
                for (let e of emptyCorridors) maxL += e.dist;

                // Deduction 1: Forbidden Expansion
                let allExpansionsSaturated = true;
                for (let L = open.len + 1; L <= maxL; L++) {
                    if (fleet[L] !== undefined && !saturatedSizes.has(L)) allExpansionsSaturated = false;
                }

                if (allExpansionsSaturated) {
                    for (let e of emptyCorridors) set(e.startR, e.startC, 2);
                    equilibriumReached = false;
                }

                // Deduction 2: Specific Size Forced Extension (Current size is saturated)
                if (saturatedSizes.has(open.len)) {
                    if (emptyCorridors.length === 1) {
                        set(emptyCorridors[0].startR, emptyCorridors[0].startC, 1);
                        equilibriumReached = false;
                    }
                }

                // Rule 10: Maximum Fleet Reach (Water Bounding)
                let globalMaxLegalSize = Math.max(0, ...Object.keys(fleet).filter(sz => completedCounts[sz] < fleet[sz]).map(Number));
                if (globalMaxLegalSize > 0) {
                    let maxAdd = globalMaxLegalSize - open.len;
                    for (let e of emptyCorridors) {
                        if (maxAdd >= 0 && e.dist > maxAdd) {
                            for (let dist = maxAdd + 1; dist <= e.dist; dist++) {
                                let nr = e.startR + (dist - 1) * e.dr;
                                let nc = e.startC + (dist - 1) * e.dc;
                                if (grid[nr][nc] === 0) {
                                    set(nr, nc, 2);
                                    equilibriumReached = false;
                                }
                            }
                        }
                    }
                }
            }
            if (!equilibriumReached) continue; // Priority Restart: Basic-Fill must run after any find by Rule 7

            // Rule 8: Max-Ship Global Compartment Scan
            let maxMissingSize = 0;
            for (let s in fleet) {
                let sizeNum = Number(s);
                if (completedCounts[sizeNum] < fleet[sizeNum] && sizeNum > maxMissingSize) {
                    maxMissingSize = sizeNum;
                }
            }

            for (let s = maxMissingSize; s >= 1; s--) {
                if (completedCounts[s] >= fleet[s]) continue;

                function getCandidates(sz) {
                    let placements = [];
                    // Recalculate remaining clues for absolute ground truth
                    let remRowGT = new Array(size).fill(0);
                    let remColGT = new Array(size).fill(0);
                    for (let i = 0; i < size; i++) {
                        let rCount = 0;
                        for (let j = 0; j < size; j++) if (isShip(grid[i][j])) rCount++;
                        remRowGT[i] = rowClues[i] - rCount;

                        let cCount = 0;
                        for (let j = 0; j < size; j++) if (isShip(grid[j][i])) cCount++;
                        remColGT[i] = colClues[i] - cCount;
                    }

                    // Horizontals
                    for (let r = 0; r < size; r++) {
                        if (sz > rowClues[r]) continue;
                        for (let c = 0; c <= size - sz; c++) {
                            let isValid = true, newCellsNeeded = 0;
                            for (let i = 0; i < sz; i++) {
                                let v = grid[r][c + i];
                                if (v === 2) { isValid = false; break; }
                                else if (v === 0) newCellsNeeded++;
                                else if (isShip(v)) {
                                    if (v === 1 || v === 7) { if (v === 7 && (i === 0 || i === sz - 1)) isValid = false; }
                                    else if (v === 5 && i !== 0) isValid = false;
                                    else if (v === 6 && i !== sz - 1) isValid = false;
                                    else if (v === 3 || v === 4 || v === 8) isValid = false;
                                }
                            }
                            if (!isValid || newCellsNeeded > remRowGT[r]) continue;
                            for (let i = 0; i < sz; i++) if (grid[r][c + i] === 0 && remColGT[c + i] === 0) { isValid = false; break; }
                            if (isValid) {
                                for (let i = 0; i < sz; i++) {
                                    let currC = c + i;
                                    for (let dr = -1; dr <= 1; dr++) {
                                        for (let dc = -1; dc <= 1; dc++) {
                                            if (dr === 0 && dc === 0) continue;
                                            let nr = r + dr, nc = currC + dc;
                                            if (nr >= 0 && nr < size && nc >= 0 && nc < size) {
                                                if (nr === r && nc >= c && nc < c + sz) continue;
                                                if (isShip(grid[nr][nc])) { isValid = false; break; }
                                            }
                                        }
                                        if (!isValid) break;
                                    }
                                    if (!isValid) break;
                                }
                            }
                            if (isValid) placements.push({ dir: 'H', r, c, s: sz });
                        }
                    }

                    // Verticals (only necessary for multi-segment ships)
                    if (sz > 1) {
                        for (let c = 0; c < size; c++) {
                            if (sz > colClues[c]) continue;
                            for (let r = 0; r <= size - sz; r++) {
                                let isValid = true, newCellsNeeded = 0;
                                for (let i = 0; i < sz; i++) {
                                    let v = grid[r + i][c];
                                    if (v === 2) { isValid = false; break; }
                                    else if (v === 0) newCellsNeeded++;
                                    else if (isShip(v)) {
                                        if (v === 1 || v === 7) { if (v === 7 && (i === 0 || i === sz - 1)) isValid = false; }
                                        else if (v === 3 && i !== 0) isValid = false;
                                        else if (v === 4 && i !== sz - 1) isValid = false;
                                        else if (v === 5 || v === 6 || v === 8) isValid = false;
                                    }
                                }
                                if (!isValid || newCellsNeeded > remColGT[c]) continue;
                                for (let i = 0; i < sz; i++) if (grid[r + i][c] === 0 && remRowGT[r + i] === 0) { isValid = false; break; }
                                if (isValid) {
                                    for (let i = 0; i < sz; i++) {
                                        let currR = r + i;
                                        for (let dr = -1; dr <= 1; dr++) {
                                            for (let dc = -1; dc <= 1; dc++) {
                                                if (dr === 0 && dc === 0) continue;
                                                let nr = currR + dr, nc = c + dc;
                                                if (nr >= 0 && nr < size && nc >= 0 && nc < size) {
                                                    if (nc === c && nr >= r && nr < r + sz) continue;
                                                    if (isShip(grid[nr][nc])) { isValid = false; break; }
                                                }
                                            }
                                            if (!isValid) break;
                                        }
                                        if (!isValid) break;
                                    }
                                }
                                if (isValid) placements.push({ dir: 'V', r, c, s: sz });
                            }
                        }
                    }
                    return placements;
                }

                console.log(`[Rule 8] Scanning board for ${s}-segment ship candidates...`);
                let validPlacements = getCandidates(s);
                
                let corridorSet = new Set();
                for (let p of validPlacements) {
                    // --- SILENCED: console.log(`[Rule 8] Found Valid ${p.dir}-placement: ${p.dir === 'H' ? 'R'+p.r+'C'+p.c+'-'+(p.c+s-1) : 'C'+p.c+'R'+p.r+'-'+(p.r+s-1)}`);
                    corridorSet.add(`${p.dir}-${p.dir === 'H' ? p.r : p.c}`);
                }

                if (validPlacements.length > 0) {
                    console.log(`[Rule 8] TOTAL VALID SITES for Size ${s}: ${corridorSet.size}`);
                    console.log(`[Rule 8] TOTAL VALID PLACEMENTS for Size ${s}: ${validPlacements.length}`);
                }
                
                function areConflicting(p1, p2) {
                    for (let i = 0; i < p1.s; i++) {
                        let r1 = p1.dir === 'H' ? p1.r : p1.r + i;
                        let c1 = p1.dir === 'H' ? p1.c + i : p1.c;
                        for (let j = 0; j < p2.s; j++) {
                            let r2 = p2.dir === 'H' ? p2.r : p2.r + j;
                            let c2 = p2.dir === 'H' ? p2.c + j : p2.c;
                            if (Math.abs(r1 - r2) <= 1 && Math.abs(c1 - c2) <= 1) return true;
                        }
                    }
                    return false;
                }

                // Rule 9: Compartment Overlap & Exact Match Global Sweep
                if (validPlacements.length > 0) {
                    let req_s = fleet[s] - (completedCounts[s] || 0);
                    let sameCorridor = true;

                    if (validPlacements.length > 0 && validPlacements.length === req_s) {
                        // VERIFY CONFLICT-FREE
                        let anyConflict = false;
                        for (let i = 0; i < validPlacements.length; i++) {
                            for (let j = i + 1; j < validPlacements.length; j++) {
                                if (areConflicting(validPlacements[i], validPlacements[j])) {
                                    anyConflict = true;
                                    break;
                                }
                            }
                            if (anyConflict) break;
                        }

                        if (!anyConflict) {
                            console.log(`[Rule 9] Confirmed Exact Fit: ${req_s} non-conflicting candidates for ${req_s} missing Size ${s} ships.`);
                            for (let p of validPlacements) {
                                for (let i = 0; i < p.s; i++) {
                                    let r = p.dir === 'H' ? p.r : p.r + i;
                                    let c = p.dir === 'H' ? p.c + i : p.c;
                                    if (grid[r][c] === 0) {
                                        set(r, c, 1);
                                        equilibriumReached = false;
                                    }
                                }
                                // Fill exact caps using the upgrade mechanism
                                if (s === 1) {
                                    set(p.r, p.c, 8);
                                } else {
                                    if (p.dir === 'H') {
                                        set(p.r, p.c, 5);
                                        set(p.r, p.c + s - 1, 6);
                                    } else {
                                        set(p.r, p.c, 3);
                                        set(p.r + s - 1, p.c, 4);
                                    }
                                }
                            }
                        } else {
                            console.warn(`[Rule 9] Warning: ${req_s} candidates for Size ${s} conflict with each other. Logic Abort.`);
                        }
                    } else if (validPlacements.length > req_s) {
                        let first = validPlacements[0];

                        // 1. Audit: Ensure ALL sites are in the exact same Row or Column
                        for (let p of validPlacements) {
                            if (p.dir !== first.dir) { sameCorridor = false; break; }
                            if (p.dir === 'H' && p.r !== first.r) { sameCorridor = false; break; }
                            if (p.dir === 'V' && p.c !== first.c) { sameCorridor = false; break; }
                        }

                        if (sameCorridor) {
                            // 2. Perform Pigeonhole Overlap Intersection
                            let minOffset = Math.min(...validPlacements.map(p => p.dir === 'H' ? p.c : p.r));
                            let maxOffset = Math.max(...validPlacements.map(p => p.dir === 'H' ? p.c : p.r));
                            let overlapStart = maxOffset, overlapEnd = minOffset + s - 1;

                            if (overlapStart <= overlapEnd) {
                                if (validPlacements.length > 1) {
                                    console.log(`[Rule 9] Pigeonhole: ${validPlacements.length} sites in ${first.dir === 'H' ? 'Row ' + first.r : 'Col ' + first.c}. Guaranteed overlap: ${overlapStart}-${overlapEnd}`);
                                }
                                for (let i = overlapStart; i <= overlapEnd; i++) {
                                    let r = first.dir === 'H' ? first.r : i;
                                    let c = first.dir === 'H' ? i : first.c;
                                    if (grid[r][c] === 0) {
                                        set(r, c, 1);
                                        equilibriumReached = false;
                                    }
                                }

                                // 3. ONLY fill caps if the placement is mathematically unique
                                if (validPlacements.length === 1) {
                                    console.log(`[Rule 9] Unique placement confirmed at ${first.dir} R${first.r}C${first.c}. Filling Caps.`);
                                    if (first.dir === 'H') {
                                        if (grid[first.r][first.c] === 0) set(first.r, first.c, 5);
                                        if (grid[first.r][first.c + s - 1] === 0) set(first.r, first.c + s - 1, 6);
                                    } else {
                                        if (grid[first.r][first.c] === 0) set(first.r, first.c, 3);
                                        if (grid[first.r + s - 1][first.c] === 0) set(first.r + s - 1, first.c, 4);
                                    }
                                }
                            }
                        }
                    }

                    if (!equilibriumReached) {
                        console.log(`[Rule 9] Discovery made for Size ${s}. Restarting for Basic-Fill sync.`);
                        break; // Break the 's' loop to restart global equilibrium
                    } else {
                        if (!sameCorridor) {
                            console.log(`[Rule 9] ${validPlacements.length} candidates for Size ${s} across DIFFERENT corridors. Ambiguous.`);
                        }
                        
                        // NEW RULE 11: Multi-Size Pigeonhole Look-Ahead (recursive-style scan)
                        if (s === maxMissingSize) {
                            for (let sm = s - 1; sm >= 1; sm--) {
                                let solved_sm = completedCounts[sm] || 0;
                                let req_sm = fleet[sm] || 0;
                                
                                if (solved_sm >= req_sm) continue;

                                console.log(`[Rule 11] Look-ahead evaluating Size ${sm} slots...`);
                                let avail_sm = getCandidates(sm);
                                let rem_sm = req_sm - solved_sm;
                                
                                if (avail_sm.length > 0 && avail_sm.length === rem_sm) {
                                    // VERIFY CONFLICT-FREE
                                    let anyConflict = false;
                                    for (let i = 0; i < avail_sm.length; i++) {
                                        for (let j = i + 1; j < avail_sm.length; j++) {
                                            if (areConflicting(avail_sm[i], avail_sm[j])) {
                                                anyConflict = true;
                                                break;
                                            }
                                        }
                                        if (anyConflict) break;
                                    }

                                    if (!anyConflict) {
                                        console.log(`[Rule 11] Confirmed Exact Fit for Size ${sm}: ${avail_sm.length} non-conflicting slots for ${rem_sm} missing ships. Populating!`);
                                        for (let p of avail_sm) {
                                            for (let i = 0; i < p.s; i++) {
                                                let r = p.dir === 'H' ? p.r : p.r + i;
                                                let c = p.dir === 'H' ? p.c + i : p.c;
                                                if (grid[r][c] === 0) {
                                                    set(r, c, 1);
                                                    equilibriumReached = false;
                                                }
                                            }
                                            // Fill exact caps using the new set() upgrade
                                            if (sm === 1) {
                                                set(p.r, p.c, 8);
                                            } else {
                                                if (p.dir === 'H') {
                                                    set(p.r, p.c, 5);
                                                    set(p.r, p.c + p.s - 1, 6);
                                                } else {
                                                    set(p.r, p.c, 3);
                                                    set(p.r + p.s - 1, p.c, 4);
                                                }
                                            }
                                        }
                                    } else {
                                        console.warn(`[Rule 11] Conflict detected for Size ${sm} look-ahead. Skipping population.`);
                                    }
                                    if (!equilibriumReached) break; 
                                }
                            }
                            if (!equilibriumReached) break;
                        }
                        
                        console.log(`[Rule 8/9/11] Yielding Size ${s}. Trying next size down.`);
                        continue;
                    }
                }
            } // END downward size loop

            // CLEANUP PASS: If Advanced rules made ANY change, we MUST re-queue every modified Row/Col!
            // Actually, the loop at the top already checks equilibriumReached.
            // But we can force-queue all rows/cols for a final pass to be safe if a change was made.
            if (!equilibriumReached) {
                // console.log(`[LOOP] Advanced Rules made a change. Restarting for Basic-Fill Sync.`);
                for (let i = 0; i < size; i++) {
                    queueRows.add(i);
                    queueCols.add(i);
                }
            }

        } // End of Equilibrium loop

        return { grid, passes: stats.passes, probes: 0, dfs: 0 };
    }

    // ========================
    //  SOLUTION INJECTION
    // ========================

    function injectSolution(G, solutionGrid, size) {
        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                let isGiven = G.locked && G.locked[r] && G.locked[r][c] !== undefined && G.locked[r][c] !== -1;
                if (!isGiven && solutionGrid[r][c] !== 0) {
                    G.setCellState({ row: r, col: c }, (solutionGrid[r][c] === 2) ? 2 : 1);
                }
            }
        }
        if (typeof G.draw === 'function') G.draw();
        if (typeof G.storeCurrentState === 'function') G.storeCurrentState();
        setTimeout(() => {
            if (typeof G.checkFinished === 'function') G.checkFinished();
            else if (typeof G.check === 'function') G.check();
        }, 100);
    }

    // --- GLOBAL EXPORT FOR LOCAL DASHBOARD ---
    window.BimaruEngine = { solveLogic, isShip };

})();
