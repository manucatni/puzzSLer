/**
 * Bimaru Dashboard Controller (v10.0 Compatible)
 * Directly interacts with map.html UI and battleSLVer v10.0 class
 */

let taskStr = "3,5,2,3,2,3,1,2,0,0,6,1,4,2,1,0,6,0,4,4,1,2,3,2,1,1,5,3,1,2;zu4z4j2g1w0g5t1v2a4i5k4k3s";
let solver = null;
let counts = { reset: 0, Basic: 0, Hardening: 0, Diagonals: 0, Caps: 0, QuotaWater: 0, QuotaShips: 0, ScarcityWater: 0, ScarcityShips: 0, ExtendFullInventory: 0, CandidateScanner: 0, 8: 0 };
let originalLog = console.log;
let originalWarn = console.warn;
let originalErr = console.error;

function init() {
    const taskInput = document.getElementById('task-input');
    if (taskInput) taskInput.value = taskStr;
    const parts = taskStr.split(';');
    const clues = parts[0].split(',').map(Number);
    const size = clues.length / 2;
    // Mathematical Fleet Generator: 1 of size K, 2 of size K-1 ... K of size 1
    const fleet = {};
    let maxK = Math.floor(size / 5) + 2;
    if (size === 20) maxK = 7;
    if (size === 25) maxK = 8;
    if (size === 30) maxK = 9;
    for (let i = 1; i <= maxK; i++) fleet[i] = (maxK - i + 1);

    // Callback that allows the solver to increment UI counts from internal auto-loops
    const counterCb = (ruleLabel) => {
        if (counts[ruleLabel] !== undefined) {
            counts[ruleLabel]++;
            const span = document.getElementById(`count-${ruleLabel}`);
            if (span) span.textContent = counts[ruleLabel];
        }
    };

    solver = new window.BimaruSolver(taskStr, fleet, size, null, counterCb);

    // Setup Consoles
    const logOutput = document.getElementById('log-output');
    const logWriter = (msg, type) => {
        const entry = document.createElement('div');
        entry.className = 'log-entry ' + (type === 'err' ? 'log-err' : (type === 'warn' ? 'log-warn' : (msg.includes('[Rule') ? 'log-rule' : '')));
        entry.textContent = msg;
        logOutput.appendChild(entry);
        logOutput.scrollTop = logOutput.scrollHeight;
    };

    console.log = (...a) => { originalLog(...a); logWriter(a.map(x => String(x)).join(' '), 'info'); };
    console.warn = (...a) => { originalWarn(...a); logWriter(a.join(' '), 'warn'); };
    console.error = (...a) => { originalErr(...a); logWriter(a.join(' '), 'err'); };

    console.log(`[Bimaru] v10.0 Debugger Ready. Task: ${taskStr}`);
    render();
}

