const uPlot = require('uplot');
const Papa = require('papaparse');
const { ipcRenderer } = require('electron');

let chart;
let columns = [];
let uData = [];

// 1. CSV 로드 및 파싱 (지수 표기법 대응)
document.getElementById('loadBtn').onclick = async () => {
    const filePath = await ipcRenderer.invoke('open-file');
    if (!filePath) return;

    document.getElementById('status').innerText = "데이터 분석 중...";
    
    Papa.parse(filePath, {
        worker: true, header: true, dynamicTyping: false, skipEmptyLines: true,
        complete: function(results) {
            const rows = results.data;
            columns = Object.keys(rows[0]);
            
            uData = [new Float64Array(rows.length)];
            for (let j = 1; j < columns.length; j++) uData.push(new Float64Array(rows.length));

            rows.forEach((row, i) => {
                const ts = new Date(row[columns[0]]).getTime() / 1000;
                uData[0][i] = isNaN(ts) ? i : ts;
                for (let j = 1; j < columns.length; j++) {
                    const val = Number(row[columns[j]]); // 정밀도 유지
                    uData[j][i] = isNaN(val) ? 0 : val;
                }
            });

            createSidebar();
            renderChart();
        }
    });
};

// 2. 차트 생성
function renderChart() {
    if (chart) chart.destroy();
    const container = document.getElementById('chart-area');

    const opts = {
        width: container.offsetWidth - 20,
        height: container.offsetHeight - 100, // 고정 라벨 공간 확보
        cursor: { 
            drag: { setScale: true },
            points: { size: 10, fill: "#000" } // 마우스 오버 시 강조점
        },
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
                width: 1.5,
                // 지수 표기법 적용
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
                    // 우클릭: View All (줌 초기화)
                    u.over.oncontextmenu = e => {
                        e.preventDefault();
                        u.setData(u.data, true);
                        return false;
                    };
                    // 왼쪽 클릭: 데이터 고정 (Pinned Data)
                    u.over.onclick = e => {
                        const { idx } = u.cursor;
                        if (idx != null) {
                            updatePinnedData(u, idx);
                        }
                    };
                }
            ]
        }
    };

    chart = new uPlot(opts, uData, container);
}

// 3. 데이터 고정 표시 함수
function updatePinnedData(u, idx) {
    const pinnedArea = document.getElementById('pinned-data');
    const dateStr = new Date(u.data[0][idx] * 1000).toLocaleString();
    
    let html = `<strong>📍 고정된 시점: ${dateStr}</strong><br><div style="display:flex; flex-wrap:wrap; gap:10px; margin-top:5px;">`;
    
    u.series.forEach((s, i) => {
        if (i > 0 && s.show) {
            const val = u.data[i][idx];
            const valStr = Math.abs(val) < 0.001 && val !== 0 ? val.toExponential(4) : val.toFixed(6);
            html += `<span style="background:#eee; padding:2px 6px; border-radius:3px; border-left:4px solid ${s.stroke}">
                        ${s.label}: <strong>${valStr}</strong>
                     </span>`;
        }
    });
    html += `</div>`;
    pinnedArea.innerHTML = html;
}

// 4. 사이드바 (흰색 단색 처리)
function createSidebar() {
    const container = document.getElementById('legend-container');
    container.innerHTML = '';
    columns.slice(1).forEach((name, i) => {
        const div = document.createElement('div');
        div.className = 'col-item';
        div.innerHTML = `<input type="checkbox" id="ch-${i}" class="col-ch">
                         <label for="ch-${i}">${name}</label>`;
        container.appendChild(div);
    });

    document.querySelectorAll('.col-ch').forEach((cb, i) => {
        cb.onchange = () => {
            chart.setSeries(i + 1, { show: cb.checked });
            chart.setData(chart.data, true); // Autoscale 적용
        };
    });
}

// 전체 선택/해제
document.getElementById('allBtn').onclick = () => setAllStates(true);
document.getElementById('noneBtn').onclick = () => setAllStates(false);

function setAllStates(state) {
    document.querySelectorAll('.col-ch').forEach((cb, i) => {
        cb.checked = state;
        chart.setSeries(i + 1, { show: state });
    });
    chart.setData(chart.data, true);
}
