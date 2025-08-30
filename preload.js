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
  updateTheme: (data) => ipcRenderer.send('update-theme', data),
  updateVolume: (volume) => ipcRenderer.send('update-volume', volume),
  playPrevious: () => ipcRenderer.send('play-previous'),
  playNext: () => ipcRenderer.send('play-next'),
  togglePlay: () => ipcRenderer.send('toggle-play'),
  updateVisualizer: (data) => ipcRenderer.send('update-visualizer', data),
  seekFromMini: (time) => ipcRenderer.send('seek-from-mini', time),
  updateTime: (currentTime, duration) => ipcRenderer.send('update-time', currentTime, duration),
  onUpdateTime: (callback) => ipcRenderer.on('update-time', (e, currentTime, duration) => callback(currentTime, duration)),
   onSeekFromMini: (callback) => ipcRenderer.on('seek-from-mini', (event, time) => callback(time)), 
  onUpdateTrack: (callback) => {
    ipcRenderer.on('update-track', (event, data) => callback(data));
    return () => ipcRenderer.removeAllListeners('update-track');
  },
 disableVisualizer: () => ipcRenderer.send('disable-visualizer'),
onDisableVisualizer: (callback) => {
  ipcRenderer.on('disable-visualizer', () => callback());
  return () => ipcRenderer.removeAllListeners('disable-visualizer');
},

  onUpdateTheme: (callback) => {
    ipcRenderer.on('update-theme', (event, data) => callback(data));
    return () => ipcRenderer.removeAllListeners('update-theme');
  },
  onUpdateVolume: (callback) => {
    ipcRenderer.on('update-volume', (event, volume) => callback(volume));
    return () => ipcRenderer.removeAllListeners('update-volume');
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
  },
  onUpdateVisualizer: (callback) => {
    ipcRenderer.on('update-visualizer', (event, data) => callback(data));
    return () => ipcRenderer.removeAllListeners('update-visualizer');
  }
});