function render() {
    const board = document.getElementById('board-container');
    const inv = document.getElementById('inventory-list');
    if (!solver) return;

    // 0. Violation Check
    const vls = solver.checkViolations();

    // 1. Grid Rendering (Dashboard Look)
    const size = solver.size;
    const grid = solver.grid;
    const symClasses = { 0: 'bg-empty', 1: 'bg-ship ship', 2: 'bg-water', 3: 'bg-ship ship', 4: 'bg-ship ship', 5: 'bg-ship ship', 6: 'bg-ship ship', 7: 'bg-ship ship', 8: 'bg-ship ship' };
    const shapes = { 3: 'top', 4: 'bot', 5: 'left', 6: 'right', 7: 'mid', 8: 'sub', 1: 'square' };

    let html = "<table><tr><th></th><th></th>";
    for (let c = 0; c < size; c++) {
        let cls = vls.cols.includes(c) ? "idx c-clue violation" : "idx c-clue";
        html += `<th class="${cls}">${c}</th>`;
    }
    html += "<th>REM</th></tr><tr><th></th><th></th>";
    for (let c = 0; c < size; c++) {
        let cls = vls.cols.includes(c) ? "c-clue violation" : "c-clue";
        html += `<th class="${cls}">${solver.colClues[c]}</th>`;
    }
    html += "<th></th></tr>";

    for (let r = 0; r < size; r++) {
        let rCls = vls.rows.includes(r) ? "r-clue-left violation" : "r-clue-left";
        let rCount = 0; for (let j = 0; j < size; j++) if (solver.isShip(grid[r][j])) rCount++;
        let rRem = solver.rowClues[r] - rCount;

        html += `<tr><th class="idx">${r}</th><td class="${rCls}">${solver.rowClues[r]}</td>`;
        for (let c = 0; c < size; c++) {
            let v = grid[r][c];
            let isGiven = solver.givens[r][c];
            let cls = "cell " + symClasses[v];
            let dot = (v === 1 || v >= 3) ? `<div class="shape ${shapes[v] || 'square'}">${isGiven ? '<div class="inner-dot"></div>' : ''}</div>` : "";
            html += `<td><div class="${cls}">${dot}</div></td>`;
        }
        html += `<td class="idx ${rRem < 0 ? 'violation' : ''}">${rRem}</td></tr>`;
    }

    // Bottom "REM" row
    html += "<tr><th></th><th>REM</th>";
    for (let c = 0; c < size; c++) {
        let cCount = 0; for (let i = 0; i < size; i++) if (solver.isShip(grid[i][c])) cCount++;
        let cRem = solver.colClues[c] - cCount;
        html += `<td class="idx ${cRem < 0 ? 'violation' : ''}">${cRem}</td>`;
    }
    html += "<th></th></tr></table>";
    board.innerHTML = html;

    // 2. Ship Inventory Rendering
    const completed = solver.getCompletedCounts();
    let invHtml = "";
    const fleetEntries = Object.entries(solver.fleet).sort((a, b) => b[0] - a[0]);
    for (let [sz, total] of fleetEntries) {
        let found = completed[sz] || 0;
        let vCls = vls.fleet.includes(Number(sz)) ? "inventory-label violation" : "inventory-label";
        invHtml += `<div class="inventory-row"><div class="${vCls}">${sz}</div><div class="ship-boxes">`;
        for (let i = 0; i < total; i++) {
            invHtml += `<div class="ship-box ${i < found ? 'found' : ''}">${i < found ? '✓' : ''}</div>`;
        }
        invHtml += `</div></div>`;
    }
    inv.innerHTML = invHtml;

    // 3. Update Global Counters
    for (let key in counts) {
        const span = document.getElementById(`count-${key}`);
        if (span) span.textContent = counts[key];
    }
}

function runRule(type) {
    if (!solver) return;
    let changed = false;

    try {
        // Explicitly call the cascading autoSolve up to this level
        if (['Diagonals', 'Caps', 'Hardening', 'QuotaWater', 'QuotaShips', 'ScarcityWater', 'ScarcityShips', 'ExtendFullInventory', '8'].includes(type)) {
            changed = solver.autoSolve(type === 'Hardening' ? 'All' : type);
        }
        else if (type === 'CandidateScanner') {
            solver.applyRule_CandidateScanner();
            counts[type]++;
            console.log("[CandidateScanner] Scan Complete. Check console for details.");
            render();
            return;
        }
        else if (type === 'Basic') {
            changed = solver.applyBasicFill();
        }
        else if (type === 7) changed = solver.applyRule7();
        else if (type === 12) changed = solver.applyFleetDFS();

        if (changed) {
            counts[type]++;
            console.log(`[Rule ${type}] Success! Board updated.`);
        } else {
            console.warn(`[Rule ${type}] No NEW finds.`);
        }
    } catch (e) {
        console.error(`[Error] ${e.message}`);
    }
    render();
}

function loadNewTask() {
    const taskInput = document.getElementById('task-input');
    if (taskInput && taskInput.value.trim() !== '') {
        taskStr = taskInput.value.trim();
        counts = { reset: 0, Basic: 0, Hardening: 0, Diagonals: 0, Caps: 0, QuotaWater: 0, QuotaShips: 0, ScarcityWater: 0, ScarcityShips: 0, ExtendFullInventory: 0, CandidateScanner: 0, 8: 0 };
        clearLogs();
        init();
    }
}

function resetSolver() {
    counts = { reset: counts.reset + 1, Basic: 0, Hardening: 0, Diagonals: 0, Caps: 0, QuotaWater: 0, QuotaShips: 0, ScarcityWater: 0, ScarcityShips: 0, ExtendFullInventory: 0, CandidateScanner: 0, 8: 0 };
    init();
}

function solveAll() {
    try {
        solver.autoSolve();
    } catch (e) {
        console.error(`[AutoSolve Error] ${e.message}`);
    }
    render();
}

function clearLogs() {
    document.getElementById('log-output').innerHTML = "";
}

window.onload = init;
