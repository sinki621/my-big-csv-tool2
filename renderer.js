const uPlot = require('uplot');
const Papa = require('papaparse');
const { ipcRenderer } = require('electron');

let chart;
const chartContainer = document.getElementById('chart-container');

document.getElementById('load-btn').onclick = async () => {
    // 윈도우 파일 선택창 열기 로직 (main.js와 통신)
    const filePath = await ipcRenderer.invoke('open-file');
    if (!filePath) return;

    document.getElementById('info').innerText = "데이터 분석 중...";

    // PapaParse를 이용한 고속 스트리밍 파싱
    Papa.parse(filePath, {
        download: true,
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        complete: function(results) {
            const data = results.data;
            const columns = Object.keys(data[0]);
            
            // uPlot 형식으로 데이터 변환 (이 작업이 성능 핵심)
            let uData = [new Float64Array(data.length)]; // X축 (Timestamp)
            columns.slice(1).forEach(() => uData.push(new Float64Array(data.length)));

            data.forEach((row, i) => {
                uData[0][i] = new Date(row[columns[0]]).getTime() / 1000;
                for(let j = 1; j < columns.length; j++) {
                    uData[j][i] = row[columns[j]];
                }
            });

            renderChart(columns, uData);
        }
    });
};

function renderChart(columns, data) {
    if (chart) chart.destroy();

    const opts = {
        width: chartContainer.offsetWidth - 40,
        height: chartContainer.offsetHeight - 60,
        scales: { x: { time: true } },
        series: [
            {}, // X축
            ...columns.slice(1).map((name, i) => ({
                label: name,
                stroke: `hsl(${(i * 360 / columns.length)}, 70%, 50%)`,
                width: 1,
            }))
        ],
        cursor: {
            drag: { setScale: true } // 드래그 영역 확대 활성화
        }
    };

    chart = new uPlot(opts, data, chartContainer);
    document.getElementById('info').innerText = `${data[0].length.toLocaleString()} 행 로드 완료`;
}
