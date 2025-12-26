const uPlot = require('uplot');
const fs = require('fs');
const readline = require('readline');
const { ipcRenderer } = require('electron');

let chart;
let columns = [];
let uData = [];

// 1. High-speed Stream Loader
document.getElementById('loadBtn').onclick = async () => {
    const filePath = await ipcRenderer.invoke('open-file');
    if (!filePath) return;

    const statusLabel = document.getElementById('status');
    statusLabel.innerText = "Loading..";
    
    uData = [];
    if (chart) chart.destroy();

    const instream = fs.createReadStream(filePath);
    const rl = readline.createInterface({ input: instream, terminal: false });

    let isFirstLine = true;
    let rowCount = 0;
    let tempX = [];
    let tempY = [];

    rl.on('line', (line) => {
        const parts = line.split(',');
        if (isFirstLine) {
            columns = parts;
            isFirstLine = false;
            for (let j = 1; j < columns.length; j++) tempY.push([]);
            return;
        }

        const ts = new Date(parts[0]).getTime() / 1000;
        tempX.push(isNaN(ts) ? rowCount : ts);
        
        for (let j = 1; j < columns.length; j++) {
            tempY[j-1].push(Number(parts[j]) || 0);
        }
        rowCount++;
    });

    rl.on('close', () => {
        uData = [new Float64Array(tempX)];
        for (let j = 0; j < tempY.length; j++) {
            uData.push(new Float64Array(tempY[j]));
        }
        tempX = null;
        tempY = null;

        createSidebar();
        renderChart();
        statusLabel.innerText = `Total: ${rowCount.toLocaleString()} rows`;
    });
};

// 2. Wheel Zoom Plugin
function wheelZoomPlugin() {
    return {
        hooks: {
            init: u => {
                u.over.addEventListener("wheel", e => {
                    e.preventDefault();
                    const {left, width} = u.bbox;
                    const xVal = u.posToVal(e.clientX - u.over.getBoundingClientRect().left, "x");
                    const oxRange = u.scales.x.max - u.scales.x.min;
                    const zoom = e.deltaY < 0 ? 0.75 : 1.25;
                    const nxRange = oxRange * zoom;
                    const nxMin = xVal - (xVal - u.scales.x.min) * zoom;
                    const nxMax = nxMin + nxRange;
                    u.batch(() => {
                        u.setScale("x", { min: nxMin, max: nxMax });
                    });
                });
            }
        }
    };
}

// 3. Render Chart
function renderChart() {
    const container = document.getElementById('chart-area');
    const opts = {
        width: container.offsetWidth - 20,
        height: container.offsetHeight - 110,
        cursor: { drag: { setScale: true }, points: { size: 8, fill: "#000" } },
        scales: { 
            x: { time: true, auto: true }, 
            y: { auto: true, range: (u, min, max) => [min * 0.9, max * 1.1] } 
        },
        series: [
            { 
                label: "Time",
                value: (u, v) => v == null ? "-" : new Date(v * 1000).toLocaleTimeString('en-GB', { hour12: false })
            },
            ...columns.slice(1).map((name, i) => ({
                label: name,
                show: false,
                stroke: `hsl(${(i * 137.5) % 360}, 70%, 50%)`,
                width: 1,
                value: (u, v) => v == null ? "-" : (Math.abs(v) < 0.001 && v !== 0 ? v.toExponential(4) : v.toFixed(6))
            }))
        ],
        axes: [
            { 
                space: 80,
                values: [
                    [3600 * 24, "{YYYY}-{MM}-{DD}", null, null, null, null, null, null, 1],
                    [3600, "{HH}:{mm}", null, null, null, null, null, null, 1],
                    [1, "{HH}:{mm}:{ss}", null, null, null, null, null, null, 1],
                ]
            },
            { values: (u, vals) => vals.map(v => Math.abs(v) < 0.001 && v !== 0 ? v.toExponential(1) : v.toFixed(4)) }
        ],
        plugins: [wheelZoomPlugin()],
        hooks: {
            init: [
                u => {
                    u.over.oncontextmenu = e => { e.preventDefault(); u.setData(u.data, true); return false; };
                    u.over.onclick = e => { if (u.cursor.idx != null) updatePinnedData(u, u.cursor.idx); };
                }
            ]
        }
    };
    chart = new uPlot(opts, uData, container);
}

function updatePinnedData(u, idx) {
    const pinnedArea = document.getElementById('pinned-data');
    const dateStr = new Date(u.data[0][idx] * 1000).toLocaleString('en-GB', { hour12: false });
    let html = `<strong>📍 Marked Value: ${dateStr}</strong><br><div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:5px;">`;
    u.series.forEach((s, i) => {
        if (i > 0 && s.show) {
            const val = u.data[i][idx];
            const valStr = Math.abs(val) < 0.001 && val !== 0 ? val.toExponential(4) : val.toFixed(6);
            html += `<span style="background:#eee; padding:2px 6px; border-radius:3px; border-left:4px solid ${s.stroke}; font-size:11px;">${s.label}: <strong>${valStr}</strong></span>`;
        }
    });
    pinnedArea.innerHTML = html + `</div>`;
}

function createSidebar() {
    const container = document.getElementById('legend-container');
    container.innerHTML = '';
    columns.slice(1).forEach((name, i) => {
        const div = document.createElement('div');
        div.className = 'col-item';
        div.innerHTML = `<input type="checkbox" id="ch-${i}" class="col-ch"><label for="ch-${i}">${name}</label>`;
        container.appendChild(div);
    });
    document.querySelectorAll('.col-ch').forEach((cb, i) => {
        cb.onchange = () => {
            chart.setSeries(i + 1, { show: cb.checked });
            chart.setData(chart.data, true);
        };
    });
}

document.getElementById('allBtn').onclick = () => setAllStates(true);
document.getElementById('noneBtn').onclick = () => setAllStates(false);
function setAllStates(state) {
    document.querySelectorAll('.col-ch').forEach((cb, i) => {
        cb.checked = state;
        chart.setSeries(i + 1, { show: state });
    });
    chart.setData(chart.data, true);
}
