const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs').promises;

const { Notification } = require('electron');
let tray = null;
let mainWindow = null;

if (process.platform === 'win32') {
  app.setAppUserModelId("Muzik Electro");
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 560,
    height: 743,
    frame: false,
    transparent: true,
    resizable: false,
     alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      enableRemoteModule: false,
      backgroundThrottling: false,
     
    },
    icon: path.join(__dirname, 'build', 'icon.png'),
  });

  ipcMain.on('set-mini-mode', (event, isMini) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (isMini) {
    window.setBounds({ width: 260, height: 290 });
  } else {
    window.setBounds({ width: 560, height: 733 });
  }
});

  mainWindow.loadFile('index.html');

  mainWindow.on('close', (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
       mainWindow.hide();
    }
  });
}

app.whenReady().then(() => {
  createWindow();
  const iconPath = path.join(__dirname, 'build', 'icon.png');
  const trayIcon = nativeImage.createFromPath(iconPath);
  tray = new Tray(trayIcon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show App',
      click: () => {
        if (mainWindow) mainWindow.show();
      },
    },
    {
      label: 'Quit',
      click: () => {
        app.isQuiting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip('Muzik Electro');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else mainWindow.show();
  });
});

ipcMain.handle('getFileStats', async (event, filePath) => {
  try {
    const stats = await fs.stat(filePath);
    return { mtimeMs: stats.mtimeMs };
  } catch (error) {
    console.error(`Failed to get stats for ${filePath}:`, error);
    return null;
  }
});

ipcMain.handle('open-file', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'Playlists', extensions: ['playlist', 'm3u'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  if (result.canceled) return { canceled: true };
  return { canceled: false, filePaths: result.filePaths };
});

ipcMain.handle('read-file', async (event, filePath) => {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return content;
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error);
    return null;
  }
});

let lastFolderPath = null;
ipcMain.handle('pick-folder', async () => {
  try {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      defaultPath: lastFolderPath || undefined,
    });

    if (result.canceled) {
      return null;
    }

    const folderPath = result.filePaths[0];
    lastFolderPath = folderPath;

    const allFiles = await fs.readdir(folderPath);
    const audioFiles = allFiles.filter(file => {
      const ext = path.extname(file).toLowerCase();
      return ['.mp3', '.wav', '.ogg', '.m4a', '.flac','.opus'].includes(ext);
    });

    const audioFilePaths = audioFiles.map(file => path.join(folderPath, file));
    return { folderPath, audioFilePaths };
  } catch (err) {
    console.error('Error in pick-folder handler:', err);
    throw err;
  }
});

ipcMain.on('notify', (_, { title, body }) => {
  new Notification({
    title,
    body,
    icon: path.join(__dirname, 'build/icon.png'),
  }).show();
});

ipcMain.handle('save-playlist', async (event, playlist) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Save Playlist',
    defaultPath: 'playlist.playlist',
    filters: [
      { name: 'Playlist Files', extensions: ['playlist'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  if (canceled || !filePath) return false;

  try {
    await fs.writeFile(filePath, JSON.stringify(playlist, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Error saving playlist:', err);
    return false;
  }
});

ipcMain.handle('load-playlist', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Load Playlist',
    filters: [
      { name: 'Playlist Files', extensions: ['playlist'] },
      { name: 'All Files', extensions: ['*'] },
    ],
    properties: ['openFile'],
  });
  if (canceled || !filePaths || filePaths.length === 0) return null;

  try {
    const data = await fs.readFile(filePaths[0], 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error loading playlist:', err);
    return null;
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('read-file-buffer', async (event, filePath) => {
  try {
    const buffer = await fs.readFile(filePath);
    return buffer;
  } catch (error) {
    console.error('Error reading file buffer:', error);
    throw new Error(`Failed to read file: ${error.message}`);
  }
});

ipcMain.handle('get-file-stats', async (event, filePath) => {
  try {
    return await fs.stat(filePath);
  } catch (error) {
    console.error('Error getting file stats:', error);
    throw new Error(`Failed to get file stats: ${error.message}`);
  }
});

