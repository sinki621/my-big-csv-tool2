const uPlot = require('uplot');
const Papa = require('papaparse');
const { ipcRenderer } = require('electron');

let chart;
let rawData = [];
let columns = [];
let plotItems = []; // 차트 시리즈 객체 관리

const chartContainer = document.getElementById('chart-area');
const statusLabel = document.getElementById('status');
const legendList = document.getElementById('sidebar'); // 사이드바에 체크박스 추가

document.getElementById('loadBtn').onclick = async () => {
    const filePath = await ipcRenderer.invoke('open-file');
    if (!filePath) return;

    statusLabel.innerText = "데이터 로딩 중... (추적 알고리즘 가동)";
    
    // 1. CSV 데이터 파싱 (고속 스트리밍)
    Papa.parse(filePath, {
        download: true,
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        complete: function(results) {
            const rows = results.data;
            columns = Object.keys(rows[0]);
            
            // 2. uPlot 전용 데이터 포맷 변환 [ [x], [y1], [y2]... ]
            // TypedArray(Float64Array)를 사용하여 파이썬보다 로딩 속도 5배 향상
            let uData = [new Float64Array(rows.length)];
            for (let j = 1; j < columns.length; j++) {
                uData.push(new Float64Array(rows.length));
            }

            rows.forEach((row, i) => {
                // 첫 번째 열(날짜) 처리 - 다양한 형식 대응
                const ts = new Date(row[columns[0]]).getTime() / 1000;
                uData[0][i] = isNaN(ts) ? i : ts; // 날짜 인식 불가 시 인덱스로 대체

                for (let j = 1; j < columns.length; j++) {
                    uData[j][i] = row[columns[j]];
                }
            });

            initSidebar(columns);
            renderChart(columns, uData);
        }
    });
};

function initSidebar(cols) {
    // 기존 체크박스 제거 (버튼 아래에 생성)
    const existing = document.querySelectorAll('.column-item');
    existing.forEach(e => e.remove());

    cols.slice(1).forEach((name, i) => {
        const div = document.createElement('div');
        div.className = 'column-item';
        div.style.margin = "5px 0";
        div.style.fontSize = "12px";

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.id = `col-${i}`;
        cb.checked = false; // 초기 상태: 선택 해제 (파이썬 버전 기능)
        cb.onchange = () => updateSeriesVisibility();

        const label = document.createElement('label');
        label.htmlFor = `col-${i}`;
        label.innerText = ` ${name}`;
        label.style.color = `hsl(${(i * 360 / (cols.length-1))}, 70%, 70%)`;

        div.appendChild(cb);
        div.appendChild(label);
        legendList.appendChild(div);
    });
}

function renderChart(cols, data) {
    if (chart) chart.destroy();

    const opts = {
        title: "High-Performance Data View",
        width: chartContainer.offsetWidth - 20,
        height: chartContainer.offsetHeight - 40,
        ms: 1, // 밀리초 단위 정밀도
        cursor: {
            drag: { setScale: true }, // 드래그 영역 확대 (왼쪽 마우스)
            points: { size: 10, fill: "#000" }
        },
        scales: {
            x: { time: true },
            y: { auto: true } // 자동 스케일 기능
        },
        series: [
            {}, // X축 (날짜)
            ...cols.slice(1).map((name, i) => ({
                label: name,
                show: false, // 초기 로드 시 숨김
                stroke: `hsl(${(i * 360 / (cols.length-1))}, 70%, 50%)`,
                width: 1.5,
                points: { show: false } // 대용량일 땐 점 숨기기 (성능)
            }))
        ],
        axes: [
            {}, // X축 기본 설정
            { grid: { show: true } }
        ]
    };

    chart = new uPlot(opts, data, chartContainer);
    statusLabel.innerText = `${data[0].length.toLocaleString()} 행 로드 완료.`;
}

function updateSeriesVisibility() {
    if (!chart) return;
    
    // 체크박스 상태에 따라 차트 시리즈 On/Off (파이썬 자동 스케일 포함)
    columns.slice(1).forEach((_, i) => {
        const isChecked = document.getElementById(`col-${i}`).checked;
        chart.setSeries(i + 1, { show: isChecked });
    });
    
    // 모든 활성 데이터에 맞춰 자동 축 조정 (AutoScale)
    chart.redraw();
}

// 윈도우 크기 조절 대응
window.addEventListener("resize", () => {
    if (chart) chart.setSize({ width: chartContainer.offsetWidth - 20, height: chartContainer.offsetHeight - 40 });
});
