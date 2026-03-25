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
  notify: (title, body) => ipcRenderer.send('notify', { title, body }),
  fileExists: (path) => ipcRenderer.invoke('file-exists', path),
  setAutoUpdateEnabled: (enabled) => ipcRenderer.send('set-auto-update-enabled', enabled),
  sendAutoUpdateState: (enabled) => ipcRenderer.send('init-auto-update-state', enabled),
  checkForUpdates: () => ipcRenderer.send('check-for-updates'),
  pathDirname: (filePath) => ipcRenderer.invoke('path-dirname', filePath),
  pathBasename: (filePath, ext) => ipcRenderer.invoke('path-basename', filePath, ext),
  pathExtname: (filePath) => ipcRenderer.invoke('path-extname', filePath),
  pathJoin: (...args) => ipcRenderer.invoke('path-join', ...args),
  resizeWindow: (w, h) => ipcRenderer.send('resize-window', w, h),
  AlwaysOnTop: (isit) => ipcRenderer.send('Always-Top', isit),
  loadFolderDirect: (path) => ipcRenderer.invoke('load-folder-direct', path),
  setResizable: (value) => ipcRenderer.send('set-resizable', value),
  getAudioMetadata: (filePath) => ipcRenderer.invoke('get-audio-metadata', filePath),

  onRequestCurrentState: (callback) => {
    ipcRenderer.on('request-current-state', () => callback());
    return () => ipcRenderer.removeAllListeners('request-current-state');
  },


  onDownloadProgress: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('download-progress', listener);
    return () => {
      ipcRenderer.removeListener('download-progress', listener);
    };
  },
  removeDownloadProgressListener: () => {
    ipcRenderer.removeAllListeners('download-progress');
  }

});