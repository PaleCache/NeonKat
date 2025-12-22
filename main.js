const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const { spawn } = require('child_process');
const { shell } = require('electron');

const { Notification } = require('electron');
let tray = null;
let mainWindow = null;

if (process.platform === 'win32') {
  app.setAppUserModelId("NeonKat");
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 441,
    height: 743,
    frame: false,
    transparent: true,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      enableRemoteModule: false,
      backgroundThrottling: false,
      contextIsolation: true
     
    },
    icon: path.join(__dirname, 'build', 'kat.png'),
  });



  ipcMain.handle('download-youtube', async (event, { url, downloadFolder }) => {
  if (!downloadFolder || !fsSync.existsSync(downloadFolder)) {
    return { success: false, message: 'Pick a valid fucking folder' };
  }

  const args = [
    url,
    '--extract-audio',
    '--audio-format', 'mp3',
    '--audio-quality', '0',
    '--embed-thumbnail',
    '--convert-thumbnails', 'jpg',
    '--add-metadata',
    '--output', path.join(downloadFolder, '%(title)s.%(ext)s'),
    '--no-playlist',          
    '--newline',
  ];

  return new Promise((resolve) => {
    const ytProcess = spawn('yt-dlp', args, { cwd: downloadFolder });

    let output = '';
    let error = '';

    ytProcess.stdout.on('data', (data) => {
      output += data.toString();
    });

    ytProcess.stderr.on('data', (data) => {
      error += data.toString();
    });

    ytProcess.on('close', (code) => {
      if (code === 0) {
        const destMatch = output.match(/Destination: (.+\.(mp3|m4a|opus|webm))/i);
        let filePath = destMatch ? path.join(downloadFolder, destMatch[1].trim()) : null;

        if (!filePath) {
          filePath = path.join(downloadFolder, 'downloaded_track.mp3');
        }

        resolve({ success: true, filePath });
      } else {
        let msg = `yt-dlp failed with code ${code}`;
        if (error.includes('command not found') || error.includes('not recognized')) {
          msg += '\n\nyt-dlp not found in PATH, Install it properly.';
        } else {
          msg += `\nError: ${error.substring(0, 600)}`;
        }
        resolve({ success: false, message: msg });
      }
    });

    ytProcess.on('error', (err) => {
      if (err.code === 'ENOENT') {
        resolve({ success: false, message: 'yt-dlp not found. Install it and add to PATH' });
      } else {
        resolve({ success: false, message: `Spawn error: ${err.message}` });
      }
    });
  });
});

ipcMain.on('open-external', (event, url) => {
  shell.openExternal(url);
});

  ipcMain.handle('pick-download-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    title: 'Select Download Folder'
  });

  if (result.canceled) {
    return { success: false };
  }

  return { success: true, folderPath: result.filePaths[0] };
});

  ipcMain.on('set-mini-mode', (event, isMini) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (isMini) {
    window.setBounds({ width: 260, height: 290 });
    window.setAlwaysOnTop(true, 'screen-saver');
  } else {
    window.setBounds({ width: 441, height: 743 });
    window.setAlwaysOnTop(false);
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
  const iconPath = path.join(__dirname, 'build', 'kat.png');
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

  tray.setToolTip('NeonKat');
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
    const result = await dialog.showOpenDialog(mainWindow, {
     properties: ['openDirectory'],
      defaultPath: lastFolderPath || undefined,
    });

    if (result.canceled) return null;

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
    icon: path.join(__dirname, 'build/kat.png'),
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

