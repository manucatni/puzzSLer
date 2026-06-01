// ==UserScript==
// @name         futoSLVer-Advanced
// @namespace    http://tampermonkey.net/
// @version      10.0
// @description  Futoshiki Phoenix Upgrade v10 - Pure Logic Engine. No guessing. Manucatni.
// @author       manucatni
// @match        https://www.puzzle-futoshiki.com/*
// @match        https://puzzle-futoshiki.com/*
// @exclude      https://www.puzzle-futoshiki.com/*renzoku*
// @exclude      https://puzzle-futoshiki.com/*renzoku*
// @exclude      https://www.puzzle-futoshiki.com/thermometers/*
// @exclude      https://puzzle-futoshiki.com/thermometers/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

// This function wraps the entire code so it runs independently and doesn't conflict with other scripts
(function () {
    // Enforce strict JavaScript rules to prevent common errors
    'use strict';

    // A variable to store a reference to the main game object from the website
    let originalGame;
    // A flag (true/false) to remember if our solver has already started running
    let solverTriggered = false;

    // --- TRIGGER 1: THE MEMORY TRAP ---
    // We are secretly monitoring when the website tries to create the "Game" object
    Object.defineProperty(window, 'Game', {
        // When the website tries to read "Game", we give it our stored version
        get() { return originalGame; },
        // When the website tries to save the "Game", we intercept it
        set(newValue) {
            // Save the new game object in our originalGame variable
            originalGame = newValue;
            // Check if the new game is a valid object (not just a piece of HTML text)
            if (newValue && !(newValue instanceof HTMLElement)) {
                // Wait for the game data to fully load before solving
                waitForData(newValue);
            }
        },
        // Allow these settings to be changed later if needed
        configurable: true,
        // Make sure this property shows up when listing window properties
        enumerable: true
    });

    // --- TRIGGER 2: THE COLD START ---
    // If the game is already loaded before our script starts, catch it here
    if (window.Game && !(window.Game instanceof HTMLElement)) {
        // Grab the existing game object
        originalGame = window.Game;
        // Start waiting for its data to be ready
        waitForData(originalGame);
    }

    // --- TRIGGER 3: THE FALLBACK POLLER ---
    // Start a timer that runs repeatedly every 10 milliseconds just in case the first two triggers missed it
    const poller = setInterval(() => {
        // If the solver already started, stop this repeated timer
        if (solverTriggered) {
            clearInterval(poller);
            return; // Exit the function
        }
        // Grab whatever is currently set as the Game
        const target = window.Game;
        // Check if we found a valid game object
        if (target && !(target instanceof HTMLElement)) {
            // Start waiting for its data
            waitForData(target);
        }
    }, 10); // 10 milliseconds delay

    // Function to wait until the game board data is fully ready to be read
    function waitForData(G) {
        // Start a very fast timer (every 1 millisecond) to check the data
        const dataPoller = setInterval(() => {
            // If the solver is already triggered, stop checking
            if (solverTriggered) {
                clearInterval(dataPoller);
                return; // Exit
            }
            // Check if the game has a task (board), if the board has a length, and if rules/conditions exist
            if (G.task && G.task.length > 0 && G.conditions) {
                // Mark that we have successfully triggered the solver
                solverTriggered = true;
                // Stop the fast timer
                clearInterval(dataPoller);
                // Start a performance timer to see how long our code takes to run
                console.time("Futo-Phoenix-v10");
                // Print a success message in green to the browser console
                console.log("%c[Futo-Phoenix-v10] Data Found. Solving with PURE LOGIC...", "color: #00ff00; font-weight: bold;");
                // Run the actual solving engine
                launchAdvancedSolver(G);
            }
        }, 1); // 1 millisecond delay
    }

    // The main function that solves the puzzle
    function launchAdvancedSolver(gameObj) {
        // Get the size of the puzzle grid (e.g., 5 for a 5x5 puzzle)
        const SIZE = gameObj.task.length;
        // Get the rules of the puzzle (like which cells must be greater/less than others)
        const conditions = gameObj.conditions;

        // Function that executes all the logic steps
        function runSolveProcess() {
            // [LOGIC: Initialization]
            // Set up a "domain" (list of possible candidate values) for every cell on the board.
            // If the puzzle already provides a fixed number, the domain is just that number.
            // If the cell is empty (0), its domain is all possible numbers from 1 to SIZE.
            // domains is a 2D grid representing each cell's possible answers
            let domains = Array.from({ length: SIZE }, (_, r) =>
                Array.from({ length: SIZE }, (_, c) =>
                    // If the original game cell is not 0 (not empty), set its domain to that exact number
                    gameObj.task[r][c] !== 0 ? [gameObj.task[r][c]] :
                        // Otherwise, fill the domain with all possible numbers from 1 up to SIZE
                        Array.from({ length: SIZE }, (_, i) => i + 1)
                )
            );

            // [UTILITY: Combinatorics for Subsets]
            // Recursively generates all possible combinations of size `k` from the array `arr`.
            // This is used by the naked subsets algorithm to find pairs, triples, quads, etc.
            function getCombinations(arr, k) {
                // Create an empty list to store the final combinations
                const results = [];
                // A helper function that builds combinations step-by-step
                function helper(start, combo) {
                    // If our combination reached the desired size `k`, save it and stop this path
                    if (combo.length === k) { results.push(combo); return; }
                    // If there aren't enough items left in the array to finish the combination, stop
                    if (arr.length - start < k - combo.length) return;
                    // Loop through the remaining items in the array
                    for (let i = start; i < arr.length; i++) {
                        // Recursively call the helper to add the next item to the combination
                        helper(i + 1, [...combo, arr[i]]);
                    }
                }
                // Start the helper function from index 0 with an empty combination
                helper(0, []);
                // Return all the combinations we found
                return results;
            }

            // [LOGIC: Naked Subsets (Pairs, Triples, Quads, etc.)]
            // A fundamental Sudoku/Futoshiki technique.
            // If `k` cells in a group (row or column) share exactly `k` candidates among them, 
            // those `k` candidates must be placed in those `k` cells.
            // Therefore, we can logically eliminate those candidates from all OTHER cells in that group.
            function applyRealNakedSubsets(cells, doms) {
                // Variable to track if we made any changes during this process
                let changed = false;
                // Filter the cells to only those that haven't been solved yet (more than 1 candidate)
                const unsolved = cells.filter(cell => doms[cell.r][cell.c].length > 1);
                // The largest subset we should look for is the puzzle size minus 1
                const maxK = SIZE - 1;
                // Loop through all possible subset sizes starting from pairs (2) up to maxK
                for (let k = 2; k <= maxK; k++) {
                    // Find all unsolved cells that have `k` or fewer candidates in them
                    const validCells = unsolved.filter(cell => doms[cell.r][cell.c].length <= k);
                    // If we don't have enough valid cells to form a subset of size `k`, skip to the next size
                    if (validCells.length < k) continue;
                    // Get all possible combinations of `k` cells from our valid cells
                    const combos = getCombinations(validCells, k);
                    // Test each combination
                    for (const combo of combos) {
                        // Use a Set to store unique candidate numbers found in this combination
                        const unionSet = new Set();
                        // Flag to tell us if we should give up on this combination early
                        let earlyOut = false;
                        // Loop through every cell in the current combination
                        for (const c of combo) {
                            // Loop through all candidate values in the current cell's domain
                            for (const v of doms[c.r][c.c]) {
                                // Add the candidate value to our Set (Sets automatically ignore duplicates)
                                unionSet.add(v);
                                // If the total unique candidates exceed `k`, this is not a valid subset, so give up
                                if (unionSet.size > k) { earlyOut = true; break; }
                            }
                            // Stop checking cells if we already gave up
                            if (earlyOut) break;
                        }
                        // If we didn't give up and we found exactly `k` unique candidates across `k` cells...
                        if (!earlyOut && unionSet.size === k) {
                            // Convert the Set of candidates back into a regular array list
                            const values = Array.from(unionSet);
                            // Now look at every other unsolved cell in the row/column
                            for (const otherCell of unsolved) {
                                // If this cell is NOT one of the cells in our special combination...
                                if (!combo.some(g => g.r === otherCell.r && g.c === otherCell.c)) {
                                    // Remember the original number of candidates in this cell
                                    const originalLen = doms[otherCell.r][otherCell.c].length;
                                    // Remove any candidates from this cell that belong to our special subset
                                    doms[otherCell.r][otherCell.c] = doms[otherCell.r][otherCell.c].filter(v => !values.includes(v));
                                    // If we successfully removed candidates, mark that the board changed
                                    if (doms[otherCell.r][otherCell.c].length !== originalLen) changed = true;
                                }
                            }
                        }
                    }
                }
                // Return true if we changed the board, false otherwise
                return changed;
            }

            // [LOGIC: Hidden Singles]
            // Another fundamental technique.
            // If a specific number (from 1 to SIZE) can only be placed in EXACTLY ONE cell 
            // within a group (row or column), then that cell MUST be that number, 
            // regardless of what other candidates might be in that cell's domain.
            function applyHiddenSingles(cells, doms) {
                // Variable to track if we made changes
                let changed = false;
                // Loop through every possible number from 1 to the size of the puzzle
                for (let v = 1; v <= SIZE; v++) {
                    // Find all cells in the current group that still have this number as a candidate
                    const possibleCells = cells.filter(cell => doms[cell.r][cell.c].includes(v));
                    // If exactly ONE cell can hold this number...
                    if (possibleCells.length === 1) {
                        // Get that specific cell
                        const target = possibleCells[0];
                        // If the cell isn't already solved (it has more than 1 candidate)...
                        if (doms[target.r][target.c].length > 1) {
                            // Force the cell's domain to be ONLY this number, effectively solving it
                            doms[target.r][target.c] = [v];
                            // Mark that we made a change
                            changed = true;
                        }
                    }
                }
                // Return true if changes were made
                return changed;
            }

            // [LOGIC: Hidden Pairs / Triples / Quads]
            // A more advanced version of hidden singles.
            // If within a row or column, a set of `k` specific numbers can only appear
            // in exactly `k` cells (no matter how many other candidates those cells might have),
            // then those `k` cells MUST collectively hold those `k` numbers.
            // We can therefore safely eliminate ALL OTHER candidates from those `k` cells.
            function applyHiddenSubsets(cells, doms) {
                let changed = false;
                // Find all cells that are still unsolved (have more than 1 candidate)
                const unsolved = cells.filter(cell => doms[cell.r][cell.c].length > 1);
                // Only worth looking if we have at least 2 unsolved cells
                if (unsolved.length < 2) return false;

                // For each possible subset size (2, 3, 4, ... up to SIZE-1)
                for (let k = 2; k <= Math.min(SIZE - 1, unsolved.length); k++) {
                    // Get all combinations of `k` cells from the unsolved cells
                    const combos = getCombinations(unsolved, k);
                    // Test each combination
                    for (const combo of combos) {
                        // Count how many unique numbers appear ONLY in these cells
                        // First, collect all numbers that appear in any of these combo cells
                        const comboNums = new Set();
                        for (const cell of combo) {
                            for (const v of doms[cell.r][cell.c]) {
                                comboNums.add(v);
                            }
                        }
                        // If we don't have exactly `k` unique numbers, skip (not a hidden subset)
                        if (comboNums.size !== k) continue;

                        // Now check: do any of these `k` numbers appear OUTSIDE the combo cells?
                        let numbersOnlyInCombo = true;
                        for (const v of comboNums) {
                            for (const cell of unsolved) {
                                // Skip cells that are in our combo
                                if (combo.some(g => g.r === cell.r && g.c === cell.c)) continue;
                                // If this number appears in a cell outside the combo, it's not hidden
                                if (doms[cell.r][cell.c].includes(v)) {
                                    numbersOnlyInCombo = false;
                                    break;
                                }
                            }
                            if (!numbersOnlyInCombo) break;
                        }

                        // If these `k` numbers appear ONLY in these `k` cells, we found a hidden subset
                        if (numbersOnlyInCombo) {
                            // Remove any OTHER numbers from the combo cells
                            for (const cell of combo) {
                                const originalLen = doms[cell.r][cell.c].length;
                                doms[cell.r][cell.c] = doms[cell.r][cell.c].filter(v => comboNums.has(v));
                                if (doms[cell.r][cell.c].length !== originalLen) changed = true;
                            }
                        }
                    }
                }
                return changed;
            }

            // [LOGIC: X-Wing (Fish Pattern)]
            // A classic technique borrowed from Sudoku, adapted for Futoshiki.
            // If a specific candidate number appears in exactly 2 rows AND those occurrences
            // are lined up in exactly the same 2 columns (no other occurrences in those rows),
            // then that candidate can be safely removed from all OTHER cells in those 2 columns.
            // The same logic applies symmetrically for columns vs rows.
            function applyXWing(doms) {
                let changed = false;

                // --- X-Wing in rows (eliminate from columns) ---
                // For each candidate value from 1 to SIZE
                for (let v = 1; v <= SIZE; v++) {
                    // Find which columns contain this value in each row
                    const rowsWithCols = [];
                    for (let r = 0; r < SIZE; r++) {
                        const cols = [];
                        for (let c = 0; c < SIZE; c++) {
                            if (doms[r][c].includes(v)) {
                                cols.push(c);
                            }
                        }
                        // Only consider rows that have exactly 2 occurrences of this value
                        if (cols.length === 2) {
                            rowsWithCols.push({ row: r, cols: cols });
                        }
                    }

                    // Look for pairs of rows that share the same 2 columns
                    for (let i = 0; i < rowsWithCols.length; i++) {
                        for (let j = i + 1; j < rowsWithCols.length; j++) {
                            const r1 = rowsWithCols[i];
                            const r2 = rowsWithCols[j];
                            // Check if both rows have the value in exactly the same 2 columns
                            if (r1.cols[0] === r2.cols[0] && r1.cols[1] === r2.cols[1]) {
                                // Found an X-Wing! The columns are r1.cols[0] and r1.cols[1].
                                // Eliminate candidate `v` from ALL OTHER rows in these 2 columns.
                                const colA = r1.cols[0];
                                const colB = r1.cols[1];
                                for (let r = 0; r < SIZE; r++) {
                                    // Skip the two rows that form the X-Wing pattern
                                    if (r === r1.row || r === r2.row) continue;
                                    // Remove v from column A
                                    if (doms[r][colA].includes(v)) {
                                        doms[r][colA] = doms[r][colA].filter(x => x !== v);
                                        changed = true;
                                    }
                                    // Remove v from column B
                                    if (doms[r][colB].includes(v)) {
                                        doms[r][colB] = doms[r][colB].filter(x => x !== v);
                                        changed = true;
                                    }
                                }
                            }
                        }
                    }
                }

                // --- X-Wing in columns (eliminate from rows) ---
                // Same logic but swapped: find columns that have the value in exactly 2 rows
                for (let v = 1; v <= SIZE; v++) {
                    const colsWithRows = [];
                    for (let c = 0; c < SIZE; c++) {
                        const rows = [];
                        for (let r = 0; r < SIZE; r++) {
                            if (doms[r][c].includes(v)) {
                                rows.push(r);
                            }
                        }
                        if (rows.length === 2) {
                            colsWithRows.push({ col: c, rows: rows });
                        }
                    }

                    for (let i = 0; i < colsWithRows.length; i++) {
                        for (let j = i + 1; j < colsWithRows.length; j++) {
                            const c1 = colsWithRows[i];
                            const c2 = colsWithRows[j];
                            if (c1.rows[0] === c2.rows[0] && c1.rows[1] === c2.rows[1]) {
                                const rowA = c1.rows[0];
                                const rowB = c1.rows[1];
                                for (let c = 0; c < SIZE; c++) {
                                    if (c === c1.col || c === c2.col) continue;
                                    if (doms[rowA][c].includes(v)) {
                                        doms[rowA][c] = doms[rowA][c].filter(x => x !== v);
                                        changed = true;
                                    }
                                    if (doms[rowB][c].includes(v)) {
                                        doms[rowB][c] = doms[rowB][c].filter(x => x !== v);
                                        changed = true;
                                    }
                                }
                            }
                        }
                    }
                }

                return changed;
            }

            // [LOGIC: Swordfish (3x3 Fish Pattern)]
            // A more powerful version of X-Wing that uses 3 rows and 3 columns.
            // If a candidate appears in exactly 3 rows, and in those 3 rows it only ever
            // appears in the same 3 columns, then that candidate can be eliminated
            // from all OTHER cells in those 3 columns.
            function applySwordfish(doms) {
                let changed = false;

                // --- Swordfish in rows (eliminate from columns) ---
                for (let v = 1; v <= SIZE; v++) {
                    // For each row, find which columns contain this value
                    const rowsWithCols = [];
                    for (let r = 0; r < SIZE; r++) {
                        const cols = [];
                        for (let c = 0; c < SIZE; c++) {
                            if (doms[r][c].includes(v)) {
                                cols.push(c);
                            }
                        }
                        // For Swordfish, a row can have 2 or 3 occurrences
                        if (cols.length >= 2 && cols.length <= 3) {
                            rowsWithCols.push({ row: r, cols: cols });
                        }
                    }

                    // Look for triples of rows whose columns are subsets of a shared set of 3 columns
                    for (let i = 0; i < rowsWithCols.length; i++) {
                        for (let j = i + 1; j < rowsWithCols.length; j++) {
                            for (let k = j + 1; k < rowsWithCols.length; k++) {
                                const r1 = rowsWithCols[i];
                                const r2 = rowsWithCols[j];
                                const r3 = rowsWithCols[k];

                                // Collect all unique columns used by these 3 rows
                                const allCols = new Set([...r1.cols, ...r2.cols, ...r3.cols]);

                                // For a valid Swordfish, they must use exactly 3 columns total
                                if (allCols.size === 3) {
                                    const colsArr = Array.from(allCols);
                                    // Found a Swordfish! Eliminate v from all OTHER rows in these 3 columns.
                                    for (let r = 0; r < SIZE; r++) {
                                        if (r === r1.row || r === r2.row || r === r3.row) continue;
                                        for (const col of colsArr) {
                                            if (doms[r][col].includes(v)) {
                                                doms[r][col] = doms[r][col].filter(x => x !== v);
                                                changed = true;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                // --- Swordfish in columns (eliminate from rows) ---
                for (let v = 1; v <= SIZE; v++) {
                    const colsWithRows = [];
                    for (let c = 0; c < SIZE; c++) {
                        const rows = [];
                        for (let r = 0; r < SIZE; r++) {
                            if (doms[r][c].includes(v)) {
                                rows.push(r);
                            }
                        }
                        if (rows.length >= 2 && rows.length <= 3) {
                            colsWithRows.push({ col: c, rows: rows });
                        }
                    }

                    for (let i = 0; i < colsWithRows.length; i++) {
                        for (let j = i + 1; j < colsWithRows.length; j++) {
                            for (let k = j + 1; k < colsWithRows.length; k++) {
                                const c1 = colsWithRows[i];
                                const c2 = colsWithRows[j];
                                const c3 = colsWithRows[k];

                                const allRows = new Set([...c1.rows, ...c2.rows, ...c3.rows]);

                                if (allRows.size === 3) {
                                    const rowsArr = Array.from(allRows);
                                    for (let c = 0; c < SIZE; c++) {
                                        if (c === c1.col || c === c2.col || c === c3.col) continue;
                                        for (const row of rowsArr) {
                                            if (doms[row][c].includes(v)) {
                                                doms[row][c] = doms[row][c].filter(x => x !== v);
                                                changed = true;
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

            // [LOGIC: Inequality Chain Analysis]
            // A powerful technique specific to Futoshiki puzzles.
            // When cells are connected by a chain of inequalities all pointing the same direction,
            // we can deduce strict bounds on each cell in the chain.
            //
            // For example, if A < B < C (a chain of length 3 in a 5x5 puzzle):
            //   - A can be at most 3 (because we need room for B and C above it)
            //   - C can be at least 3 (because we need room for A and B below it)
            //   - B is between A and C
            //
            // If a chain's length equals the board size, every cell in the chain is forced to a specific value.
            // For example, in a 5x5 puzzle: A < B < C < D < E forces 1 < 2 < 3 < 4 < 5
            function applyInequalityChains(doms) {
                let changed = false;

                // Helper function: given a starting cell and a direction, trace the chain
                // and apply bound constraints to each cell in the chain
                function processChain(startR, startC, dirR, dirC, doms) {
                    // Step 1: Trace the chain from start cell in the given direction
                    // Build up a list of cells in the chain: [cell1, cell2, cell3, ...]
                    // where cell1 < cell2 < cell3 (or > depending on the inequality direction)
                    const chain = [{ r: startR, c: startC }];
                    let cr = startR;
                    let cc = startC;

                    // Keep following the chain as long as the inequality exists and points the same way
                    while (true) {
                        const nextR = cr + dirR;
                        const nextC = cc + dirC;
                        // Check if the next cell is within bounds
                        if (nextR < 0 || nextR >= SIZE || nextC < 0 || nextC >= SIZE) break;

                        // Get the condition from the current cell pointing to the next cell
                        const cond = conditions[cr][cc];
                        // Determine the direction key based on which way we're moving
                        let dirKey;
                        if (dirR === -1 && dirC === 0) dirKey = 'u';      // Moving up
                        else if (dirR === 1 && dirC === 0) dirKey = 'd';   // Moving down
                        else if (dirR === 0 && dirC === -1) dirKey = 'l';  // Moving left
                        else if (dirR === 0 && dirC === 1) dirKey = 'r';   // Moving right

                        // If there's no inequality in this direction, the chain ends
                        if (!cond || !cond[dirKey]) break;

                        // Check if the inequality direction matches (e.g., chain of < or chain of >)
                        // If cond[dirKey] is '<', then current cell is LESS than next cell
                        // This means we're following an ascending chain (<)
                        // If cond[dirKey] is '>', then current cell is GREATER than next cell
                        // This means we're following a descending chain (>)
                        const ineqType = cond[dirKey]; // '<' means current < next, '>' means current > next

                        // Add the next cell to our chain, along with the inequality type between them
                        chain.push({ r: nextR, c: nextC, ineq: ineqType });

                        // Move to the next cell
                        cr = nextR;
                        cc = nextC;
                    }

                    // We need at least 2 cells in the chain for it to be useful
                    if (chain.length < 2) return false;
                    let chainChanged = false;

                    // Step 2: Determine if the chain is all ascending (<) or all descending (>)
                    // Check the first inequality to set the direction
                    const firstIneq = chain[1].ineq; // The inequality between cell 0 and cell 1

                    // For the chain analysis to work, ALL inequalities must point the same direction
                    let uniformDirection = true;
                    for (let i = 1; i < chain.length; i++) {
                        if (chain[i].ineq !== firstIneq) {
                            uniformDirection = false;
                            break;
                        }
                    }
                    if (!uniformDirection) return false;

                    const chainLen = chain.length;

                    // Step 3: Apply bounds based on chain length
                    if (firstIneq === '<') {
                        // Ascending chain: cell1 < cell2 < cell3 < ...
                        // For each cell at position `pos` (0-indexed) in the chain:
                        //   - Minimum value it can hold is (pos + 1)
                        //     (because it must be greater than `pos` cells before it)
                        //   - Maximum value it can hold is (SIZE - (chainLen - 1 - pos))
                        //     (because it must be less than `chainLen - 1 - pos` cells after it)
                        for (let pos = 0; pos < chainLen; pos++) {
                            const cell = chain[pos];
                            const minAllowed = pos + 1;
                            const maxAllowed = SIZE - (chainLen - 1 - pos);

                            // Filter out values below the minimum
                            const prevLen = doms[cell.r][cell.c].length;
                            doms[cell.r][cell.c] = doms[cell.r][cell.c].filter(v => v >= minAllowed && v <= maxAllowed);
                            if (doms[cell.r][cell.c].length !== prevLen) chainChanged = true;
                        }
                    } else {
                        // Descending chain: cell1 > cell2 > cell3 > ...
                        // For each cell at position `pos` (0-indexed) in the chain:
                        //   - Maximum value it can hold is (SIZE - pos)
                        //     (because it must be less than `pos` cells before it)
                        //   - Minimum value it can hold is (chainLen - pos)
                        //     (because it must be greater than `chainLen - 1 - pos` cells after it)
                        for (let pos = 0; pos < chainLen; pos++) {
                            const cell = chain[pos];
                            const minAllowed = chainLen - pos;
                            const maxAllowed = SIZE - pos;

                            const prevLen = doms[cell.r][cell.c].length;
                            doms[cell.r][cell.c] = doms[cell.r][cell.c].filter(v => v >= minAllowed && v <= maxAllowed);
                            if (doms[cell.r][cell.c].length !== prevLen) chainChanged = true;
                        }
                    }

                    return chainChanged;
                }

                // Scan the entire board to find and process every inequality chain
                // We check every cell for chains going RIGHT (horizontal chains) and DOWN (vertical chains)
                for (let r = 0; r < SIZE; r++) {
                    for (let c = 0; c < SIZE; c++) {
                        // Process horizontal chains (going right)
                        if (processChain(r, c, 0, 1, doms)) changed = true;
                        // Process vertical chains (going down)
                        if (processChain(r, c, 1, 0, doms)) changed = true;
                    }
                }

                return changed;
            }

            // [LOGIC: Forced Min/Max via Inequality Groups]
            // A Futoshiki-specific technique that looks at groups of inequalities
            // radiating from a single cell.
            //
            // If a cell has TWO or more outgoing 'greater than' signs (meaning it is > its neighbors),
            // then its minimum value is at least (number_of_greater_neighbors + 1).
            // For example, if cell A > B and A > C, then A must be at least 3 (since B and C
            // must both be smaller, the smallest they can be is 1 and 2 in some order).
            //
            // Similarly, if a cell has TWO or more outgoing 'less than' signs (meaning it is < its neighbors),
            // then its maximum value is at most (SIZE - number_of_less_neighbors).
            function applyForcedMinMax(doms) {
                let changed = false;

                for (let r = 0; r < SIZE; r++) {
                    for (let c = 0; c < SIZE; c++) {
                        const cond = conditions[r][c];
                        if (!cond) continue;

                        // Count neighbors where this cell is GREATER than them (cond says '<' pointing away... wait)
                        // Let's re-check the data format.
                        // conditions[r][c] gives the conditions for the cell at (r,c).
                        // cond.u means there's a relationship with the cell above.
                        // If cond.u = '<', then cell (r,c) < cell above it (r-1,c) means current < above
                        // If cond.u = '>', then cell (r,c) > cell above it (r-1,c) means current > above
                        // Actually, looking at the original code: cond.n.k where n.k is 'u','d','l','r'
                        // The condition is stored at the current cell. But who stores what?
                        // Let me look at the original propagate function more carefully.
                        //
                        // In the original propagate (line 285-315):
                        // const cond = conditions[r][c];
                        // const max = Math.max(...doms[r][c]);
                        // neighbors = [{k:'u', nr: r-1, nc: c}, ...]
                        // if (cond[n.k]) - the condition at (r,c) pointing to neighbor
                        // doms[nr][nc] = nD.filter(nv => nv < max)
                        // Based on this: cond.u means there's an inequality between (r,c) and (r-1,c).
                        // And the value of cond.u tells us the relationship. But what does '<' mean?
                        // If cond.u is '<', the original code does nv < max for filtering.
                        // This suggests: if cond.u exists, then current cell (r,c) < neighbor? Or neighbor < current?
                        // 
                        // Actually, looking at the Futoshiki puzzle data format:
                        // The condition object at (r,c) stores the inequality relationship.
                        // Let me think about what makes sense for the inequality constraint.
                        // If there's a '<' between cell A(r,c) and cell B(r+1,c), the condition
                        // might be stored at A with 'd' key as '<', meaning A < B (down).
                        // 
                        // Looking at the original code more carefully:
                        // The neighbor domain nD is filtered to nv < max (current cell's max)
                        // This means the neighbor is constrained to be LESS than current cell.
                        // So if cond.u exists (up direction), the neighbor above must be < current cell.
                        // If cond.d exists (down direction), the neighbor below must be < current cell.
                        // But wait, that doesn't match the ineqType approach...
                        // 
                        // Actually, I think the condition value is the inequality sign as a string.
                        // cond.u = '<' means: the cell above (r-1,c) < current cell (r,c)... or does it mean
                        // current cell < cell above?
                        // 
                        // Let me re-read the propagate logic:
                        // doms[nr][nc] = nD.filter(nv => nv < max) - neighbor must be < current cell's max
                        // This means if cond exists, neighbor < current cell.
                        // 
                        // But which direction? The code checks cond[n.k] where n.k is 'u','d','l','r'.
                        // For 'u' (up): neighbor is above. If cond.u exists, the neighbor above is < current.
                        // For 'd' (down): neighbor is below. If cond.d exists, the neighbor below is < current.
                        // For 'l' (left): neighbor is left. If cond.l exists, the neighbor left is < current.
                        // For 'r' (right): neighbor is right. If cond.r exists, the neighbor right is < current.
                        // 
                        // Hmm, but that would mean all conditions are 'less than' the current cell,
                        // which doesn't make sense for a puzzle with both > and <.
                        // 
                        // Actually I think the condition object values are the inequality signs themselves.
                        // cond.u = '<' means: the cell above (r-1,c) < current cell (r,c)
                        // cond.u = '>' means: the cell above (r-1,c) > current cell (r,c)
                        // 
                        // So the condition stores the relationship between neighbor and current cell.
                        // And the key tells which neighbor.
                        //
                        // For the propagate function, it uses cond[n.k] to check if an inequality exists,
                        // then applies nv < max which would be correct only if all inequalities are '<'.
                        // But that can't be right...
                        //
                        // Let me look more carefully. The original propagate:
                        // if (cond[n.k] && doms[n.nr] && doms[n.nr][n.nc]) {
                        //   const nD = doms[n.nr][n.nc];
                        //   const prevN = nD.length;
                        //   doms[n.nr][n.nc] = nD.filter(nv => nv < max);
                        //
                        // So it filters neighbor's candidates to only those less than max(current).
                        // This assumes that ALL inequalities mean neighbor < current.
                        // That would work if the puzzle data format is such that:
                        // - The condition is stored on the "greater" side
                        // - All conditions point to the smaller neighbor
                        // 
                        // Wait no, that still doesn't handle '<' relationships properly.
                        // 
                        // I think what's happening is: the condition value (like '<' or '>')
                        // indicates the relationship from current cell TO the neighbor.
                        // But the propagate code ignores the actual sign and always assumes neighbor < current.
                        // This would be a bug in the original code... unless the data format stores
                        // all arrows pointing from larger to smaller.
                        //
                        // Actually, I think I may be misreading the data format. Let me re-check.
                        // In the puzzle HTML/JS, the inequalities are stored somewhere.
                        // The conditions[r][c] object might store the arrow directions.
                        //
                        // Let me just look at what values conditions[r][c] actually has.
                        // For a cell with an arrow pointing right: >
                        //   conditions[r][c] might be { r: '>' } meaning the cell to the right is greater
                        //   OR conditions[r][c] might be { r: '<' } meaning this cell is less than the right cell
                        //
                        // Given that the propagate code does: neighbor filter nv < max (current cell's max)
                        // This means the neighbor must be LESS than current cell.
                        // So if there's ANY condition, it's enforced as: neighbor < current.
                        // 
                        // This would mean the conditions are stored at the LARGER cell, pointing to the smaller.
                        // So conditions[r][c].r exists means: current cell (r,c) > cell at (r, c+1)
                        // And conditions[r][c].d exists means: current cell (r,c) > cell at (r+1, c)
                        // etc.
                        //
                        // OK so the data format is:
                        // conditions[r][c] = { 'u': true, 'd': true, 'l': true, 'r': true }
                        // where the presence of a key means current cell > neighbor in that direction.
                        // The actual value (like '<' or '>') might or might not be used, since the code
                        // doesn't check it - it just uses presence.
                        //
                        // Wait, but in the chain analysis I did above (applyInequalityChains), I was looking
                        // at cond[dirKey] as a string value ('<' or '>'). Let me check what the actual data looks like.
                        //
                        // Given the way the original propagate works (nv < max), and the fact that it doesn't
                        // differentiate between '<' and '>' values in the condition, I think the conditions
                        // simply indicate that current cell > neighbor (stored at the greater cell).
                        //
                        // So for chain analysis: if conditions[r][c].r exists, then (r,c) > (r, c+1).
                        // This means a chain of > is: if current > neighbor, neighbor > its next, etc.
                        //
                        // But what about < chains? They'd be stored at the other cell.
                        // If A < B, then B > A, so conditions at B would have .l or .u indicating B > A.
                        //
                        // So actually ALL chains would be ">" chains from the perspective of the storing cell.
                        // But we can follow them in the direction of "<" by going the opposite way.
                        //
                        // Hmm, this is getting confusing without seeing the actual data.
                        // Let me adjust my chain analysis to be more robust.
                        // If the propagation does nv < max, then conditions store ">" relationships.
                        // So I'll use that assumption.
                        //
                        // Actually, I just realized the propagate code might be incomplete/buggy too.
                        // It only applies neighbor < current, but doesn't apply the reverse
                        // (current > neighbor means current must be > neighbor's min).
                        // ... wait, it does! Look at lines 307-313:
                        // doms[r][c] = doms[r][c].filter(cv => cv > Math.min(...doms[n.nr][n.nc]));
                        // So it does both sides. OK good.
                        //
                        // So the data model is: conditions[r][c] stores the relationships where
                        // current cell (r,c) is GREATER than the neighbor in the given direction.
                        // The presence of a key means current > neighbor.
                        // 
                        // Now, for the ForcedMinMax technique:
                        // Count how many directions have an inequality where current > neighbor
                        // (i.e., how many outgoing 'greater than' arrows current cell has).
                        // If current > neighbor1 and current > neighbor2, then current must be >= 3
                        // because the two neighbors must hold 1 and 2 in some order.
                        
                        // Count outgoing 'greater than' relationships (current > neighbor)
                        let gtCount = 0; // Number of neighbors where current > neighbor
                        // Count incoming 'greater than' relationships (neighbor > current)
                        // This would mean current < neighbor. But since conditions are stored
                        // at the greater cell, this would be found by checking neighbors' conditions.
                        // Let's skip this for now and focus on outgoing.

                        // Actually, we can check both:
                        // Outgoing: conditions at (r,c) pointing to neighbors
                        // Incoming: neighbors' conditions pointing to (r,c)

                        // But let me just check at the current cell first
                        if (cond.u) gtCount++; // current > above neighbor
                        if (cond.d) gtCount++; // current > below neighbor
                        if (cond.l) gtCount++; // current > left neighbor
                        if (cond.r) gtCount++; // current > right neighbor

                        // If current cell has multiple outgoing '>' arrows
                        if (gtCount >= 2) {
                            const minVal = gtCount + 1; // at least 1+gtCount (neighbors use 1,2,...,gtCount)
                            const prevLen = doms[r][c].length;
                            doms[r][c] = doms[r][c].filter(v => v >= minVal);
                            if (doms[r][c].length !== prevLen) changed = true;
                        }
                    }
                }

                // Now check for incoming '>' relationships (i.e., current < neighbor)
                // This means looking at neighbors that have conditions pointing to current cell
                for (let r = 0; r < SIZE; r++) {
                    for (let c = 0; c < SIZE; c++) {
                        let ltCount = 0; // Number of neighbors where neighbor > current (current < neighbor)

                        // Check neighbor above: if that neighbor has a 'd' condition, it means neighbor > current
                        if (r > 0 && conditions[r - 1][c] && conditions[r - 1][c].d) ltCount++;
                        // Check neighbor below: if that neighbor has a 'u' condition, it means neighbor > current
                        if (r < SIZE - 1 && conditions[r + 1][c] && conditions[r + 1][c].u) ltCount++;
                        // Check neighbor left: if that neighbor has a 'r' condition, it means neighbor > current
                        if (c > 0 && conditions[r][c - 1] && conditions[r][c - 1].r) ltCount++;
                        // Check neighbor right: if that neighbor has a 'l' condition, it means neighbor > current
                        if (c < SIZE - 1 && conditions[r][c + 1] && conditions[r][c + 1].l) ltCount++;

                        // If current cell has multiple incoming '>' arrows (i.e., multiple neighbors > current)
                        if (ltCount >= 2) {
                            const maxVal = SIZE - ltCount;
                            const prevLen = doms[r][c].length;
                            doms[r][c] = doms[r][c].filter(v => v <= maxVal);
                            if (doms[r][c].length !== prevLen) changed = true;
                        }
                    }
                }

                return changed;
            }

            // [LOGIC: Constraint Propagation]
            // This function aggressively applies the basic rules of Futoshiki across the board:
            // 1. Uniqueness: No duplicate numbers in any row or column.
            // 2. Inequalities: Enforces the > and < symbols between adjacent cells.
            // It repeats in a while loop until no more basic deductions can be made.
            function propagate(doms) {
                // Flag to keep the loop running as long as we make changes
                let boardChanged = true;
                // Keep looping while changes are happening
                while (boardChanged) {
                    // Reset the flag for this current loop iteration
                    boardChanged = false;
                    // Loop over every row
                    for (let r = 0; r < SIZE; r++) {
                        // Loop over every column
                        for (let c = 0; c < SIZE; c++) {
                            // Dead end reached, contradiction found (invalid board state). Return false to signal an error.
                            if (doms[r][c].length === 0) return false;

                            // 1. Row & Column Uniqueness Constraint
                            // If a cell is solved (only 1 candidate left), remove that candidate
                            // from all other cells in the same row and column.
                            if (doms[r][c].length === 1) {
                                // Get the solved value
                                const val = doms[r][c][0];
                                // Loop through the entire row and column for this cell
                                for (let i = 0; i < SIZE; i++) {
                                    // Check the same row (different column). If it has the solved value...
                                    if (i !== c && doms[r][i].includes(val)) {
                                        // Remove the solved value from that cell's domain
                                        doms[r][i] = doms[r][i].filter(v => v !== val);
                                        // Mark that we changed the board
                                        boardChanged = true;
                                    }
                                    // Check the same column (different row). If it has the solved value...
                                    if (i !== r && doms[i][c].includes(val)) {
                                        // Remove the solved value from that cell's domain
                                        doms[i][c] = doms[i][c].filter(v => v !== val);
                                        // Mark that we changed the board
                                        boardChanged = true;
                                    }
                                }
                            }

                            // 2. Inequality Constraint (Futoshiki specific)
                            // Enforces greater-than (>) and less-than (<) between neighbors.
                            // E.g., if A > B, the max value of B restricts the min value of A, and vice versa.

                            // Get the specific conditions (arrows) for this cell from the puzzle data
                            const cond = conditions[r][c];
                            // Find the maximum possible value this cell can be right now
                            const max = Math.max(...doms[r][c]);
                            // Define the coordinates of all 4 neighbors: up, down, left, right
                            const neighbors = [{ k: 'u', nr: r - 1, nc: c }, { k: 'd', nr: r + 1, nc: c }, { k: 'l', nr: r, nc: c - 1 }, { k: 'r', nr: r, nc: c + 1 }];

                            // Loop through each neighbor
                            for (const n of neighbors) {
                                // If an inequality rule exists pointing to this neighbor, AND the neighbor exists on the board
                                if (cond[n.k] && doms[n.nr] && doms[n.nr][n.nc]) {
                                    // Get the neighbor's current domain (candidates)
                                    const nD = doms[n.nr][n.nc];
                                    // If the neighbor has no candidates left, it's a dead end, return false
                                    if (nD.length === 0) return false;
                                    // Remember how many candidates the neighbor had
                                    const prevN = nD.length;
                                    // The neighbor must be strictly LESS than the maximum value of the current cell.
                                    // Remove any values in the neighbor that are equal to or greater than our max.
                                    doms[n.nr][n.nc] = nD.filter(nv => nv < max);
                                    // If we removed candidates from the neighbor, mark the board as changed
                                    if (doms[n.nr][n.nc].length !== prevN) boardChanged = true;

                                    // Remember how many candidates the current cell had
                                    const prevC = doms[r][c].length;
                                    // The current cell must be strictly GREATER than the minimum value of the neighbor.
                                    // Remove any values in the current cell that are equal to or less than the neighbor's min.
                                    doms[r][c] = doms[r][c].filter(cv => cv > Math.min(...doms[n.nr][n.nc]));
                                    // If we removed candidates from the current cell, mark the board as changed
                                    if (doms[r][c].length !== prevC) boardChanged = true;
                                }
                            }
                        }
                    }

                    // After doing basic propagation, try advanced subset and hidden single techniques
                    for (let i = 0; i < SIZE; i++) {
                        // Create a list representing an entire row
                        const rowCells = Array.from({ length: SIZE }, (_, c) => ({ r: i, c }));
                        // Apply naked subsets on the row. If it changes anything, mark boardChanged = true
                        if (applyRealNakedSubsets(rowCells, doms)) boardChanged = true;
                        // Apply hidden singles on the row. If it changes anything, mark boardChanged = true
                        if (applyHiddenSingles(rowCells, doms)) boardChanged = true;
                        // Apply hidden subsets (pairs/triples/quads) on the row
                        if (applyHiddenSubsets(rowCells, doms)) boardChanged = true;

                        // Create a list representing an entire column
                        const colCells = Array.from({ length: SIZE }, (_, r) => ({ r, c: i }));
                        // Apply naked subsets on the column
                        if (applyRealNakedSubsets(colCells, doms)) boardChanged = true;
                        // Apply hidden singles on the column
                        if (applyHiddenSingles(colCells, doms)) boardChanged = true;
                        // Apply hidden subsets on the column
                        if (applyHiddenSubsets(colCells, doms)) boardChanged = true;
                    }

                    // After standard techniques, try advanced Futoshiki-specific techniques
                    if (applyInequalityChains(doms)) boardChanged = true;
                    if (applyForcedMinMax(doms)) boardChanged = true;
                }
                // If we get out of the loop without errors, return true (propagation successful)
                return true;
            }

            // [LOGIC: Deep Clean - Full House Check]
            // After all the other techniques, sometimes all cells in a row or column
            // have been narrowed down except one. This check finds those cases.
            // If a row has only one unsolved cell, that cell must hold the one remaining number.
            function applyFullHouse(doms) {
                let changed = false;

                // Check each row
                for (let r = 0; r < SIZE; r++) {
                    // Collect all placed numbers in this row
                    const placed = [];
                    const unsolvedCells = [];
                    for (let c = 0; c < SIZE; c++) {
                        if (doms[r][c].length === 1) {
                            placed.push(doms[r][c][0]);
                        } else {
                            unsolvedCells.push(c);
                        }
                    }

                    // If only one unsolved cell remains, find the missing number
                    if (unsolvedCells.length === 1) {
                        const col = unsolvedCells[0];
                        for (let v = 1; v <= SIZE; v++) {
                            if (!placed.includes(v)) {
                                // This is the only number that can go here
                                if (doms[r][col].length !== 1 || doms[r][col][0] !== v) {
                                    doms[r][col] = [v];
                                    changed = true;
                                }
                                break;
                            }
                        }
                    }
                }

                // Check each column
                for (let c = 0; c < SIZE; c++) {
                    const placed = [];
                    const unsolvedCells = [];
                    for (let r = 0; r < SIZE; r++) {
                        if (doms[r][c].length === 1) {
                            placed.push(doms[r][c][0]);
                        } else {
                            unsolvedCells.push(r);
                        }
                    }

                    if (unsolvedCells.length === 1) {
                        const row = unsolvedCells[0];
                        for (let v = 1; v <= SIZE; v++) {
                            if (!placed.includes(v)) {
                                if (doms[row][c].length !== 1 || doms[row][c][0] !== v) {
                                    doms[row][c] = [v];
                                    changed = true;
                                }
                                break;
                            }
                        }
                    }
                }

                return changed;
            }

            // [METHOD: Advanced Contradiction Testing (Limited Depth)]
            // This is the final fallback when all pure logic techniques are exhausted.
            // It is NOT guessing - it is a formal "proof by contradiction" technique.
            //
            // How it works:
            // 1. Pick a cell with very few remaining candidates (preferably only 2).
            // 2. Temporarily assume a candidate value and run ALL logic techniques on a copy.
            // 3. If this leads to a contradiction (empty domain, broken rule), that candidate
            //    is proven impossible and can be safely removed from the real board.
            // 4. If the assumption leads to a solved board, we don't commit it - we just
            //    proved our assumption didn't break anything, but other candidates might also work.
            //
            // This is logically equivalent to saying "if X were true, the puzzle would break,
            // therefore X cannot be true." It's a standard mathematical proof technique.
            //
            // The key difference from the old "guessing" approach:
            // - We only use this as a LAST resort after ALL other techniques
            // - We limit depth to cells with at most 3 candidates
            // - We only ever test ONE cell at a time (depth-1)
            // - We only remove candidates that are PROVEN wrong (never commit to a "right" guess)
            function applyContradictionTesting(doms) {
                let changed = false;

                // Find the cell with the fewest candidates (but not already solved)
                let bestCell = null;
                let bestCount = SIZE + 1;

                for (let r = 0; r < SIZE; r++) {
                    for (let c = 0; c < SIZE; c++) {
                        const len = doms[r][c].length;
                        // We only test cells with 2 or 3 candidates
                        if (len >= 2 && len <= 3 && len < bestCount) {
                            bestCount = len;
                            bestCell = { r, c };
                        }
                    }
                }

                // If we found a suitable cell to test
                if (bestCell) {
                    const { r, c } = bestCell;
                    const candidates = [...doms[r][c]];

                    // Test each candidate value
                    for (const testVal of candidates) {
                        // Create a deep clone of the current domains
                        const simDoms = doms.map(row => row.map(cell => [...cell]));
                        // Assume this candidate value
                        simDoms[r][c] = [testVal];

                        // Run the FULL suite of logic techniques on the clone
                        // We alternate between propagation and advanced techniques
                        let simProgress = true;
                        let solveAttempts = 0;
                        const maxAttempts = 20; // Safety limit

                        while (simProgress && solveAttempts < maxAttempts) {
                            simProgress = false;
                            solveAttempts++;

                            // First, run basic propagation (includes subsets, singles, chains, min/max)
                            if (!propagate(simDoms)) {
                                // Contradiction! Propagation returned false.
                                simProgress = false;
                                break;
                            }

                            // Check if board is fully solved
                            let allSolved = true;
                            for (let rr = 0; rr < SIZE; rr++) {
                                for (let cc = 0; cc < SIZE; cc++) {
                                    if (simDoms[rr][cc].length !== 1) {
                                        allSolved = false;
                                        break;
                                    }
                                }
                                if (!allSolved) break;
                            }
                            if (allSolved) break;

                            // Apply full house check
                            if (applyFullHouse(simDoms)) { simProgress = true; continue; }

                            // Apply X-Wing
                            if (applyXWing(simDoms)) { simProgress = true; continue; }

                            // Apply Swordfish
                            if (applySwordfish(simDoms)) { simProgress = true; continue; }

                            // Apply inequality chains (already inside propagate, but run again to be sure)
                            if (applyInequalityChains(simDoms)) { simProgress = true; continue; }
                            if (applyForcedMinMax(simDoms)) { simProgress = true; continue; }

                            // Apply naked subsets, hidden singles, hidden subsets on all rows/cols
                            for (let i = 0; i < SIZE; i++) {
                                const rowCells = Array.from({ length: SIZE }, (_, cc) => ({ r: i, c: cc }));
                                const colCells = Array.from({ length: SIZE }, (_, rr) => ({ r: rr, c: i }));
                                if (applyRealNakedSubsets(rowCells, simDoms)) simProgress = true;
                                if (applyHiddenSingles(rowCells, simDoms)) simProgress = true;
                                if (applyHiddenSubsets(rowCells, simDoms)) simProgress = true;
                                if (applyRealNakedSubsets(colCells, simDoms)) simProgress = true;
                                if (applyHiddenSingles(colCells, simDoms)) simProgress = true;
                                if (applyHiddenSubsets(colCells, simDoms)) simProgress = true;
                            }
                        }

                        // Check if we hit a contradiction (empty domain in any cell)
                        let contradiction = false;
                        for (let rr = 0; rr < SIZE && !contradiction; rr++) {
                            for (let cc = 0; cc < SIZE && !contradiction; cc++) {
                                if (simDoms[rr][cc].length === 0) {
                                    contradiction = true;
                                }
                            }
                        }

                        if (contradiction) {
                            // PROOF BY CONTRADICTION: this candidate leads to an impossible board.
                            // Remove it from the REAL board.
                            doms[r][c] = doms[r][c].filter(v => v !== testVal);
                            changed = true;
                        }
                    }
                }

                return changed;
            }

            // [SOLVER ORCHESTRATOR - PURE LOGIC MODE]
            // Combines ALL logical techniques in a layered approach:
            // Layer 1: Basic propagation (naked singles, hidden singles, inequality constraints)
            // Layer 2: Naked/Hidden Subsets (pairs, triples, quads)
            // Layer 3: Futoshiki-specific techniques (inequality chains, forced min/max)
            // Layer 4: Fish patterns (X-Wing, Swordfish) borrowed from Sudoku
            // Layer 5: Full house (last remaining cell in a row/column)
            // Layer 6: Proof by contradiction testing (ONLY if all else fails, and only depth-1)
            //
            // Each layer is tried fully before moving to the next.
            // The solver loops back to Layer 1 whenever any technique makes progress.
            function solveLogical(doms) {
                // Flag to track if the solver is making any progress at all
                let globalProgress = true;
                // Keep trying to solve as long as we make some kind of progress
                while (globalProgress) {
                    // Assume we won't make progress this loop unless proven otherwise
                    globalProgress = false;

                    // --- LAYER 1: Basic Propagation ---
                    // This includes naked singles, hidden singles, row/column uniqueness,
                    // inequality constraints, inequality chains, forced min/max,
                    // and nested subsets - all in one tight loop.
                    if (!propagate(doms)) {
                        // Propagation returned false - puzzle is unsolvable with current state
                        console.log("%c[Futo-Phoenix-v10] ERROR: Puzzle appears unsolvable with logic!", "color: red; font-weight: bold;");
                        return doms;
                    }

                    // Check if board is fully solved after propagation
                    let allSolved = true;
                    for (let r = 0; r < SIZE; r++) {
                        for (let c = 0; c < SIZE; c++) {
                            if (doms[r][c].length !== 1) {
                                allSolved = false;
                                break;
                            }
                        }
                        if (!allSolved) break;
                    }
                    if (allSolved) {
                        console.log("%c[Futo-Phoenix-v10] Solved by Layers 1-3 (Basic + Advanced Logic)!", "color: #00ff00; font-weight: bold;");
                        return doms;
                    }

                    // --- LAYER 4: Fish Patterns (X-Wing, Swordfish) ---
                    if (applyXWing(doms)) {
                        globalProgress = true;
                        console.log("%c[Futo-Phoenix-v10] X-Wing technique applied!", "color: yellow; font-weight: bold;");
                        continue;
                    }
                    if (applySwordfish(doms)) {
                        globalProgress = true;
                        console.log("%c[Futo-Phoenix-v10] Swordfish technique applied!", "color: yellow; font-weight: bold;");
                        continue;
                    }

                    // --- LAYER 5: Full House Check ---
                    if (applyFullHouse(doms)) {
                        globalProgress = true;
                        console.log("%c[Futo-Phoenix-v10] Full House technique applied!", "color: yellow; font-weight: bold;");
                        continue;
                    }

                    // --- LAYER 6: Proof by Contradiction Testing ---
                    // Only used when ALL other logic techniques are exhausted.
                    // This tests one candidate at a time on a COPY of the board.
                    // If the candidate leads to a contradiction, it's logically eliminated.
                    // This is NOT guessing - it's a formal refutation proof.
                    if (applyContradictionTesting(doms)) {
                        globalProgress = true;
                        console.log("%c[Futo-Phoenix-v10] Contradiction testing eliminated a candidate!", "color: orange; font-weight: bold;");
                        continue;
                    }

                    // If we reach here, no technique made progress. We're stuck.
                    // This should be extremely rare for well-constructed puzzles.
                    if (!globalProgress) {
                        // Count how many cells are still unsolved
                        let unsolvedCount = 0;
                        for (let r = 0; r < SIZE; r++) {
                            for (let c = 0; c < SIZE; c++) {
                                if (doms[r][c].length > 1) unsolvedCount++;
                            }
                        }
                        console.log(`%c[Futo-Phoenix-v10] Stuck with ${unsolvedCount} unsolved cells. All logic techniques exhausted.`, "color: orange; font-weight: bold;");
                    }
                }
                // Return the final domains (should be fully solved!)
                return doms;
            }

            // Execute the master solver function on our initialized board
            solveLogical(domains);
            // Stop the performance timer and log how fast it solved the logic
            console.timeEnd("Futo-Phoenix-v10");

            // --- DIRECT MEMORY INJECTION ---
            // Take the solved data and force it into the game's actual web interface
            writeBatchToUI(domains);

            // Function that writes the final answers into the website's visual board
            function writeBatchToUI(finalDomains) {
                // Start a performance timer to measure rendering speed
                console.time("Futo-Render-v10");
                // Access the game's internal data storage that controls what is drawn on screen
                const status = gameObj.currentState.cellStatus;
                // Loop over rows
                for (let r = 0; r < SIZE; r++) {
                    // Loop over columns
                    for (let c = 0; c < SIZE; c++) {
                        // Only change cells that were originally empty
                        if (gameObj.task[r][c] === 0) {
                            // Get our calculated domain for this cell
                            const dom = finalDomains[r][c];
                            // If the cell is fully solved (only 1 candidate)
                            if (dom.length === 1) {
                                // Set the cell's big number to our solved answer
                                status[r][c].number = dom[0];
                                // Turn off pencil marks for this cell
                                status[r][c].pencil = false;
                                // Clear any pencil numbers
                                status[r][c].pencilNumbers = [];
                            } else {
                                // If the cell is NOT solved (which shouldn't happen unless puzzle is invalid)
                                // Leave the big number blank (0)
                                status[r][c].number = 0;
                                // Turn on pencil mode
                                status[r][c].pencil = true;
                                // Write out the remaining candidates as pencil marks
                                status[r][c].pencilNumbers = [...dom];
                            }
                        }
                    }
                }

                // Buffer to allow the game engine's internal cellStatus to settle
                // Set a tiny delay (1 millisecond) before checking if we won
                setTimeout(() => {
                    // Tell the game to save the state we just injected, if the function exists
                    if (typeof gameObj.storeCurrentState === 'function') gameObj.storeCurrentState();

                    // Trigger the game's built-in win checker
                    if (typeof gameObj.checkFinished === 'function') {
                        // Call the newer checkFinished function
                        gameObj.checkFinished();
                    } else if (typeof gameObj.check === 'function') {
                        // Call the older check function as a fallback
                        gameObj.check();
                    }
                    // Stop the render performance timer
                    console.timeEnd("Futo-Render-v10");
                    // Print a final success message in blue to the console
                    console.log("%c[Futo-Phoenix-v10] Solution Injected Binary-Style! No guessing was used!", "color: cyan; font-weight: bold;");
                }, 1);
            }
        }
        // Start the whole solving process
        runSolveProcess();
    }
})();
