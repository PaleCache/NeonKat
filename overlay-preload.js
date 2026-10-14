const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('overlayAPI', {
  onState:    (cb) => ipcRenderer.on('overlay-state',    (_e, s) => cb(s)),
  onProgress: (cb) => ipcRenderer.on('overlay-progress', (_e, p) => cb(p)),
  onEditMode: (cb) => ipcRenderer.on('overlay-edit-mode',(_e, on) => cb(on)),
  dragStart:  (p) => ipcRenderer.send('overlay-drag-start', p),
  dragMove:   (p) => ipcRenderer.send('overlay-drag-move', p),
  dragEnd:    ()  => ipcRenderer.send('overlay-drag-end'),
  onBg:  (cb) => ipcRenderer.on('overlay-bg',  (_e, b) => cb(b)),
  onViz: (cb) => ipcRenderer.on('overlay-viz', (_e, v) => cb(v)),
  onCustomBg: (cb) => ipcRenderer.on('overlay-custombg', (_e, c) => cb(c)),
  resizeStart: (p) => ipcRenderer.send('overlay-resize-start', p),
  resizeMove:  (p) => ipcRenderer.send('overlay-resize-move', p),
  resizeEnd:   ()  => ipcRenderer.send('overlay-resize-end'),
  onOpacity: (cb) => ipcRenderer.on('overlay-opacity', (_e, v) => cb(v)),
});