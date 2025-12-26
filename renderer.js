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

    document.getElementById('status').innerText = "데이터 분석 중...";
    
    Papa.parse(filePath, {
        download: true, header: true, dynamicTyping: true, skipEmptyLines: true,
        complete: function(results) {
            const rows = results.data;
            columns = Object.keys(rows[0]);
            
            uData = [new Float64Array(rows.length)];
            for (let j = 1; j < columns.length; j++) uData.push(new Float64Array(rows.length));

            rows.forEach((row, i) => {
                // X축 시간 처리
                const ts = new Date(row[columns[0]]).getTime() / 1000;
                uData[0][i] = isNaN(ts) ? i : ts;
                
                // Y축 데이터 강제 숫자 변환 (0 표시 문제 해결)
                for (let j = 1; j < columns.length; j++) {
                    const val = parseFloat(row[columns[j]]);
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
        height: container.offsetHeight - 60,
        cursor: { 
            drag: { setScale: true },
            points: { size: 8, fill: "#000" } // 마우스 오버 시 점 표시
        },
        scales: { 
            x: { time: true, auto: true }, 
            y: { auto: true } 
        },
        series: [
            {
                label: "Time",
                value: (u, ts) => ts == null ? "-" : new Date(ts * 1000).toLocaleString('ko-KR', {
                    year: 'numeric', month: '2-digit', day: '2-digit',
                    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
                })
            },
            ...columns.slice(1).map((name, i) => ({
                label: name,
                show: false,
                stroke: `hsl(${(i * 137.5) % 360}, 70%, 50%)`, // 겹치지 않는 색상 알고리즘
                width: 1.5,
                points: { show: false }
            }))
        ],
        axes: [
            {
                space: 80,
                values: [
                    [3600 * 24, "{YYYY}-{MM}-{DD}", null, null, null, null, null, null, 1],
                    [3600, "{HH}:{mm}", null, null, null, null, null, null, 1],
                    [60, "{HH}:{mm}:{ss}", null, null, null, null, null, null, 1],
                ]
            },
            { grid: { show: true } }
        ],
        legend: { show: true, live: true }, // 선택된 데이터만 하단에 표시되도록 설정
        hooks: {
            init: [
                u => {
                    // 우클릭 "View All" 메뉴 추가
                    u.over.oncontextmenu = e => {
                        e.preventDefault();
                        u.setData(u.data, true); // 전체 보기로 초기화
                        return false;
                    };
                }
            ]
        }
    };

    chart = new uPlot(opts, uData, container);
    document.getElementById('status').innerText = `${uData[0].length.toLocaleString()} 행 로드 완료`;
}

// 3. 사이드바 (글씨 흰색 단색 처리)
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
            // 선택할 때마다 자동으로 X, Y축 스케일 조정
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
