const uPlot = require('uplot');
const Papa = require('papaparse');
const { ipcRenderer } = require('electron');

let chart;
let columns = [];
let uData = [];

// 1. 고속 데이터 로딩 및 파싱 (Web Worker 활용)
document.getElementById('loadBtn').onclick = async () => {
    const filePath = await ipcRenderer.invoke('open-file');
    if (!filePath) return;

    const statusLabel = document.getElementById('status');
    statusLabel.innerText = "데이터 고속 분석 중 (Web Worker)...";
    
    // UI 스레드 방해를 최소화하기 위해 worker: true 설정
    Papa.parse(filePath, {
        worker: true, 
        header: true, 
        skipEmptyLines: true,
        chunkSize: 1024 * 1024 * 5, // 5MB 단위로 끊어서 읽기 (메모리 효율)
        complete: function(results) {
            const rows = results.data;
            if (rows.length === 0) return;
            
            columns = Object.keys(rows[0]);
            
            // 메모리 효율을 위해 TypedArray(Float64Array) 미리 할당
            uData = [new Float64Array(rows.length)];
            for (let j = 1; j < columns.length; j++) {
                uData.push(new Float64Array(rows.length));
            }

            // 고속 루프: Number() 변환 오버헤드 최소화
            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                const ts = new Date(row[columns[0]]).getTime() / 1000;
                uData[0][i] = isNaN(ts) ? i : ts;
                
                for (let j = 1; j < columns.length; j++) {
                    const val = Number(row[columns[j]]);
                    uData[j][i] = isNaN(val) ? 0 : val;
                }
            }

            createSidebar();
            renderChart();
            statusLabel.innerText = `${rows.length.toLocaleString()} 행 로드 완료`;
        }
    });
};

// 2. 차트 렌더링 엔진 (지수 표기법 및 인터랙션 포함)
function renderChart() {
    if (chart) chart.destroy();
    const container = document.getElementById('chart-area');

    const opts = {
        width: container.offsetWidth - 20,
        height: container.offsetHeight - 110, // 고정 데이터 영역 확보
        cursor: { 
            drag: { setScale: true },
            points: { size: 8, fill: "#000" } 
        },
        scales: { 
            x: { time: true, auto: true }, 
            y: { auto: true, range: (u, min, max) => [min * 0.9, max * 1.1] } 
        },
        series: [
            { label: "Time" },
            ...columns.slice(1).map((name, i) => ({
                label: name,
                show: false, // 초기 로딩 시 성능을 위해 모두 끔
                stroke: `hsl(${(i * 137.5) % 360}, 70%, 50%)`,
                width: 1.5,
                // 지수 표기법 적용: 매우 작은 수치 대응
                value: (u, v) => v == null ? "-" : (Math.abs(v) < 0.001 && v !== 0 ? v.toExponential(4) : v.toFixed(6))
            }))
        ],
        axes: [
            { space: 80 },
            { 
                // Y축 눈금 지수 표기법 적용
                values: (u, vals) => vals.map(v => Math.abs(v) < 0.001 && v !== 0 ? v.toExponential(1) : v.toFixed(4)) 
            }
        ],
        hooks: {
            init: [
                u => {
                    // [우클릭] 전체 보기 (Zoom Reset)
                    u.over.oncontextmenu = e => {
                        e.preventDefault();
                        u.setData(u.data, true);
                        return false;
                    };
                    // [좌클릭] 데이터 고정 (Pin)
                    u.over.onclick = e => {
                        const { idx } = u.cursor;
                        if (idx != null) updatePinnedData(u, idx);
                    };
                }
            ]
        }
    };

    chart = new uPlot(opts, uData, container);
}

// 3. 데이터 고정 표시 (Pinning)
function updatePinnedData(u, idx) {
    const pinnedArea = document.getElementById('pinned-data');
    const dateStr = new Date(u.data[0][idx] * 1000).toLocaleString();
    
    let html = `<strong>📍 고정 시점: ${dateStr}</strong><br><div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:5px;">`;
    
    u.series.forEach((s, i) => {
        if (i > 0 && s.show) {
            const val = u.data[i][idx];
            const valStr = Math.abs(val) < 0.001 && val !== 0 ? val.toExponential(4) : val.toFixed(6);
            html += `<span style="background:#eee; padding:2px 6px; border-radius:3px; border-left:4px solid ${s.stroke}; font-size:11px;">
                        ${s.label}: <strong>${valStr}</strong>
                     </span>`;
        }
    });
    html += `</div>`;
    pinnedArea.innerHTML = html;
}

// 4. 사이드바 UI (흰색 단색 처리)
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
            chart.setData(chart.data, true); // 실시간 Autoscale
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
