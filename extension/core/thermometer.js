
(function() {
    'use strict';

    let originalGame;
    let solverTriggered = false;

    // --- TRIGGER 1: THE MEMORY TRAP ---
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

    // --- TRIGGER 2: THE COLD START ---
    if (window.Game && !(window.Game instanceof HTMLElement)) {
        originalGame = window.Game;
        waitForData(originalGame);
    }

    // --- TRIGGER 3: THE FALLBACK POLLER ---
    const poller = setInterval(() => {
        if (solverTriggered) {
             clearInterval(poller);
             return;
        }
        const target = window.Game;
        if (target && !(target instanceof HTMLElement)) {
            waitForData(target);
        }
    }, 10); 

    function waitForData(G) {
        // High-frequency poll for AJAX clues (1ms)
        const dataPoller = setInterval(() => {
            if (solverTriggered) {
                clearInterval(dataPoller);
                return;
            }
            if (window.task && G.areaPoints) {
                solverTriggered = true;
                clearInterval(dataPoller);
                console.time("HyperDrive-Init");
                console.log("%c[Thermo-Peak] Data Found. Solving...", "color: #00ff00; font-weight: bold;");
                launchLeanLogic(G);
            }
        }, 1); 
    }

    // --- THE 390ms LEAN ENGINE (V3.2 RESTORED) ---
    function launchLeanLogic(G) {
        try {
            if (!window.task) return;
            const taskParts = window.task.split(';')[0].split('_').map(Number);
            const COLS = G.puzzleWidth;
            const ROWS = G.puzzleHeight;
            const colClues = taskParts.slice(0, COLS);
            const rowClues = taskParts.slice(COLS, COLS + ROWS);

            const thermometers = G.areaPoints.map(path => path.map(p => ({r: p.row, c: p.col})));
            const numTs = thermometers.length;

            const SI = thermometers.map(T => {
                const lvls = [{rs: new Array(ROWS).fill(0), cs: new Array(COLS).fill(0)}];
                for (let L = 1; L <= T.length; L++) {
                    const prev = lvls[L-1];
                    const rs = [...prev.rs], cs = [...prev.cs];
                    rs[T[L-1].r]++; cs[T[L-1].c]++;
                    lvls.push({rs, cs});
                }
                return lvls;
            });

            function propagate(ranges) {
                let changed = true;
                let iter = 0;
                while (changed && iter++ < 100) {
                    changed = false;
                    let minR = new Array(ROWS).fill(0), maxR = new Array(ROWS).fill(0);
                    let minC = new Array(COLS).fill(0), maxC = new Array(COLS).fill(0);
                    ranges.forEach((rng, i) => {
                        const iM = SI[i][rng.min], iX = SI[i][rng.max];
                        for (let r = 0; r < ROWS; r++) { minR[r] += iM.rs[r]; maxR[r] += iX.rs[r]; }
                        for (let c = 0; c < COLS; c++) { minC[c] += iM.cs[c]; maxC[c] += iX.cs[c]; }
                    });
                    for (let r = 0; r < ROWS; r++) if (minR[r] > rowClues[r] || maxR[r] < rowClues[r]) return false;
                    for (let c = 0; c < COLS; c++) if (minC[c] > colClues[c] || maxC[c] < colClues[c]) return false;
                    for (let i = 0; i < numTs; i++) {
                        const imp = SI[i];
                        for (let r = 0; r < ROWS; r++) {
                            const oX = maxR[r] - imp[ranges[i].max].rs[r];
                            const minN = Math.max(0, rowClues[r] - oX);
                            while (ranges[i].min < ranges[i].max && imp[ranges[i].min].rs[r] < minN) { ranges[i].min++; changed = true; }
                            const oM = minR[r] - imp[ranges[i].min].rs[r];
                            const maxN = rowClues[r] - oM;
                            while (ranges[i].max > ranges[i].min && imp[ranges[i].max].rs[r] > maxN) { ranges[i].max--; changed = true; }
                        }
                        for (let c = 0; c < COLS; c++) {
                            const oX = maxC[c] - imp[ranges[i].max].cs[c];
                            const minN = Math.max(0, colClues[c] - oX);
                            while (ranges[i].min < ranges[i].max && imp[ranges[i].min].cs[c] < minN) { ranges[i].min++; changed = true; }
                            const oM = minC[c] - imp[ranges[i].min].cs[c];
                            const maxN = colClues[c] - oM;
                            while (ranges[i].max > ranges[i].min && imp[ranges[i].max].cs[c] > maxN) { ranges[i].max--; changed = true; }
                        }
                    }
                }
                return true;
            }

            let ranges = thermometers.map(T => ({min: 0, max: T.length}));
            if (!propagate(ranges)) return;

            let inferring = true;
            while (inferring) {
                inferring = false;
                for (let i = 0; i < numTs; i++) {
                    if (ranges[i].min === ranges[i].max) continue;
                    for (let L = ranges[i].min; L <= ranges[i].max; L++) {
                        const sim = ranges.map(r => ({...r}));
                        sim[i].min = sim[i].max = L;
                        if (!propagate(sim)) {
                            if (L === ranges[i].min) { ranges[i].min++; inferring = true; break; }
                            if (L === ranges[i].max) { ranges[i].max--; inferring = true; break; }
                        }
                    }
                }
            }

            if (ranges.every(r => r.min === r.max)) {
                console.timeEnd("HyperDrive-Init");
                writeBatchToUI(ranges);
            }

            function writeBatchToUI(finalRanges) {
                console.time("HyperDrive-Render");
                const status = G.currentState.cellStatus;
                thermometers.forEach((T, i) => {
                    const L = finalRanges[i].min;
                    T.forEach((p, k) => {
                        status[p.r][p.c] = (k < L) ? 1 : 2; 
                    });
                });
                
                // Final submission trigger - Synchronous/Original
                if (typeof G.checkFinished === 'function') {
                    G.checkFinished();
                } else if (typeof G.check === 'function') {
                    G.check();
                }
                console.timeEnd("HyperDrive-Render");
                console.log("%c[Thermo-Peak] Solution Injected. Check the board!", "color: cyan; font-weight: bold;");
            }
        } catch (e) { console.error("🌡️ SOLVER ERROR:", e); }
    }
})();
