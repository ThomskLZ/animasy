// Ponte mínima e segura entre o app (renderer) e o sistema: só abrir, salvar, ler e gravar arquivos escolhidos.
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('animasyNativo', {
  abrir: () => ipcRenderer.invoke('animasy:abrir'),
  salvarComo: (nome) => ipcRenderer.invoke('animasy:salvarComo', nome),
  ler: (caminho) => ipcRenderer.invoke('animasy:ler', caminho),
  escrever: (caminho, bytes) => ipcRenderer.invoke('animasy:escrever', caminho, bytes),
  caminhoDe: (arquivo) => { try { return webUtils.getPathForFile(arquivo) || ''; } catch { return ''; } },
});
