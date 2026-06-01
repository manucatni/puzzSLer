(function () {
    'use strict';

    const taskPoller = setInterval(() => {
        if (window.task && window.Game && window.Game.loaded) {
            clearInterval(taskPoller);
            try {
                executeSolver(window.Game, window.task);
            } catch (e) { console.error("[Bimaru] Runtime Error:", e); }
        }
    }, 100);

    // ========================
    //  SOLVE LOGIC CONTROLLER
    // ========================
    function executeSolver(G, taskStr) {
        const parts = taskStr.split(';');
        const N = parts[0].split(',').length / 2;

        let maxShip = Math.floor(N / 5) + 2;
        if (N === 20) maxShip = 7;
        if (N === 25) maxShip = 8;
        if (N === 30) maxShip = 9;

        const fleet = {};
        for (let sz = maxShip; sz >= 1; sz--) {
            fleet[sz] = maxShip - sz + 1;
        }

        const solver = new BimaruSolver(taskStr, fleet, N, G);
        const start = performance.now();

        solver.autoSolve();

        const elapsed = performance.now() - start;
        for (let r = 0; r < N; r++) {
            for (let c = 0; c < N; c++) {
                let isGiven = G.locked && G.locked[r] && G.locked[r][c] !== undefined && G.locked[r][c] !== -1;
                if (!isGiven && solver.grid[r][c] !== 0) {
                    G.setCellState({ row: r, col: c }, (solver.grid[r][c] === 2) ? 2 : 1);
                }
            }
        }
        if (G.draw) G.draw();
        if (G.storeCurrentState) G.storeCurrentState();
        console.log(`%c[Bimaru] Solved in ${elapsed.toFixed(2)}ms`, 'color: #66bb6a; font-weight: bold;');
        setTimeout(() => { if (G.checkFinished) G.checkFinished(); else if (G.check) G.check(); }, 1);
    }

    // ========================
    //  BIMARU SOLVER CLASS
    // ========================
    class BimaruSolver {
        constructor(taskStr, fleet, size, G = null, counterCb = null) {
            this.taskStr = taskStr;
            this.size = size;
            this.fleet = fleet;
            this.grid = Array.from({ length: size }, () => new Array(size).fill(0));
            this.givens = Array.from({ length: size }, () => new Array(size).fill(false));
            this.counterCb = counterCb || (() => { });
            const clues = taskStr.split(';')[0].split(',').map(Number);
            this.colClues = clues.slice(0, size);
            this.rowClues = clues.slice(size);
            this.remRowClues = [...this.rowClues];
            this.remColClues = [...this.colClues];

            this.initialParsing(taskStr.split(';')[1]);
            if (G && G.locked) this.loadLockedGivens(G);

            this.totalSegments = 0;
            for (let sz in this.fleet) this.totalSegments += (Number(sz) * this.fleet[sz]);
        }

        clone() {
            let copy = new BimaruSolver(this.taskStr, this.fleet, this.size, null, null);
            copy.grid = this.grid.map(r => [...r]);
            copy.givens = this.givens.map(r => [...r]);
            copy.totalSegments = this.totalSegments;
            copy.rowClues = [...this.rowClues];
            copy.colClues = [...this.colClues];
            copy.remRowClues = [...this.remRowClues];
            copy.remColClues = [...this.remColClues];
            copy.counterCb = () => { }; // Always silence clones
            return copy;
        }

        placeShip(r0, c0, sz, isH) {
            let changed = false;
            let s = this.size;
            for (let i = 0; i < sz; i++) {
                let r = isH ? r0 : r0 + i, c = isH ? c0 + i : c0;
                if (this.set(r, c, 1)) changed = true;
            }

            let rStart = Math.max(0, r0 - 1);
            let rEnd = Math.min(s - 1, isH ? r0 + 1 : r0 + sz);
            let cStart = Math.max(0, c0 - 1);
            let cEnd = Math.min(s - 1, isH ? c0 + sz : c0 + 1);

            for (let r = rStart; r <= rEnd; r++) {
                for (let c = cStart; c <= cEnd; c++) {
                    let isShipCell = isH ? (r === r0 && c >= c0 && c < c0 + sz) : (c === c0 && r >= r0 && r < r0 + sz);
                    if (!isShipCell) {
                        if (this.set(r, c, 2)) changed = true;
                    }
                }
            }
            return changed;
        }

        isShip(v) { return v === 1 || (v >= 3 && v <= 8); }

        initialParsing(data) {
            if (!data) return;
            let p = 0;
            for (let i = 0; i < data.length; i++) {
                let ch = data[i];
                if (ch >= 'a' && ch <= 'z') p += ch.charCodeAt(0) - 96;
                else {
                    let val = [2, 8, 7, 3, 6, 4, 5][parseInt(ch, 10)] || 2;
                    let cr = Math.floor(p / this.size), cc = p % this.size;
                    this.set(cr, cc, val);
                    this.givens[cr][cc] = true;
                    p++;
                }
            }
        }

        loadLockedGivens(G) {
            for (let r = 0; r < this.size; r++) for (let c = 0; c < this.size; c++) {
                let v = G.locked[r][c];
                if (v !== undefined && v !== -1 && v !== '') {
                    let p = parseInt(v, 10);
                    let val = !isNaN(p) ? ([2, 8, 7, 3, 6, 4, 5][p] || 2) : 1;
                    if (typeof v === 'string' && isNaN(p)) {
                        const map = { 'S': 8, 'O': 8, 'W': 2, '^': 3, 'v': 4, '<': 5, '>': 6, 'X': 7, '+': 7 };
                        val = map[v] || 1;
                    }
                    if (this.set(r, c, val) || this.isShip(this.grid[r][c]) || this.grid[r][c] === 2) {
                        this.givens[r][c] = true;
                    }
                }
            }
        }

        set(r, c, val) {
            if (r < 0 || r >= this.size || c < 0 || c >= this.size) return false;
            let cur = this.grid[r][c];
            if (cur === 0) {
                this.grid[r][c] = val;
                if (this.isShip(val)) { this.remRowClues[r]--; this.remColClues[c]--; }
                return true;
            } else if (this.isShip(cur)) {
                if (val === 2) throw new Error(`CONFLICT: R${r}C${c} is Ship, cannot be Water`);
                if (this.isShip(val) && val !== cur && val !== 1) { this.grid[r][c] = val; return true; }
                return false;
            } else if (cur === 2) {
                if (this.isShip(val)) throw new Error(`CONFLICT: R${r}C${c} is Water, cannot be Ship`);
                return false;
            }
            return false;
        }

        recalculateRemainingClues() {
            this.remRowClues = [...this.rowClues];
            this.remColClues = [...this.colClues];
            for (let r = 0; r < this.size; r++) for (let c = 0; c < this.size; c++) {
                if (this.isShip(this.grid[r][c])) { this.remRowClues[r]--; this.remColClues[c]--; }
            }
        }

        validateState() {
            let vls = this.checkViolations();
            if (vls.rows.length > 0 || vls.cols.length > 0 || vls.fleet.length > 0 || vls.touch.length > 0 || vls.starved.length > 0) {
                let msg = `Contradiction! Overflow:[${vls.rows}${vls.cols}] Fleet:[${vls.fleet}] Touch:[${vls.touch.length}] Starved:[${vls.starved}]`;
                throw new Error(msg);
            }
        }

        getShipInventory() {
            let inv = {}; for (let sz in this.fleet) inv[sz] = 0;
            let s = this.size;
            let visited = Array.from({ length: s }, () => new Array(s).fill(false));

            for (let r = 0; r < s; r++) {
                for (let c = 0; c < s; c++) {
                    if (this.isShip(this.grid[r][c]) && !visited[r][c]) {
                        let hLen = 1; while (c + hLen < s && this.isShip(this.grid[r][c + hLen])) hLen++;
                        let vLen = 1; while (r + vLen < s && this.isShip(this.grid[r + vLen][c])) vLen++;

                        if (hLen > 1 && vLen > 1) throw new Error(`Illegal Shape at (${r},${c})`);
                        let len = Math.max(hLen, vLen);
                        if (len > this.size) throw new Error(`Ship segment too long at (${r},${c}): ${len}`);
                        let szKeys = Object.keys(this.fleet);
                        if (szKeys.includes(String(len))) {
                            let isCapped = false;
                            if (hLen > 1) {
                                let l = (c === 0 || this.grid[r][c - 1] === 2);
                                let rEnd = (c + hLen === s || this.grid[r][c + hLen] === 2);
                                if (l && rEnd) isCapped = true;
                            } else if (vLen > 1) {
                                let u = (r === 0 || this.grid[r - 1][c] === 2);
                                let d = (r + vLen === s || this.grid[r + vLen][c] === 2);
                                if (u && d) isCapped = true;
                            } else { // Size 1 (Submarine)
                                let u = (r === 0 || this.grid[r - 1][c] === 2);
                                let d = (r === s - 1 || this.grid[r + 1][c] === 2);
                                let l = (c === 0 || this.grid[r][c - 1] === 2);
                                let ri = (c === s - 1 || this.grid[r][c + 1] === 2);
                                if (u && d && l && ri) isCapped = true;
                            }

                            if (isCapped) inv[len]++;
                        }

                        // Mark visited
                        if (hLen > 1) { for (let i = 0; i < hLen; i++) visited[r][c + i] = true; }
                        else if (vLen > 1) { for (let i = 0; i < vLen; i++) visited[r + i][c] = true; }
                        else { visited[r][c] = true; }
                    }
                }
            }
            return inv;
        }

        checkViolations() {
            let s = this.size, res = { rows: [], cols: [], fleet: [], touch: [], starved: [] };
            for (let i = 0; i < s; i++) {
                let rShips = 0, rPossible = 0;
                for (let j = 0; j < s; j++) {
                    if (this.isShip(this.grid[i][j])) rShips++;
                    if (this.grid[i][j] !== 2) rPossible++;
                }
                if (rShips > this.rowClues[i]) res.rows.push(`R${i} Overflow`);
                if (rPossible < this.rowClues[i]) res.starved.push(`R${i} Starved`);

                let cShips = 0, cPossible = 0;
                for (let j = 0; j < s; j++) {
                    if (this.isShip(this.grid[j][i])) cShips++;
                    if (this.grid[j][i] !== 2) cPossible++;
                }
                if (cShips > this.colClues[i]) res.cols.push(`C${i} Overflow`);
                if (cPossible < this.colClues[i]) res.starved.push(`C${i} Starved`);
            }

            // Fleet and Shape violation check
            try {
                let inv = this.getShipInventory();
                for (let sz in this.fleet) if (inv[sz] > this.fleet[sz]) res.fleet.push(Number(sz));

                // Non-touching check
                for (let r = 0; r < s; r++) {
                    for (let c = 0; c < s; c++) {
                        if (this.isShip(this.grid[r][c])) {
                            // Check diagonals specifically (Rule 1 covers this but for validation we need it here)
                            for (let dr of [-1, 1]) for (let dc of [-1, 1]) {
                                let nr = r + dr, nc = c + dc;
                                if (nr >= 0 && nr < s && nc >= 0 && nc < s && this.isShip(this.grid[nr][nc])) {
                                    res.touch.push(`(${r},${c}) touches (${nr},${nc})`);
                                }
                            }
                        }
                    }
                }
            } catch (e) {
                res.fleet.push(e.message);
            }

            return res;
        }

        getCompletedCounts() { return this.getShipInventory(); }

        // ========================
        //  BACKGROUND SYSTEMS
        // ========================

        applyShapeHardening() {
            let changed = false, s = this.size;
            for (let r = 0; r < s; r++) {
                for (let c = 0; c < s; c++) {
                    let v = this.grid[r][c];
                    if (v !== 1) continue;

                    let u = (r > 0 && this.isShip(this.grid[r - 1][c])), d = (r < s - 1 && this.isShip(this.grid[r + 1][c]));
                    let l = (c > 0 && this.isShip(this.grid[r][c - 1])), nR = (c < s - 1 && this.isShip(this.grid[r][c + 1]));
                    let uw = (r === 0 || this.grid[r - 1][c] === 2), dw = (r === s - 1 || this.grid[r + 1][c] === 2);
                    let lw = (c === 0 || this.grid[r][c - 1] === 2), rw = (c === s - 1 || this.grid[r][c + 1] === 2);

                    let nv = 1;
                    if (uw && dw && lw && rw) nv = 8;
                    else if (uw && lw && rw && d) nv = 3;
                    else if (dw && lw && rw && u) nv = 4;
                    else if (lw && uw && dw && nR) nv = 5;
                    else if (rw && uw && dw && l) nv = 6;
                    else if (u && d && lw && rw) nv = 7;
                    else if (l && nR && uw && dw) nv = 7;

                    if (nv !== 1 && nv !== v) {
                        if (this.set(r, c, nv)) changed = true;
                    }
                }
            }
            if (changed) this.counterCb('Hardening');
            return changed;
        }

        // ========================
        //  MODULAR RULE SYSTEM
        // ========================

        autoSolve(maxRule = 'All') {
            let totalChanged = false;
            let changed = true;
            while (changed) {
                changed = false;

                // Background hardening (Dashboard only)
                if (this.applyShapeHardening()) {
                    totalChanged = true;
                    changed = true;
                }

                // Rule 1: Diagonals
                if (this.applyRule_Diagonals()) {
                    totalChanged = true;
                    changed = true;
                    continue;
                }
                if (maxRule === 'Diagonals') break;

                // Rule 2: Caps
                if (this.applyRule_Caps()) {
                    totalChanged = true;
                    changed = true;
                    continue;
                }
                if (maxRule === 'Caps') break;

                // Rule 3: QuotaWater
                if (this.applyRule_QuotaWater()) {
                    totalChanged = true;
                    changed = true;
                    continue;
                }
                if (maxRule === 'QuotaWater') break;

                // Rule 4: QuotaShips
                if (this.applyRule_QuotaShips()) {
                    totalChanged = true;
                    changed = true;
                    continue;
                }
                if (maxRule === 'QuotaShips') break;

                // Rule 5: ScarcityWater
                if (this.applyRule_ScarcityWater()) {
                    totalChanged = true;
                    changed = true;
                    continue;
                }
                if (maxRule === 'ScarcityWater') break;

                // Rule 6: ScarcityShips
                if (this.applyRule_ScarcityShips()) {
                    totalChanged = true;
                    changed = true;
                    continue;
                }
                if (maxRule === 'ScarcityShips') break;

                // Rule 7: ExtendFullInventory
                if (this.applyRule_ExtendFullInventory()) {
                    totalChanged = true;
                    changed = true;
                    continue;
                }
                if (maxRule === 'ExtendFullInventory') break;

                // Rule 8: MaxAvailTry (Simulation Consensus)
                if (maxRule === 'All' || maxRule === '8') {
                    if (this.applyRule_MaxAvailTry()) {
                        totalChanged = true;
                        changed = true;
                        continue;
                    }
                }
                if (maxRule === '8') break;
            }
            return totalChanged;
        }

        applyBasicFill() { return false; } // Stub for Phase 1
        applyRule7() { return false; }     // Stub for Phase 2
        applyRule8Deductive() { return false; }
        applyFleetDFS() { return false; }  // Stub for Phase 3

        // Rule 1: Diagonals
        applyRule_Diagonals() {
            let found = 0, s = this.size;
            for (let r = 0; r < s; r++) for (let c = 0; c < s; c++) {
                if (this.isShip(this.grid[r][c])) {
                    // All 4 diagonals must be water
                    for (let dr of [-1, 1]) for (let dc of [-1, 1]) {
                        let nr = r + dr, nc = c + dc;
                        if (nr >= 0 && nr < s && nc >= 0 && nc < s && this.grid[nr][nc] === 0) {
                            if (this.set(nr, nc, 2)) found++;
                        }
                    }
                }
            }
            if (found > 0) {
                console.log(`[Diagonals] found ${found} water`);
                this.counterCb('Diagonals');
            }
            return found > 0;
        }

        // Rule 2: Caps
        applyRule_Caps() {
            let found = 0, s = this.size;
            for (let r = 0; r < s; r++) for (let c = 0; c < s; c++) {
                let v = this.grid[r][c];
                if (v === 0 || v === 2) continue;

                let waters = [], ships = [];
                if (v === 3) { waters.push([r - 1, c]); ships.push([r + 1, c]); } // ^
                else if (v === 4) { waters.push([r + 1, c]); ships.push([r - 1, c]); } // v
                else if (v === 5) { waters.push([r, c - 1]); ships.push([r, c + 1]); } // <
                else if (v === 6) { waters.push([r, c + 1]); ships.push([r, c - 1]); } // >
                else if (v === 8) { waters.push([r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]); } // O
                else if (v === 7) { // M (Middle)
                    // If we know orientation from neighbors or edge
                    let isV = false, isH = false;
                    if ((r > 0 && this.isShip(this.grid[r - 1][c])) || (r < s - 1 && this.isShip(this.grid[r + 1][c]))) isV = true;
                    if ((c > 0 && this.isShip(this.grid[r][c - 1])) || (c < s - 1 && this.isShip(this.grid[r][c + 1]))) isH = true;
                    if ((r === 0 || r === s - 1 || this.grid[r - 1][c] === 2 || this.grid[r + 1][c] === 2)) isH = true;
                    if ((c === 0 || c === s - 1 || this.grid[r][c - 1] === 2 || this.grid[r][c + 1] === 2)) isV = true;

                    if (isV) ships.push([r - 1, c], [r + 1, c]);
                    if (isH) ships.push([r, c - 1], [r, c + 1]);
                }

                for (let [tr, tc] of waters) {
                    if (tr >= 0 && tr < s && tc >= 0 && tc < s && this.grid[tr][tc] === 0) {
                        if (this.set(tr, tc, 2)) found++;
                    }
                }
                for (let [tr, tc] of ships) {
                    if (tr >= 0 && tr < s && tc >= 0 && tc < s && this.grid[tr][tc] === 0) {
                        if (this.set(tr, tc, 1)) found++;
                    }
                }
            }
            if (found > 0) {
                console.log(`[Caps] found ${found} segments/water`);
                this.counterCb('Caps');
                this.validateState();
            }
            return found > 0;
        }

        // Rule 3: QuotaWater
        applyRule_QuotaWater() {
            let found = 0, s = this.size;
            for (let i = 0; i < s; i++) {
                // Rows
                let rowShips = 0;
                for (let j = 0; j < s; j++) if (this.isShip(this.grid[i][j])) rowShips++;
                if (rowShips === this.rowClues[i]) {
                    for (let j = 0; j < s; j++) {
                        if (this.grid[i][j] === 0) {
                            if (this.set(i, j, 2)) found++;
                        }
                    }
                }
                // Cols
                let colShips = 0;
                for (let j = 0; j < s; j++) if (this.isShip(this.grid[j][i])) colShips++;
                if (colShips === this.colClues[i]) {
                    for (let j = 0; j < s; j++) {
                        if (this.grid[j][i] === 0) {
                            if (this.set(j, i, 2)) found++;
                        }
                    }
                }
            }
            if (found > 0) {
                console.log(`[QuotaWater] found ${found} water`);
                this.counterCb('QuotaWater');
                this.validateState();
            }
            return found > 0;
        }

        // Rule 4: QuotaShips
        applyRule_QuotaShips() {
            let found = 0, s = this.size;
            for (let i = 0; i < s; i++) {
                // Rows
                let nonWater = 0;
                for (let j = 0; j < s; j++) if (this.grid[i][j] !== 2) nonWater++;
                if (nonWater === this.rowClues[i]) {
                    for (let j = 0; j < s; j++) {
                        if (this.grid[i][j] === 0) {
                            if (this.set(i, j, 1)) found++;
                        }
                    }
                }
                // Cols
                let colNonWater = 0;
                for (let j = 0; j < s; j++) if (this.grid[j][i] !== 2) colNonWater++;
                if (colNonWater === this.colClues[i]) {
                    for (let j = 0; j < s; j++) {
                        if (this.grid[j][i] === 0) {
                            if (this.set(j, i, 1)) found++;
                        }
                    }
                }
            }
            if (found > 0) {
                console.log(`[QuotaShips] found ${found} segments`);
                this.counterCb('QuotaShips');
                this.validateState();
            }
            return found > 0;
        }

        // Rule 5: ScarcityWater
        applyRule_ScarcityWater() {
            let inv = this.getShipInventory();
            let rem = {}; let maxS = 0, minS = 100;
            for (let sz in this.fleet) {
                let sNum = Number(sz);
                rem[sz] = this.fleet[sz] - inv[sz];
                if (rem[sz] > 0) {
                    maxS = Math.max(maxS, sNum);
                    minS = Math.min(minS, sNum);
                }
            }
            if (maxS === 0) return false;

            let found = 0, s = this.size;
            for (let r = 0; r < s; r++) for (let c = 0; c < s; c++) {
                if (this.grid[r][c] === 0) {
                    // How long could a ship be if it passed through (r,c)?
                    let h0 = c, h1 = c;
                    while (h0 > 0 && this.grid[r][h0 - 1] !== 2) h0--;
                    while (h1 < s - 1 && this.grid[r][h1 + 1] !== 2) h1++;
                    let v0 = r, v1 = r;
                    while (v0 > 0 && this.grid[v0 - 1][c] !== 2) v0--;
                    while (v1 < s - 1 && this.grid[v1 + 1][c] !== 2) v1++;

                    let maxPotential = Math.max(h1 - h0 + 1, v1 - v0 + 1);
                    if (maxPotential < minS) {
                        if (this.set(r, c, 2)) found++;
                    }
                }
            }

            if (found > 0) {
                console.log(`[ScarcityWater] filled ${found} water`);
                this.counterCb('ScarcityWater');
                this.validateState();
            }
            return found > 0;
        }

        // ========================
        //  HEURISTIC HELPERS
        // ========================

        causesStarvation(r0, c0, sz, isH) {
            let s = this.size;
            let backupGrid = this.grid.map(row => [...row]);
            let backupRowRem = [...this.remRowClues];
            let backupColRem = [...this.remColClues];

            let starved = false;
            try {
                this.placeShip(r0, c0, sz, isH);
                let inv = this.getShipInventory();
                let maxFleetSize = Math.max(...Object.keys(this.fleet).map(Number));
                
                for (let testSz = maxFleetSize; testSz >= 1; testSz--) {
                    let needed = this.fleet[testSz] - (inv[testSz] || 0);
                    if (needed > 0) {
                        let count = 0;
                        for (let r = 0; r < s; r++) {
                            for (let c = 0; c < s; c++) {
                                if (this.checkPlacement(r, c, testSz, true)) count++;
                                if (testSz > 1 && this.checkPlacement(r, c, testSz, false)) count++;
                            }
                        }
                        if (count < needed) { starved = true; break; }
                    }
                }
            } catch (e) {
                starved = true;
            }

            for (let r = 0; r < s; r++) {
                for (let c = 0; c < s; c++) {
                    this.grid[r][c] = backupGrid[r][c];
                }
            }
            this.remRowClues = [...backupRowRem];
            this.remColClues = [...backupColRem];
            return starved;
        }

        /**
         * Validates if a ship of size 'sz' can be placed starting at (r0, c0)
         * Enforces: Boundary, Water, Non-touching, Clue quotas, and Anchors.
         */
        checkPlacement(r0, c0, sz, isH) {
            let s = this.size;
            for (let i = 0; i < sz; i++) {
                let r = isH ? r0 : r0 + i, c = isH ? c0 + i : c0;
                if (r < 0 || r >= s || c < 0 || c >= s || this.grid[r][c] === 2) return false;

                // Bimaru non-touching rule (Check 3x3 around each cell)
                for (let dr = -1; dr <= 1; dr++) {
                    for (let dc = -1; dc <= 1; dc++) {
                        let nr = r + dr, nc = c + dc;
                        if (nr < 0 || nr >= s || nc < 0 || nc >= s) continue;
                        if (this.isShip(this.grid[nr][nc])) {
                            let partOfUs = isH ? (nr === r && nc >= c0 && nc < c0 + sz) : (nc === c && nr >= r0 && nr < r0 + sz);
                            if (!partOfUs) return false;
                        }
                    }
                }
            }

            // Clue Check: Does this placement exceed row/col clues?
            let rCounts = {}, cCounts = {};
            for (let i = 0; i < sz; i++) {
                let r = isH ? r0 : r0 + i, c = isH ? c0 + i : c0;
                if (this.grid[r][c] === 0) {
                    rCounts[r] = (rCounts[r] || 0) + 1;
                    cCounts[c] = (cCounts[c] || 0) + 1;
                }
            }
            for (let r in rCounts) {
                if (this.remRowClues[r] < rCounts[r]) return false;
            }
            for (let c in cCounts) {
                if (this.remColClues[c] < cCounts[c]) return false;
            }

            // Boundary checks for Mandatory Ship Ends (Anchors)
            if (isH) {
                if (c0 > 0 && this.isShip(this.grid[r0][c0 - 1])) return false;
                if (c0 + sz < s && this.isShip(this.grid[r0][c0 + sz])) return false;
            } else {
                if (r0 > 0 && this.isShip(this.grid[r0 - 1][c0])) return false;
                if (r0 + sz < s && this.isShip(this.grid[r0 + sz][c0])) return false;
            }

            // Exclude already completed/capped ships from being candidates for REMAINING ships
            let allShip = true;
            for (let i = 0; i < sz; i++) {
                let r = isH ? r0 : r0 + i, c = isH ? c0 + i : c0;
                if (!this.isShip(this.grid[r][c])) { allShip = false; break; }
            }
            if (allShip) {
                let isCapped = false;
                if (sz === 1) {
                    let u = (r0 === 0 || this.grid[r0 - 1][c0] === 2);
                    let d = (r0 === s - 1 || this.grid[r0 + 1][c0] === 2);
                    let l = (c0 === 0 || this.grid[r0][c0 - 1] === 2);
                    let ri = (c0 === s - 1 || this.grid[r0][c0 + 1] === 2);
                    if (u && d && l && ri) isCapped = true;
                } else if (isH) {
                    let l = (c0 === 0 || this.grid[r0][c0 - 1] === 2);
                    let rEnd = (c0 + sz === s || this.grid[r0][c0 + sz] === 2);
                    if (l && rEnd) isCapped = true;
                } else {
                    let u = (r0 === 0 || this.grid[r0 - 1][c0] === 2);
                    let d = (r0 + sz === s || this.grid[r0 + sz][c0] === 2);
                    if (u && d) isCapped = true;
                }
                if (isCapped) return false;
            }

            return true;
        }

        // Rule 6: ScarcityShips (Last Slot / Pigeonhole)
        applyRule_ScarcityShips() {
            let inv = this.getShipInventory();
            let rem = {}; for (let sz in this.fleet) rem[sz] = this.fleet[sz] - inv[sz];
            let found = 0, s = this.size;

            let maxFleetSize = Math.max(...Object.keys(this.fleet).map(Number));
            for (let sz = maxFleetSize; sz >= 1; sz--) {
                let needed = rem[sz];
                if (needed <= 0) continue;

                let allPlacements = [];
                for (let r = 0; r < s; r++) {
                    for (let c = 0; c < s; c++) {
                        if (this.checkPlacement(r, c, sz, true)) {
                            if (!this.causesStarvation(r, c, sz, true)) allPlacements.push({ r, c, type: 'H' });
                        }
                        if (sz > 1 && this.checkPlacement(r, c, sz, false)) {
                            if (!this.causesStarvation(r, c, sz, false)) allPlacements.push({ r, c, type: 'V' });
                        }
                    }
                }

                if (allPlacements.length === needed) {
                    for (let p of allPlacements) {
                        if (this.placeShip(p.r, p.c, sz, p.type === 'H')) found++;
                    }
                } else if (allPlacements.length > needed && needed === 1) {
                    let commonShip = null;
                    let commonHalo = null;

                    for (let p of allPlacements) {
                        let shipSet = new Set();
                        let isH = (p.type === 'H');
                        for (let i = 0; i < sz; i++) shipSet.add(isH ? `${p.r},${p.c + i}` : `${p.r + i},${p.c}`);

                        if (!commonShip) commonShip = shipSet;
                        else {
                            let newShip = new Set();
                            for (let sc of shipSet) if (commonShip.has(sc)) newShip.add(sc);
                            commonShip = newShip;
                        }

                        let haloSet = new Set();
                        let rStart = p.r - 1, rEnd = p.r + (isH ? 0 : sz - 1) + 1;
                        let cStart = p.c - 1, cEnd = p.c + (isH ? sz - 1 : 0) + 1;
                        for (let r = rStart; r <= rEnd; r++) {
                            for (let c = cStart; c <= cEnd; c++) {
                                if (r >= 0 && r < s && c >= 0 && c < s) {
                                    if (!shipSet.has(`${r},${c}`)) haloSet.add(`${r},${c}`);
                                }
                            }
                        }

                        if (!commonHalo) commonHalo = haloSet;
                        else {
                            let newHalo = new Set();
                            for (let h of haloSet) if (commonHalo.has(h)) newHalo.add(h);
                            commonHalo = newHalo;
                        }
                    }

                    if (commonShip && commonShip.size > 0) {
                        for (let sc of commonShip) {
                            let [cr, cc] = sc.split(',').map(Number);
                            if (this.grid[cr][cc] === 0 && this.set(cr, cc, 1)) found++;
                        }
                    }
                    if (commonHalo && commonHalo.size > 0) {
                        for (let h of commonHalo) {
                            let [hr, hc] = h.split(',').map(Number);
                            if (this.grid[hr][hc] === 0 && this.set(hr, hc, 2)) found++;
                        }
                    }
                }
                if (found > 0) break;
            }

            if (found > 0) {
                console.log(`[ScarcityShips] found ${found} segments`);
                this.counterCb('ScarcityShips');
                this.validateState();
            }
            return found > 0;
        }

        // Rule 9: ExtendFullInventory
        applyRule_ExtendFullInventory() {
            let inv = this.getShipInventory();
            let rem = {}; for (let sz in this.fleet) rem[sz] = this.fleet[sz] - inv[sz];
            let found = 0, s = this.size;

            for (let r = 0; r < s; r++) {
                for (let c = 0; c < s; c++) {
                    if (this.isShip(this.grid[r][c])) {
                        // Horizontal segment check
                        if (c === 0 || !this.isShip(this.grid[r][c - 1])) {
                            let lenH = 0;
                            while (c + lenH < s && this.isShip(this.grid[r][c + lenH])) lenH++;
                            if (rem[lenH] <= 0) {
                                let lBlock = (c === 0 || this.grid[r][c - 1] === 2);
                                let rBlock = (c + lenH === s || this.grid[r][c + lenH] === 2);
                                let canBeVertical = (lenH === 1) && ((r > 0 && this.grid[r - 1][c] !== 2) || (r < s - 1 && this.grid[r + 1][c] !== 2));

                                if (!canBeVertical) {
                                    if (lBlock && !rBlock && this.grid[r][c + lenH] === 0) {
                                        if (this.set(r, c + lenH, 1)) found++;
                                    } else if (rBlock && !lBlock && this.grid[r][c - 1] === 0) {
                                        if (this.set(r, c - 1, 1)) found++;
                                    }
                                }
                            }
                        }

                        // Vertical segment check
                        if (r === 0 || !this.isShip(this.grid[r - 1][c])) {
                            let lenV = 0;
                            while (r + lenV < s && this.isShip(this.grid[r + lenV][c])) lenV++;
                            if (rem[lenV] <= 0) {
                                let tBlock = (r === 0 || this.grid[r - 1][c] === 2);
                                let bBlock = (r + lenV === s || this.grid[r + lenV][c] === 2);
                                let canBeHorizontal = (lenV === 1) && ((c > 0 && this.grid[r][c - 1] !== 2) || (c < s - 1 && this.grid[r][c + 1] !== 2));

                                if (!canBeHorizontal) {
                                    if (tBlock && !bBlock && this.grid[r + lenV][c] === 0) {
                                        if (this.set(r + lenV, c, 1)) found++;
                                    } else if (bBlock && !tBlock && this.grid[r - 1][c] === 0) {
                                        if (this.set(r - 1, c, 1)) found++;
                                    }
                                }
                            }
                        }
                    }
                }
            }

            if (found > 0) {
                console.log(`[ExtendFullInventory] Extended ${found} segments because their current size quota is full.`);
                this.counterCb('ExtendFullInventory');
                this.validateState();
            }
            return found > 0;
        }

        // Rule 7: CandidateScanner (Diagnostic)
        applyRule_CandidateScanner() {
            let inv = this.getShipInventory();
            let rem = {}; for (let sz in this.fleet) rem[sz] = this.fleet[sz] - inv[sz];
            let s = this.size;

            console.log("%c[CandidateScanner] Scanning board for possible homes...", "font-weight: bold; color: #6c5ce7;");

            let maxFleetSize = Math.max(...Object.keys(this.fleet).map(Number));
            for (let sz = maxFleetSize; sz >= 1; sz--) {
                if (rem[sz] <= 0) continue;
                let candH = [], candV = [];
                for (let r = 0; r < s; r++) {
                    for (let c = 0; c < s; c++) {
                        if (this.checkPlacement(r, c, sz, true)) {
                            if (!this.causesStarvation(r, c, sz, true)) candH.push(`(${r},${c})`);
                        }
                        if (sz > 1 && this.checkPlacement(r, c, sz, false)) {
                            if (!this.causesStarvation(r, c, sz, false)) candV.push(`(${r},${c})`);
                        }
                    }
                }
                let total = candH.length + candV.length;
                console.log(`[Size ${sz}] Rem: ${rem[sz]} | Found: ${total}`);
                if (candH.length > 0) console.log(`   Horizontal: ${candH.join(', ')}`);
                if (candV.length > 0) console.log(`   Vertical: ${candV.join(', ')}`);
            }
            return false; // Diagnostic only
        }

        // Rule 8: MaxAvailTry (Trial Consensus)
        applyRule_MaxAvailTry() {
            let inv = this.getShipInventory();
            let rem = {}; for (let sz in this.fleet) rem[sz] = this.fleet[sz] - inv[sz];
            let totalFound = 0, s = this.size;

            // On very large boards, skip Submarine trials to maintain performance
            // Restriction: Skip Submarine (size-1) trials to maintain performance
            let minS = 2;

            let maxFleetSize = Math.max(...Object.keys(this.fleet).map(Number));
            for (let sz = maxFleetSize; sz >= minS; sz--) {
                if (rem[sz] <= 0) continue;
                let maxS = Number(sz);

                let candidates = [];
                // ... (Scanning logic remains same)
                for (let r = 0; r < s; r++) {
                    for (let c = 0; c < s; c++) {
                        if (this.checkPlacement(r, c, maxS, true)) {
                            candidates.push({ r, c, type: 'H' });
                        }
                        if (this.checkPlacement(r, c, maxS, false)) {
                            candidates.push({ r, c, type: 'V' });
                        }
                    }
                }
                if (candidates.length === 0) continue;

                console.log(`[Rule 8] Trialing ${candidates.length} candidates for size ${maxS}...`);
                let validCandidates = [];
                let simulationGrids = [];

                for (let p of candidates) {
                    // Check how many empty cells this placement would fill
                    let emptyCells = [];
                    for (let i = 0; i < maxS; i++) {
                        let rr = p.type === 'H' ? p.r : p.r + i, cc = p.type === 'H' ? p.c + i : p.c;
                        if (this.grid[rr][cc] === 0) emptyCells.push({ r: rr, c: cc });
                    }

                    let oldLog = console.log; console.log = () => { };
                    try {
                        let clone = this.clone();
                        clone.counterCb = () => { };
                        clone.placeShip(p.r, p.c, maxS, p.type === 'H');
                        clone.validateState();
                        // Recursive Simulation Guard: On larger boards, don't run Rule 8 inside Rule 8
                        let innerMax = (this.size >= 15) ? 'ScarcityShips' : '8';
                        clone.autoSolve(innerMax);
                        validCandidates.push(p);
                        simulationGrids.push(clone.grid);
                    } catch (e) {
                        // Candidate Eliminated!
                        console.log = oldLog;
                        console.log(`[Rule 8] Eliminated candidate (${p.r},${p.c}) ${p.type}: ${e.message}`);

                        // PRUNING TRIGGER: If only ONE cell was empty and it failed -> that cell is water
                        if (emptyCells.length === 1) {
                            console.log(`%c[Rule 8] Immediate Prune: Cell (${emptyCells[0].r},${emptyCells[0].c}) MUST be Water!`, "font-weight: bold; color: #e17055;");
                            if (this.set(emptyCells[0].r, emptyCells[0].c, 2)) {
                                this.counterCb('8');
                                this.validateState();
                                return true;
                            }
                        }
                    } finally { console.log = oldLog; }
                }

                // 2. All-Man-Down Check
                if (validCandidates.length === 0) {
                    console.error(`[Rule 8] Conflict: Size ${maxS} has NO valid placements!`);
                    throw new Error(`Contradiction! Size ${maxS} is starved.`);
                }

                // 3. Last-Man-Standing Deduction
                if (validCandidates.length === 1) {
                    let p = validCandidates[0];
                    console.log(`%c[Rule 8] Last Man Standing! Size ${maxS} MUST be at (${p.r},${p.c}) ${p.type}`, "font-weight: bold; color: #d63031;");
                    if (this.placeShip(p.r, p.c, maxS, p.type === 'H')) {
                        totalFound++;
                        continue; // Restart cascade
                    }
                }

                // 4. Ghost Consensus (Global Intersection: Optimized)
                if (simulationGrids.length > 0) {
                    for (let r = 0; r < s; r++) for (let c = 0; c < s; c++) {
                        if (this.grid[r][c] !== 0) continue;

                        let firstVal = simulationGrids[0][r][c];
                        if (firstVal === 0) continue;

                        let consensus = true;
                        for (let i = 1; i < simulationGrids.length; i++) {
                            let curVal = simulationGrids[i][r][c];
                            if (firstVal === 2) {
                                if (curVal !== 2) { consensus = false; break; }
                            } else {
                                if (!this.isShip(curVal)) { consensus = false; break; }
                            }
                        }

                        if (consensus) {
                            if (this.set(r, c, firstVal === 2 ? 2 : 1)) {
                                totalFound++;
                            }
                        }
                    }
                }

                if (totalFound > 0) return true;
                console.log(`[Rule 8] Size ${maxS} is still ambiguous (${validCandidates.length} potential homes)`);
            }
            return totalFound > 0;
        }
    }

    window.BimaruSolver = BimaruSolver;
})();
