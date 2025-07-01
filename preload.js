const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  openFile: () => ipcRenderer.invoke('open-file'),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  savePlaylist: (playlist) => ipcRenderer.invoke('save-playlist', playlist),
  loadPlaylist: () => ipcRenderer.invoke('load-playlist'),
});

