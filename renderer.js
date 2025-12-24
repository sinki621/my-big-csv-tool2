const uPlot = require('uplot');
const Papa = require('papaparse');
const { ipcRenderer } = require('electron');

let chart;
let columns = [];
let uData = [];

// 1. CSV 로드 및 파싱
document.getElementById('loadBtn').onclick = async () => {
    const filePath = await ipcRenderer.invoke('open-file');
    if (!filePath) return;

    document.getElementById('status').innerText = "데이터 처리 중...";
    
    Papa.parse(filePath, {
        download: true, header: true, dynamicTyping: true, skipEmptyLines: true,
        complete: function(results) {
            const rows = results.data;
            columns = Object.keys(rows[0]);
            
            // X축(날짜) 및 Y축 데이터 배열 생성 (고속 TypedArray 활용)
            uData = [new Float64Array(rows.length)];
            for (let j = 1; j < columns.length; j++) uData.push(new Float64Array(rows.length));

            rows.forEach((row, i) => {
                const ts = new Date(row[columns[0]]).getTime() / 1000;
                uData[0][i] = isNaN(ts) ? i : ts;
                for (let j = 1; j < columns.length; j++) uData[j][i] = row[columns[j]];
            });

            createLegend();
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
        height: container.offsetHeight - 40,
        cursor: { drag: { setScale: true } }, // 드래그 확대
        scales: { x: { time: true }, y: { auto: true } }, // 자동 스케일
        series: [
            {}, // X축
            ...columns.slice(1).map((name, i) => ({
                label: name,
                show: false, // 초기 로드 시 전체 해제 상태
                stroke: `hsl(${(i * 360 / (columns.length-1))}, 70%, 50%)`,
                width: 1.5,
            }))
        ],
        axes: [{}, { grid: { show: true } }],
        plugins: [tooltipPlugin()] // 커스텀 툴팁 플러그인
    };

    chart = new uPlot(opts, uData, container);
    document.getElementById('status').innerText = `${uData[0].length.toLocaleString()} 행 로드 완료`;
}

// 3. 사이드바 범례 및 전체 선택/해제 버튼 로직
function createLegend() {
    const container = document.getElementById('legend-container');
    container.innerHTML = '';
    columns.slice(1).forEach((name, i) => {
        const div = document.createElement('div');
        div.className = 'col-item';
        const color = `hsl(${(i * 360 / (columns.length-1))}, 70%, 50%)`;
        div.innerHTML = `<input type="checkbox" id="ch-${i}" class="col-ch">
                         <label for="ch-${i}" style="color:${color}">${name}</label>`;
        container.appendChild(div);
    });

    // 체크박스 이벤트 연결
    document.querySelectorAll('.col-ch').forEach((cb, i) => {
        cb.onchange = () => {
            chart.setSeries(i + 1, { show: cb.checked });
            chart.redraw(); // 자동 스케일 적용
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
    chart.redraw();
}

// 4. 커스텀 팝업 툴팁 플러그인 (파이썬 팝업 기능 대체)
function tooltipPlugin() {
    let tooltip;
    return {
        hooks: {
            init: (u) => {
                tooltip = document.createElement("div");
                tooltip.className = "u-tooltip";
                tooltip.style.display = "none";
                u.over.appendChild(tooltip);
            },
            setCursor: (u) => {
                const { left, top, idx } = u.cursor;
                if (idx == null) {
                    tooltip.style.display = "none";
                    return;
                }
                const dateStr = new Date(u.data[0][idx] * 1000).toLocaleString();
                let html = `<b>${dateStr}</b><br/>`;
                u.series.forEach((s, i) => {
                    if (i > 0 && s.show) {
                        html += `<span style="color:${s.stroke}">● ${s.label}: ${u.data[i][idx].toFixed(4)}</span><br/>`;
                    }
                });
                tooltip.style.display = "block";
                tooltip.style.left = (left + 15) + "px";
                tooltip.style.top = (top + 15) + "px";
                tooltip.innerHTML = html;
            }
        }
    };
}
