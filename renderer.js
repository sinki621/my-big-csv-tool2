const uPlot = require('uplot');
const fs = require('fs');
const readline = require('readline');
const { ipcRenderer } = require('electron');

let chart;
let columns = [];
let uData = [];

// 1. 최고속 스트림 로더
document.getElementById('loadBtn').onclick = async () => {
    const filePath = await ipcRenderer.invoke('open-file');
    if (!filePath) return;

    const statusLabel = document.getElementById('status');
    statusLabel.innerText = "Loading...";
    
    // 이전 데이터 해제
    uData = [];
    if (chart) chart.destroy();

    const instream = fs.createReadStream(filePath);
    const rl = readline.createInterface({ input: instream, terminal: false });

    let isFirstLine = true;
    let rowCount = 0;
    
    // 데이터 저장을 위한 임시 일반 배열 (TypedArray로 최종 변환 전 사용)
    let tempX = [];
    let tempY = [];

    rl.on('line', (line) => {
        const parts = line.split(',');
        if (isFirstLine) {
            columns = parts;
            isFirstLine = false;
            // Y축 개수만큼 배열 생성
            for (let j = 1; j < columns.length; j++) tempY.push([]);
            return;
        }

        // X축 시간 처리
        const ts = new Date(parts[0]).getTime() / 1000;
        tempX.push(isNaN(ts) ? rowCount : ts);
        
        // Y축 데이터 (숫자 변환 속도 최적화)
        for (let j = 1; j < columns.length; j++) {
            tempY[j-1].push(Number(parts[j]) || 0);
        }
        
        rowCount++;
        if (rowCount % 100000 === 0) {
            statusLabel.innerText = `${rowCount.toLocaleString()} Loading...`;
        }
    });

    rl.on('close', () => {
        statusLabel.innerText = "메모리 최적화 중...";
        
        // 최종적으로 TypedArray로 변환 (차트 렌더링 속도 핵심)
        uData = [new Float64Array(tempX)];
        for (let j = 0; j < tempY.length; j++) {
            uData.push(new Float64Array(tempY[j]));
        }
        
        // 임시 배열 해제 (메모리 확보)
        tempX = null;
        tempY = null;

        createSidebar();
        renderChart();
        statusLabel.innerText = `${rowCount.toLocaleString()} Row Loaded`;
    });
};

// 2. 차트 렌더링 (이전 기능 통합: 지수 표기법, Pin, 우클릭 초기화)
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
            { label: "Time" },
            ...columns.slice(1).map((name, i) => ({
                label: name,
                show: false,
                stroke: `hsl(${(i * 137.5) % 360}, 70%, 50%)`,
                width: 1,
                value: (u, v) => v == null ? "-" : (Math.abs(v) < 0.001 && v !== 0 ? v.toExponential(4) : v.toFixed(6))
            }))
        ],
        axes: [
            { space: 80 },
            { values: (u, vals) => vals.map(v => Math.abs(v) < 0.001 && v !== 0 ? v.toExponential(1) : v.toFixed(4)) }
        ],
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

// 3. 기존 UI 제어 함수들 (Pinned Data, Sidebar 등 동일)
function updatePinnedData(u, idx) {
    const pinnedArea = document.getElementById('pinned-data');
    const dateStr = new Date(u.data[0][idx] * 1000).toLocaleString();
    let html = `<strong>📍 고정 시점: ${dateStr}</strong><br><div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:5px;">`;
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
