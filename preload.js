
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  savePlaylist: (playlist) => ipcRenderer.invoke('save-playlist', playlist),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  openFile: () => ipcRenderer.invoke('open-file'),
  notify: (title, body) => ipcRenderer.send('notify', { title, body }),
  getFileStats: (filePath) => ipcRenderer.invoke('getFileStats', filePath),
});