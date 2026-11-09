// Animasy no desktop (Electron): janela própria, diálogos nativos de abrir/salvar por IPC, janela lembrada.
// O renderer roda com contextIsolation e SEM nodeIntegration: só enxerga o que o preload.cjs expõe.
const { app, BrowserWindow, dialog, ipcMain, Menu } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { autoUpdater } = require('electron-updater');

const ESTADO = path.join(app.getPath('userData'), 'janela.json');
const LER_OK = /\.(glb|gltf|vrm|fbx|bin|png|jpe?g|webp)$/i;

function lerEstado() { try { return JSON.parse(fs.readFileSync(ESTADO, 'utf8')); } catch { return {}; } }
function salvarEstado(win) {
  try {
    const maximizada = win.isMaximized();
    const b = maximizada ? (lerEstado().bounds || win.getNormalBounds()) : win.getBounds();
    fs.writeFileSync(ESTADO, JSON.stringify({ bounds: b, maximizada }));
  } catch { /* sem permissão de escrita: só não lembra */ }
}

function criarJanela() {
  const e = lerEstado();
  const win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 960, minHeight: 600, ...(e.bounds || {}),
    title: 'Animasy', backgroundColor: '#1d2021', show: false,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  if (e.maximizada) win.maximize();
  win.once('ready-to-show', () => win.show());
  for (const ev of ['resize', 'move', 'close']) win.on(ev, () => salvarEstado(win));
  // links externos abrem no navegador, nunca dentro do app
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) require('electron').shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (ev, url) => { if (!url.startsWith('file:')) ev.preventDefault(); });
  const url = process.env.ANIMASY_DEV_URL;
  if (url) win.loadURL(url); else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  return win;
}

ipcMain.handle('animasy:abrir', async (ev) => {
  const win = BrowserWindow.fromWebContents(ev.sender);
  const r = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'], filters: [
    { name: 'Modelo 3D', extensions: ['glb', 'gltf', 'vrm', 'fbx'] },
    { name: 'Arquivos de apoio (.bin, texturas)', extensions: ['bin', 'png', 'jpg', 'jpeg', 'webp'] }] });
  return r.canceled ? null : r.filePaths;
});
ipcMain.handle('animasy:salvarComo', async (ev, nome) => {
  const win = BrowserWindow.fromWebContents(ev.sender);
  const r = await dialog.showSaveDialog(win, { defaultPath: String(nome || 'modelo.glb'), filters: [{ name: 'glTF binário', extensions: ['glb'] }] });
  return r.canceled ? null : r.filePath;
});
ipcMain.handle('animasy:ler', async (_ev, caminho) => {
  const c = String(caminho);
  if (!LER_OK.test(c)) throw new Error('tipo de arquivo não permitido');
  return new Uint8Array(await fs.promises.readFile(c));
});
ipcMain.handle('animasy:escrever', async (_ev, caminho, bytes) => {
  const c = String(caminho);
  if (!/\.(glb|vrm)$/i.test(c)) throw new Error('só grava .glb');
  await fs.promises.writeFile(c, Buffer.from(bytes));
  return true;
});


// Atualização automática (só no instalador do Windows e nos pacotes de Linux/Mac; o portátil não se atualiza sozinho).
// Procura nos Releases do GitHub, baixa em segundo plano e pergunta se quer reiniciar. Sem internet: não faz nada.
function configurarAtualizacao(win) {
  if (!app.isPackaged || process.env.PORTABLE_EXECUTABLE_DIR) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = null;
  autoUpdater.on('error', () => { /* sem rede ou sem release novo: segue sem avisar */ });
  autoUpdater.on('update-downloaded', async (info) => {
    const r = await dialog.showMessageBox(win, {
      type: 'info', buttons: ['Reiniciar agora', 'Depois'], defaultId: 0, cancelId: 1, title: 'Atualização do Animasy',
      message: `A versão ${info.version} do Animasy está pronta.`,
      detail: 'Reiniciar agora instala a atualização. Se for depois, ela é instalada quando você fechar o programa. Seu trabalho não é perdido: ele fica guardado.',
    });
    if (r.response === 0) autoUpdater.quitAndInstall();
  });
  setTimeout(() => { autoUpdater.checkForUpdates().catch(() => {}); }, 4000);
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  configurarAtualizacao(criarJanela());
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) criarJanela(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
