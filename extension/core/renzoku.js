
(function() {
    'use strict';
    
    console.log("%c[Renzoku-Phoenix] Script Waking Up...", "color: #ff00ff; font-weight: bold; border: 1px solid #ff00ff; padding: 2px;");

    let originalGame;
    let solverTriggered = false;

    // --- TRIGGER 1: THE MEMORY TRAP ---
    Object.defineProperty(window, 'Game', {
        get() { return originalGame; },
        set(newValue) {
            originalGame = newValue;
            if (newValue && !(newValue instanceof HTMLElement)) {
                checkAndLaunch(newValue);
            }
        },
        configurable: true,
        enumerable: true
    });

    // --- TRIGGER 2: THE COLD START ---
    if (window.Game && !(window.Game instanceof HTMLElement)) {
        originalGame = window.Game;
        checkAndLaunch(originalGame);
    }

    // --- TRIGGER 3: THE FALLBACK POLLER ---
    const globalPoller = setInterval(() => {
        if (solverTriggered) {
            clearInterval(globalPoller);
            return;
        }
        const target = window.Game;
        if (target && !(target instanceof HTMLElement)) {
            checkAndLaunch(target);
        }
    }, 100);

    function checkAndLaunch(G) {
        if (solverTriggered) {
            return;
        }
        // Daily page might set Game but wait a moment for 'task' to populate
        if (G.task && G.task.length > 0) {
            solverTriggered = true;
            console.log("%c[Renzoku-Phoenix] Valid Target Found. Launching Deduction Engine...", "color: #00ff00; font-weight: bold;");
            launchAdvancedSolver(G);
        }
    }

    function launchAdvancedSolver(gameObj) {
        let SIZE, task, conditions;

        // --- UNIVERSAL PARSER ---
        if (typeof gameObj.task === 'string') {
            console.log("[Renzoku-Phoenix] Parsing String-format Daily board...");
            // Format: "0,0R,6DL,2..."
            const rawCells = gameObj.task.split(',').filter(c => c !== "");
            SIZE = Math.sqrt(rawCells.length);
            task = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
            conditions = Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => ({ u: false, d: false, l: false, r: false })));
            
            rawCells.forEach((cellStr, idx) => {
                const r = Math.floor(idx / SIZE);
                const c = idx % SIZE;
                const val = parseInt(cellStr);
                task[r][c] = isNaN(val) ? 0 : val;
                
                if (cellStr.includes('U')) { conditions[r][c].u = true; if (r > 0) { conditions[r-1][c].d = true; } }
                if (cellStr.includes('D')) { conditions[r][c].d = true; if (r < SIZE - 1) { conditions[r+1][c].u = true; } }
                if (cellStr.includes('L')) { conditions[r][c].l = true; if (c > 0) { conditions[r][c-1].r = true; } }
                if (cellStr.includes('R')) { conditions[r][c].r = true; if (c < SIZE - 1) { conditions[r][c+1].l = true; } }
            });
        } else {
            console.log("[Renzoku-Phoenix] Operating on Legacy Array-format board...");
            SIZE = gameObj.task.length;
            task = gameObj.task;
            conditions = gameObj.conditions;
        }

        function drawFinalState(r, c, domain) {
            const cellStatus = gameObj.currentState.cellStatus[r][c];
            if (domain.length === 1) {
                if (task[r][c] === 0) {
                    cellStatus.number = domain[0];
                    cellStatus.pencil = false;
                    cellStatus.pencilNumbers = [];
                    gameObj.drawCellStatus({row: r, col: c}, cellStatus);
                }
            } else {
                cellStatus.number = 0;
                cellStatus.pencil = true;
                cellStatus.pencilNumbers = [...domain];
                gameObj.drawCellStatus({row: r, col: c}, cellStatus);
            }
        }

        function runSolveProcess() {
            let domains = Array.from({ length: SIZE }, (_, r) => 
                Array.from({ length: SIZE }, (_, c) => 
                    task[r][c] !== 0 ? [task[r][c]] : Array.from({ length: SIZE }, (_, i) => i + 1)
                )
            );

            function getCombinations(arr, k) {
                const results = [];
                function helper(start, combo) {
                    if (combo.length === k) { results.push(combo); return; }
                    if (arr.length - start < k - combo.length) { return; }
                    for (let i = start; i < arr.length; i++) {
                        helper(i + 1, [...combo, arr[i]]);
                    }
                }
                helper(0, []);
                return results;
            }

            function applyNakedSubsets(cells, doms) {
                let changed = false;
                const unsolved = cells.filter(cell => doms[cell.r][cell.c].length > 1);
                const maxK = Math.min(unsolved.length - 1, 4); 
                for (let k = 2; k <= maxK; k++) {
                    const validCells = unsolved.filter(cell => doms[cell.r][cell.c].length <= k);
                    if (validCells.length < k) { continue; }
                    const combos = getCombinations(validCells, k);
                    for (const combo of combos) {
                        const unionSet = new Set();
                        for (const c of combo) {
                            for (const v of doms[c.r][c.c]) {
                                unionSet.add(v);
                            }
                        }
                        if (unionSet.size === k) {
                            const values = Array.from(unionSet);
                            for (const otherCell of unsolved) {
                                if (!combo.some(g => g.r === otherCell.r && g.c === otherCell.c)) {
                                    const originalLen = doms[otherCell.r][otherCell.c].length;
                                    doms[otherCell.r][otherCell.c] = doms[otherCell.r][otherCell.c].filter(v => !values.includes(v));
                                    if (doms[otherCell.r][otherCell.c].length !== originalLen) {
                                        changed = true;
                                    }
                                }
                            }
                        }
                    }
                }
                return changed;
            }

            function applyHiddenSingles(cells, doms) {
                let changed = false;
                for (let v = 1; v <= SIZE; v++) {
                    const possibleCells = cells.filter(cell => doms[cell.r][cell.c].includes(v));
                    if (possibleCells.length === 1) {
                        const target = possibleCells[0];
                        if (doms[target.r][target.c].length > 1) {
                            doms[target.r][target.c] = [v];
                            changed = true;
                        }
                    }
                }
                return changed;
            }

            function applyXYWings(doms) {
                let changed = false;
                const bivalueCells = [];
                for (let r = 0; r < SIZE; r++) {
                    for (let c = 0; c < SIZE; c++) {
                        if (doms[r][c].length === 2) {
                            bivalueCells.push({ r: r, c: c, d: doms[r][c] });
                        }
                    }
                }
                for (let i = 0; i < bivalueCells.length; i++) {
                    const pivot = bivalueCells[i];
                    const X = pivot.d[0];
                    const Y = pivot.d[1];
                    const pincers = bivalueCells.filter(p => p !== pivot && (p.r === pivot.r || p.c === pivot.c));
                    for (let j = 0; j < pincers.length; j++) {
                        for (let k = j + 1; k < pincers.length; k++) {
                            const p1 = pincers[j];
                            const p2 = pincers[k];
                            const Z = p1.d.find(v => v !== X && v !== Y);
                            if (Z !== undefined && p1.d.includes(X) && p2.d.includes(Y) && p2.d.includes(Z)) {
                                for (let r = 0; r < SIZE; r++) {
                                    for (let c = 0; c < SIZE; c++) {
                                        if ((r === p1.r || c === p1.c) && (r === p2.r || c === p2.c)) {
                                            if (doms[r][c].includes(Z) && doms[r][c].length > 1) {
                                                if (!(r === p1.r && c === p1.c) && !(r === p2.r && c === p2.c) && !(r === pivot.r && c === pivot.c)) {
                                                    doms[r][c] = doms[r][c].filter(v => v !== Z);
                                                    changed = true;
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                return changed;
            }

            function propagate(doms) {
                let boardChanged = true;
                let iterations = 0;
                while (boardChanged && iterations < 100) {
                    boardChanged = false; iterations++;
                    for (let r = 0; r < SIZE; r++) {
                        for (let c = 0; c < SIZE; c++) {
                            if (doms[r][c].length === 0) { return false; }
                            if (doms[r][c].length === 1) {
                                const val = doms[r][c][0];
                                for (let i = 0; i < SIZE; i++) {
                                    if (i !== c && doms[r][i].includes(val)) {
                                        doms[r][i] = doms[r][i].filter(v => v !== val);
                                        boardChanged = true;
                                    }
                                    if (i !== r && doms[i][c].includes(val)) {
                                        doms[i][c] = doms[i][c].filter(v => v !== val);
                                        boardChanged = true;
                                    }
                                }
                            }
                            const cond = conditions[r][c];
                            const neighbors = [{k:'u',nr:r-1,nc:c,opp:'d'}, {k:'d',nr:r+1,nc:c,opp:'u'}, {k:'l',nr:r,nc:c-1,opp:'r'}, {k:'r',nr:r,nc:c+1,opp:'l'}];
                            for (const n of neighbors) {
                                if (n.nr < 0 || n.nr >= SIZE || n.nc < 0 || n.nc >= SIZE) { continue; }
                                const hasDot = cond[n.k] || (conditions[n.nr][n.nc] && conditions[n.nr][n.nc][n.opp]);
                                if (hasDot) {
                                    const prev = doms[r][c].length;
                                    doms[r][c] = doms[r][c].filter(v => doms[n.nr][n.nc].some(nv => Math.abs(v - nv) === 1));
                                    if (doms[r][c].length !== prev) {
                                        boardChanged = true;
                                    }
                                } else if (doms[n.nr][n.nc].length === 1) {
                                    const nv = doms[n.nr][n.nc][0];
                                    const prev = doms[r][c].length;
                                    doms[r][c] = doms[r][c].filter(v => Math.abs(v - nv) !== 1);
                                    if (doms[r][c].length !== prev) {
                                        boardChanged = true;
                                    }
                                }
                            }
                        }
                    }
                    for (let i = 0; i < SIZE; i++) {
                        const rowCells = Array.from({length: SIZE}, (_, c) => ({ r: i, c: c }));
                        if (applyNakedSubsets(rowCells, doms)) { boardChanged = true; }
                        if (applyHiddenSingles(rowCells, doms)) { boardChanged = true; }
                        const colCells = Array.from({length: SIZE}, (_, r) => ({ r: r, c: i }));
                        if (applyNakedSubsets(colCells, doms)) { boardChanged = true; }
                        if (applyHiddenSingles(colCells, doms)) { boardChanged = true; }
                    }
                    if (applyXYWings(doms)) { boardChanged = true; }
                }
                return true;
            }

            let solved = false;
            while (!solved) {
                if (!propagate(domains)) { break; }
                if (domains.every(row => row.every(d => d.length === 1))) {
                    solved = true;
                    break;
                }
                let progressed = false;
                for (let d = 2; d <= 4; d++) {
                    for (let r = 0; r < SIZE; r++) {
                        for (let c = 0; c < SIZE; c++) {
                            if (domains[r][c].length === d) {
                                const cands = [...domains[r][c]];
                                for (const cand of cands) {
                                    const testDoms = domains.map(row => row.map(cell => [...cell]));
                                    testDoms[r][c] = [cand];
                                    if (!propagate(testDoms)) {
                                        domains[r][c] = domains[r][c].filter(v => v !== cand);
                                        progressed = true;
                                    }
                                }
                                if (progressed) { break; }
                            }
                        }
                        if (progressed) { break; }
                    }
                    if (progressed) { break; }
                }
                if (!progressed) { break; }
            }

            let submitLoop = setInterval(() => {
                try {
                    for (let r = 0; r < SIZE; r++) {
                        for (let c = 0; c < SIZE; c++) {
                            if (task[r][c] === 0) {
                                drawFinalState(r, c, domains[r][c]);
                            }
                        }
                    }
                    if (typeof gameObj.storeCurrentState === 'function') {
                        gameObj.storeCurrentState();
                    }
                    if (typeof gameObj.checkFinished === 'function') {
                        gameObj.checkFinished();
                    }
                    clearInterval(submitLoop);
                } catch (e) {}
            }, 1);
        }
        runSolveProcess();
    }
})();
