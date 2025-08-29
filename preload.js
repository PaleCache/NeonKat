const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  savePlaylist: (playlist) => ipcRenderer.invoke('save-playlist', playlist),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  openFile: () => ipcRenderer.invoke('open-file'),
  notify: (title, body) => ipcRenderer.send('notify', { title, body }),
  getFileStats: (filePath) => ipcRenderer.invoke('get-file-stats', filePath),
  readFileBuffer: (filePath) => ipcRenderer.invoke('read-file-buffer', filePath),
  toggleMiniplayer: () => ipcRenderer.send('toggle-miniplayer'),
  updateTrack: (data) => ipcRenderer.send('update-track', data),
  updateVisualizer: (data) => ipcRenderer.send('update-visualizer', data),
  updateTheme: (data) => ipcRenderer.send('update-theme', data),
  playPrevious: () => ipcRenderer.send('play-previous'),
  playNext: () => ipcRenderer.send('play-next'),
  togglePlay: () => ipcRenderer.send('toggle-play'),
  onUpdateTrack: (callback) => {
    ipcRenderer.on('update-track', (event, data) => callback(data));
    return () => ipcRenderer.removeAllListeners('update-track');
  },
  onUpdateVisualizer: (callback) => {
    ipcRenderer.on('update-visualizer', (event, data) => callback(data));
    return () => ipcRenderer.removeAllListeners('update-visualizer');
  },
  onUpdateTheme: (callback) => {
    ipcRenderer.on('update-theme', (event, data) => callback(data));
    return () => ipcRenderer.removeAllListeners('update-theme');
  },
  onRequestCurrentState: (callback) => {
    ipcRenderer.on('request-current-state', (event) => callback());
    return () => ipcRenderer.removeAllListeners('request-current-state');
  },
  onPlayPrevious: (callback) => {
    ipcRenderer.on('play-previous', (event) => callback());
    return () => ipcRenderer.removeAllListeners('play-previous');
  },
  onPlayNext: (callback) => {
    ipcRenderer.on('play-next', (event) => callback());
    return () => ipcRenderer.removeAllListeners('play-next');
  },
  onTogglePlay: (callback) => {
    ipcRenderer.on('toggle-play', (event) => callback());
    return () => ipcRenderer.removeAllListeners('toggle-play');
  }
});