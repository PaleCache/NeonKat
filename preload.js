const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
dragWindow: (deltaX, deltaY) => ipcRenderer.send('drag-window', deltaX, deltaY),
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  pickDownloadFolder: () => ipcRenderer.invoke('pick-download-folder'),
  openFile: () => ipcRenderer.invoke('open-file'),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  readFileBuffer: (filePath) => ipcRenderer.invoke('read-file-buffer', filePath),
  getFileStats: (filePath) => ipcRenderer.invoke('get-file-stats', filePath),
  getFileUrl: (filePath) => pathToFileURL(filePath).toString(),
  openExternal: (url) => ipcRenderer.send('open-external', url),
  savePlaylist: (playlist) => ipcRenderer.invoke('save-playlist', playlist),
  downloadYoutube: (args) => ipcRenderer.invoke('download-youtube', args),
  setMiniMode: (isMini) => ipcRenderer.send('set-mini-mode', isMini),
  toggleMiniplayer: () => ipcRenderer.send('toggle-miniplayer'),
  updateTrack: (data) => ipcRenderer.send('update-track', data),
  updateTheme: (data) => ipcRenderer.send('update-theme', data),
  updateVolume: (volume) => ipcRenderer.send('update-volume', volume),
  updateVisualizer: (data) => ipcRenderer.send('update-visualizer', data),
  updateTime: (currentTime, duration) => ipcRenderer.send('update-time', currentTime, duration),
  disableVisualizer: () => ipcRenderer.send('disable-visualizer'),
  notify: (title, body) => ipcRenderer.send('notify', { title, body }),
  playPrevious: () => ipcRenderer.send('play-previous'),
  playNext: () => ipcRenderer.send('play-next'),
  togglePlay: () => ipcRenderer.send('toggle-play'),
  seekFromMini: (time) => ipcRenderer.send('seek-from-mini', time),
  fileExists: (path) => ipcRenderer.invoke('file-exists', path),
  setAutoUpdateEnabled: (enabled) => ipcRenderer.send('set-auto-update-enabled', enabled),
  sendAutoUpdateState: (enabled) => ipcRenderer.send('init-auto-update-state', enabled),
  checkForUpdates: () => ipcRenderer.send('check-for-updates'),
  pathDirname: (filePath) => ipcRenderer.invoke('path-dirname', filePath),
  pathBasename: (filePath, ext) => ipcRenderer.invoke('path-basename', filePath, ext),
  pathExtname: (filePath) => ipcRenderer.invoke('path-extname', filePath),
  pathJoin: (...args) => ipcRenderer.invoke('path-join', ...args),
  resizeWindow: (w, h) => ipcRenderer.send('resize-window', w, h),

  onUpdateTrack: (callback) => {
    ipcRenderer.on('update-track', (event, data) => callback(data));
    return () => ipcRenderer.removeAllListeners('update-track');
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
    ipcRenderer.on('request-current-state', () => callback());
    return () => ipcRenderer.removeAllListeners('request-current-state');
  },
  onPlayPrevious: (callback) => {
    ipcRenderer.on('play-previous', () => callback());
    return () => ipcRenderer.removeAllListeners('play-previous');
  },
  onPlayNext: (callback) => {
    ipcRenderer.on('play-next', () => callback());
    return () => ipcRenderer.removeAllListeners('play-next');
  },
  onTogglePlay: (callback) => {
    ipcRenderer.on('toggle-play', () => callback());
    return () => ipcRenderer.removeAllListeners('toggle-play');
  },
  onUpdateVisualizer: (callback) => {
    ipcRenderer.on('update-visualizer', (event, data) => callback(data));
    return () => ipcRenderer.removeAllListeners('update-visualizer');
  },
  onDisableVisualizer: (callback) => {
    ipcRenderer.on('disable-visualizer', () => callback());
    return () => ipcRenderer.removeAllListeners('disable-visualizer');
  },
  onUpdateTime: (callback) => {
    ipcRenderer.on('update-time', (event, currentTime, duration) => callback(currentTime, duration));
    return () => ipcRenderer.removeAllListeners('update-time');
  },
  onSeekFromMini: (callback) => {
    ipcRenderer.on('seek-from-mini', (event, time) => callback(time));
    return () => ipcRenderer.removeAllListeners('seek-from-mini');
  }
});