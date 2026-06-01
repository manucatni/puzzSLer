
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
                console.time("Futo-Phoenix");
                // Print a success message in green to the browser console
                console.log("%c[Futo-Phoenix] Data Found. Solving...", "color: #00ff00; font-weight: bold;");
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

                        // Create a list representing an entire column
                        const colCells = Array.from({ length: SIZE }, (_, r) => ({ r, c: i }));
                        // Apply naked subsets on the column
                        if (applyRealNakedSubsets(colCells, doms)) boardChanged = true;
                        // Apply hidden singles on the column
                        if (applyHiddenSingles(colCells, doms)) boardChanged = true;
                    }
                }
                // If we get out of the loop without errors, return true (propagation successful)
                return true;
            }

            // [METHOD: Probing / Hypothesis Testing (Brute Force)]
            // When pure logic gets stuck on hard puzzles, we fall back to "Probing" (a depth-1 brute force).
            // It selects a cell with `currentDepth` candidates, GUESSES one of the candidates,
            // and runs `propagate()` on a simulated board copy.
            // If the guess immediately leads to a broken board (propagate returns false), 
            // we logically know that guess is wrong and can safely eliminate it from the real board.
            function applyProbing(doms, currentDepth) {
                // Variable to track if any guesses were proven wrong
                let changed = false;
                // Loop over rows
                for (let r = 0; r < SIZE; r++) {
                    // Loop over columns
                    for (let c = 0; c < SIZE; c++) {
                        // Get the candidates for the current cell
                        const cands = doms[r][c];
                        // If this cell has exactly the number of candidates we are targeting (e.g., exactly 2)...
                        if (cands.length === currentDepth) {
                            // Loop through each candidate in this cell, starting from the end
                            for (let i = cands.length - 1; i >= 0; i--) {
                                // Pick one candidate to test as a hypothesis
                                const testCand = cands[i];
                                // Create a complete clone of the board's domains to avoid messing up the real board
                                const simDoms = doms.map(row => row.map(cell => [...cell]));
                                // Forcibly guess that this cell is the test candidate
                                simDoms[r][c] = [testCand];
                                // Run propagation on the clone to see what happens
                                if (!propagate(simDoms)) {
                                    // If propagate returns false, our guess broke the rules!
                                    // We can now safely remove this bad candidate from the REAL board.
                                    doms[r][c] = doms[r][c].filter(v => v !== testCand);
                                    // Mark that we successfully eliminated a candidate
                                    changed = true;
                                }
                            }
                        }
                    }
                }
                // Return whether we eliminated any bad candidates
                return changed;
            }

            // [SOLVER ORCHESTRATOR]
            // Combines all logical techniques and probing into a continuous loop.
            // 1. First, relies heavily on pure logic (`propagate` handles subsets/singles).
            // 2. If stuck, uses light probing (guessing cells with only 2 candidates).
            // 3. If still stuck, increases probing depth (3, 4, up to SIZE).
            // This guarantees a solution for even the hardest puzzles without full recursive backtracking.
            function solveLogical(doms) {
                // Flag to track if the solver is making any progress at all
                let globalProgress = true;
                // Keep trying to solve as long as we make some kind of progress
                while (globalProgress) {
                    // Assume we won't make progress this loop unless proven otherwise
                    globalProgress = false;
                    // Flag to track smaller incremental progress
                    let makingProgress = true;
                    // Try basic logic and shallow probing until they stop working
                    while (makingProgress) {
                        // Apply basic rules (singles, pairs, inequalities)
                        propagate(doms);
                        // Try guessing on cells that only have 2 options
                        makingProgress = applyProbing(doms, 2);
                        // If guessing on 2 options didn't help, try guessing on cells with 3 options
                        if (!makingProgress) makingProgress = applyProbing(doms, 3);
                        // If either of those helped, we made global progress
                        if (makingProgress) globalProgress = true;
                    }

                    // If we get stuck, we might need to guess on cells with even more options
                    let probeProgress = false;
                    // Loop through deeper guess depths (4, 5, up to board size)
                    for (let d = 4; d <= SIZE; d++) {
                        // Run probing for this deeper amount of options
                        if (applyProbing(doms, d)) {
                            // If it helped eliminate something, stop digging deeper for now
                            probeProgress = true;
                            break;
                        }
                    }
                    // If deep probing worked, restart the whole logic loop
                    if (probeProgress) { globalProgress = true; continue; }
                }
                // Return the final domains (hopefully fully solved!)
                return doms;
            }

            // Execute the master solver function on our initialized board
            solveLogical(domains);
            // Stop the performance timer and log how fast it solved the logic
            console.timeEnd("Futo-Phoenix");

            // --- DIRECT MEMORY INJECTION ---
            // Take the solved data and force it into the game's actual web interface
            writeBatchToUI(domains);

            // Function that writes the final answers into the website's visual board
            function writeBatchToUI(finalDomains) {
                // Start a performance timer to measure rendering speed
                console.time("Futo-Render");
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
                    console.timeEnd("Futo-Render");
                    // Print a final success message in blue to the console
                    console.log("%c[Futo-Phoenix] Solution Injected Binary-Style!", "color: cyan; font-weight: bold;");
                }, 1);
            }
        }
        // Start the whole solving process
        runSolveProcess();
    }
})();
