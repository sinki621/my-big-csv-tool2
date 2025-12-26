const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');

function createWindow() {
  // 상단 메뉴바를 완전히 제거하여 실행 속도와 화면 공간 최적화
  Menu.setApplicationMenu(null);

  const win = new BrowserWindow({
    width: 1500,
    height: 900,
    show: false, // 창이 준비되기 전까지 숨김 (깜빡임 방지)
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      spellcheck: false // 리소스 절약
    }
  });

  win.loadFile('index.html');

  // 렌더링 준비 완료 시 표시하여 체감 로딩 속도 향상
  win.once('ready-to-show', () => {
    win.show();
  });
}

// CSV 파일 선택창 처리
ipcMain.handle('open-file', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'CSV 데이터 파일', extensions: ['csv'] }]
  });
  return canceled ? null : filePaths[0];
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
