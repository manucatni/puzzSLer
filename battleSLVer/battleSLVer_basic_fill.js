// ==UserScript==
// @name         Bimaru Basic-fill (Fleet-Backtracking Engine)
// @namespace    http://tampermonkey.net/
// @version      9.0
// @description  Battleships (Bimaru) Solver. pristine Fleet-Backtracking Architecture.
// @author       You
// @match        *://www.puzzle-battleships.com/*
// @grant        none
// @run-at       document-start
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
                console.log(`%c[Bimaru] ⏱ Task detected in ${detectTime.toFixed(2)}ms`, 'color: #888;');
                console.log(`%c[Bimaru] 📋 Task: ${window.task}`, 'color: #aaa;');

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
            const fb = maxShipSize === 5 ? {5:1,4:2,3:3,2:4,1:5} :
                       (maxShipSize === 4 ? {4:1,3:2,2:3,1:4} : {3:1,2:2,1:3});
            Object.assign(fleet, fb);
        }

        const fleetStr = Object.entries(fleet).map(([s,c]) => `${c}×${s}`).reverse().join(', ');
        console.log(`%c[Bimaru] 🚢 Fleet: ${fleetStr} | Grid: ${N}×${N}`, 'color: #4fc3f7;');

        const t0 = performance.now();
        const result = solveLogic(taskString, fleet, N, G);
        const elapsed = (performance.now() - t0) * 1000; // microseconds

        if (result && result.grid) {
            console.log(`%c[Bimaru] ✅ Solved in ${elapsed < 1000 ? elapsed.toFixed(1) + 'μs' : (elapsed/1000).toFixed(2) + 'ms'}`, 'color: #66bb6a; font-weight: bold;');
            injectSolution(G, result.grid, N);
        } else {
            console.error('[Bimaru] ❌ Core logic solver failed or returned null.');
        }
    }

    function isShip(v) { return v === 1 || v === 3 || v === 4 || v === 5 || v === 6 || v === 7 || v === 8; }

    function solveLogic(taskStr, fleet, size, G) {
        let parts = taskStr.split(';');
        let clues = parts[0].split(',').map(Number);
        let colClues = clues.slice(0, size);
        let rowClues = clues.slice(size);

        let grid = Array.from({length: size}, () => new Array(size).fill(0));
        let rowShips = new Array(size).fill(0), colShips = new Array(size).fill(0);
        
        // Secondary List of Clues (clues - segments filled)
        let remRowClues = [...rowClues];
        let remColClues = [...colClues];
        
        let maxShipSize = Math.max(...Object.keys(fleet).map(Number));

        let anyChanged = true;
        let stats = { passes: 0 };

        function set(r, c, val) {
            if (grid[r][c] === 0) {
                grid[r][c] = val;
                anyChanged = true;
                if (isShip(val)) { 
                    rowShips[r]++; 
                    colShips[c]++; 
                    remRowClues[r]--;
                    remColClues[c]--;
                }
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

                        if (parsed !== 0 && parsed !== 2) set(r, c, parsed);
                        else if (parsed === 2) grid[r][c] = 2;
                    }
                }
            }
        }

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

        // ========================
        //  STEP-BY-STEP ISOLATED LOGIC
        // ========================
        
        console.log("[Bimaru] 🧠 Running ISOLATED Test: Iterative Logic Loop...");
        
        while (anyChanged) {
            anyChanged = false;
            stats.passes++;
            
            for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
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

                // Rule 3: Look for completed single segment ships (Submarines), add water to remaining neighbors
                if (v === 8) {
                    console.log(`[Bimaru] 🕵️ Rule 3 TRIGGERED for Submarine at (${r}, ${c})!`);
                    if (r > 0 && grid[r-1][c] === 0) { set(r-1, c, 2); console.log(`   -> Added Water UP at (${r-1}, ${c})`); }
                    if (r < size - 1 && grid[r+1][c] === 0) { set(r+1, c, 2); console.log(`   -> Added Water DOWN at (${r+1}, ${c})`); }
                    if (c > 0 && grid[r][c-1] === 0) { set(r, c-1, 2); console.log(`   -> Added Water LEFT at (${r}, ${c-1})`); }
                    if (c < size - 1 && grid[r][c+1] === 0) { set(r, c+1, 2); console.log(`   -> Added Water RIGHT at (${r}, ${c+1})`); }
                }

                // Rule 4: Cap Constraints (Dead-end water + Structural extension)
                if (v === 3) { // Top Cap
                    if (r > 0 && grid[r-1][c] === 0) set(r-1, c, 2); // Water Up
                    if (c > 0 && grid[r][c-1] === 0) set(r, c-1, 2); // Water Left
                    if (c < size - 1 && grid[r][c+1] === 0) set(r, c+1, 2); // Water Right
                    if (r < size - 1 && grid[r+1][c] === 0) set(r+1, c, 1); // Extend Ship Down
                }
                if (v === 4) { // Bottom Cap
                    if (r < size - 1 && grid[r+1][c] === 0) set(r+1, c, 2); // Water Down
                    if (c > 0 && grid[r][c-1] === 0) set(r, c-1, 2); // Water Left
                    if (c < size - 1 && grid[r][c+1] === 0) set(r, c+1, 2); // Water Right
                    if (r > 0 && grid[r-1][c] === 0) set(r-1, c, 1); // Extend Ship Up
                }
                if (v === 5) { // Left Cap
                    if (c > 0 && grid[r][c-1] === 0) set(r, c-1, 2); // Water Left
                    if (r > 0 && grid[r-1][c] === 0) set(r-1, c, 2); // Water Up
                    if (r < size - 1 && grid[r+1][c] === 0) set(r+1, c, 2); // Water Down
                    if (c < size - 1 && grid[r][c+1] === 0) set(r, c+1, 1); // Extend Ship Right
                }
                if (v === 6) { // Right Cap
                    if (c < size - 1 && grid[r][c+1] === 0) set(r, c+1, 2); // Water Right
                    if (r > 0 && grid[r-1][c] === 0) set(r-1, c, 2); // Water Up
                    if (r < size - 1 && grid[r+1][c] === 0) set(r+1, c, 2); // Water Down
                    if (c > 0 && grid[r][c-1] === 0) set(r, c-1, 1); // Extend Ship Left
                }

                // Rule 5: Middle Segment Alignment
                if (v === 7) {
                    let blockedH = (c === 0 || c === size - 1 || grid[r][c-1] === 2 || grid[r][c+1] === 2);
                    let blockedV = (r === 0 || r === size - 1 || grid[r-1][c] === 2 || grid[r+1][c] === 2);
                    
                    if (blockedH && !blockedV) {
                        if (r > 0 && grid[r-1][c] === 0) set(r-1, c, 1);
                        if (r < size - 1 && grid[r+1][c] === 0) set(r+1, c, 1);
                    }
                    if (blockedV && !blockedH) {
                        if (c > 0 && grid[r][c-1] === 0) set(r, c-1, 1);
                        if (c < size - 1 && grid[r][c+1] === 0) set(r, c+1, 1);
                    }
                }
            } // Close c loop
        } // Close r loop

        // Rule 2: In secondary clues, find 0's and fill those rows/cols with water
        for (let i = 0; i < size; i++) {
            if (remRowClues[i] === 0) {
                for (let c = 0; c < size; c++) {
                    if (grid[i][c] === 0) set(i, c, 2);
                }
            }
            if (remColClues[i] === 0) {
                for (let r = 0; r < size; r++) {
                    if (grid[r][i] === 0) set(r, i, 2);
                }
            }
        }

        // Rule 6: Clue Saturation (remaining clues === remaining empty cells)
        for (let r = 0; r < size; r++) {
            let emptyCountR = 0;
            for (let c = 0; c < size; c++) if (grid[r][c] === 0) emptyCountR++;
            if (emptyCountR > 0 && remRowClues[r] === emptyCountR) {
                for (let c = 0; c < size; c++) if (grid[r][c] === 0) set(r, c, 1);
            }
        }
        for (let c = 0; c < size; c++) {
            let emptyCountC = 0;
            for (let r = 0; r < size; r++) if (grid[r][c] === 0) emptyCountC++;
            if (emptyCountC > 0 && remColClues[c] === emptyCountC) {
                for (let r = 0; r < size; r++) if (grid[r][c] === 0) set(r, c, 1);
            }
        }
        
        } // End of while(anyChanged) loop

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
                    G.setCellState({row: r, col: c}, (solutionGrid[r][c] === 2) ? 2 : 1);
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

})();
