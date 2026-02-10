const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const { spawn } = require('child_process');
const { shell } = require('electron');
const { autoUpdater } = require('electron-updater');
let autoUpdateEnabled = false
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
let logger = console;
try {
  logger = require('electron-log');
  logger.transports.file.level = isDev ? 'warn' : 'info';
} catch (e) {
  console.warn("[AutoUpdate] electron-log not found - using console");
}

if (!isDev) {
  autoUpdater.logger = logger;
}
const { Notification } = require('electron');
let tray = null;
let mainWindow = null;

if (process.platform === 'win32') {
  app.setAppUserModelId("NeonKat");
}

app.commandLine.appendSwitch('ozone-platform', 'x11');
app.commandLine.appendSwitch('enable-features', 'WaylandWindowDecorations');


function createWindow() {
  mainWindow = new BrowserWindow({
    width: 441,
    height: 743,
    frame: false,
    transparent: false,
     backgroundColor: '#000000',
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




const spawnSafe = (cmd, args) => {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    proc.stdout.on('data', () => {});
    proc.stderr.on('data', () => {});
    proc.on('close', code => resolve(code));
    proc.on('error', reject);
  });
};


async function downloadSoundCloudPlaylist(url, downloadFolder) {
  const sanitize = (s) =>
    s.replace(/[/\\?%*:|"<>]/g, '').trim() || 'Unknown';

  let meta;
  {
    let json = '';
    const p = spawn('yt-dlp', ['--dump-single-json', url]);
    p.stdout.on('data', d => json += d);
    await new Promise((res, rej) => {
      p.on('close', c => c === 0 ? res() : rej());
      p.on('error', rej);
    });
    meta = JSON.parse(json);
  }

  if (meta._type !== 'playlist' || !meta.entries?.length) {
    throw new Error('Not a SoundCloud playlist');
  }

  const results = [];

  for (const entry of meta.entries) {
    const titleSafe = sanitize(entry.title);
    const outPath = path.join(downloadFolder, `${titleSafe}.mp3`);
    await spawnSafe('yt-dlp', [
      entry.webpage_url,
      '--extract-audio',
      '--audio-format', 'mp3',
      '--audio-quality', '0',
      '--embed-thumbnail',
      '--embed-metadata',
      '--convert-thumbnails', 'jpg',
      '--no-playlist',
      '-o', outPath
    ]);

    results.push(outPath);
  }

  return results;
}


ipcMain.handle('download-youtube', async (event, { url, downloadFolder, skipVideo = false, artworkDuration = 30, format = 'bestvideo[height<=480]+bestaudio/best[height<=480]' }) => {
  if (!downloadFolder || !fsSync.existsSync(downloadFolder)) {
    return { success: false, message: 'Pick a valid folder' };
  }

if (/soundcloud\.com/.test(url)) {
  const files = await downloadSoundCloudPlaylist(url, downloadFolder);
  return {
    success: true,
    count: files.length,
    files
  };
}
  const sanitizedTitle = (title) => title.replace(/[/\\?%*:|"<>]/g, '').trim() || 'Unknown';
  let targetDuration = typeof artworkDuration === 'number' && artworkDuration > 0 ? artworkDuration : 30;
  if (artworkDuration === 'full' || artworkDuration === Infinity) targetDuration = Infinity;

  const uniqueSuffix = Date.now();
  const tempVideoPath = path.join(downloadFolder, `NEONKAT_TEMP_${uniqueSuffix}.%(ext)s`);
  const thumbTemp = path.join(downloadFolder, `NEONKAT_THUMB_${uniqueSuffix}.%(ext)s`);

  try {
    let info;
    {
      let output = '';
      const infoProc = spawn('yt-dlp', ['--dump-single-json', '--no-playlist', url]);
      infoProc.stdout.on('data', d => output += d.toString());
      await new Promise((resolve, reject) => {
        infoProc.on('close', code => code === 0 ? resolve() : reject(new Error('Info failed')));
        infoProc.on('error', reject);
      });
      info = JSON.parse(output);
    }

    const titleSafe = sanitizedTitle(info.title);
    await spawnSafe('yt-dlp', [url, '--write-thumbnail', '--convert-thumbnails', 'jpg', '--skip-download', '--no-playlist', '-o', thumbTemp]);
    const thumbFiles = await fs.readdir(downloadFolder);
    const thumbFile = thumbFiles.find(f => f.startsWith(`NEONKAT_THUMB_${uniqueSuffix}`));
    if (!thumbFile) throw new Error('Thumbnail not found');
    const fullThumbPath = path.join(downloadFolder, thumbFile);
   if (skipVideo) {
  const titleSafe = sanitizedTitle(info.title);
  const mp3Path = path.join(downloadFolder, `${titleSafe}.mp3`);
  const tempAudioPath = path.join(downloadFolder, `NEONKAT_AUDIO_${uniqueSuffix}.%(ext)s`);

  try {
    await spawnSafe('yt-dlp', [
      url,
      '-f', 'bestaudio/best',
      '--no-playlist',
      '-o', tempAudioPath
    ]);
    const files = await fs.readdir(downloadFolder);
    const audioFile = files.find(f => f.startsWith(`NEONKAT_AUDIO_${uniqueSuffix}`));
    if (!audioFile) {
      throw new Error("Audio file not found after yt-dlp download");
    }
    const fullAudioPath = path.join(downloadFolder, audioFile);
    await spawnSafe('ffmpeg', [
      '-i', fullAudioPath,
      '-i', fullThumbPath,
      '-map', '0:a', '-map', '1:v?',
      '-c:a', 'libmp3lame', '-q:a', '0',
      '-c:v', 'copy',
      '-metadata', `title=${info.title}`,
      '-metadata', `artist=${info.uploader || 'Unknown'}`,
      '-metadata', `album=${info.album || info.title}`,
      '-disposition:v', 'attached_pic',
      '-y', mp3Path
    ]);
    await fs.unlink(fullAudioPath).catch(() => {});
    await fs.unlink(fullThumbPath).catch(() => {});

    return {
      success: true,
      mp3Path,
      videoPath: null,
      actualDuration: 'full'
    };

  } catch (err) {
    console.error("Audio-only download failed:", err);
    await fs.unlink(fullThumbPath).catch(() => {});
    return { success: false, message: err.message || "Audio extraction failed" };
  }
}

    
    const hasVideo = (info.formats || []).some(f => f && f.vcodec !== 'none');

    await spawnSafe('yt-dlp', [
      url,
      '-f', format || 'bestvideo[height<=480]+bestaudio/best[height<=480]',
      '--merge-output-format', 'mp4',
      '--no-playlist',
      '-o', tempVideoPath
    ]);

    const files = await fs.readdir(downloadFolder);
    const tempFile = files.find(f => f.startsWith(`NEONKAT_TEMP_${uniqueSuffix}`));
    if (!tempFile) throw new Error('Temp video not found');
    const fullTempPath = path.join(downloadFolder, tempFile);

    const fullDuration = await new Promise((resolve) => {
      const ffprobe = spawn('ffprobe', [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        fullTempPath
      ]);
      let out = '';
      ffprobe.stdout.on('data', d => out += d);
      ffprobe.on('close', () => resolve(parseFloat(out) || 0));
      ffprobe.on('error', () => resolve(0));
    });

    const videoPath = path.join(downloadFolder, `${titleSafe}.mp4`);
    let clipDuration = fullDuration;
    let startTime = 0;

    if (targetDuration !== Infinity) {
      clipDuration = Math.min(targetDuration, fullDuration);
      startTime = Math.max(0, (fullDuration / 2) - (clipDuration / 2));
    }

    await spawnSafe('ffmpeg', [
      '-nostdin',
      '-ss', startTime.toFixed(2),
      '-i', fullTempPath,
      '-t', clipDuration.toFixed(2),
      '-vf', 'fps=30',
      '-an',
      '-movflags', '+faststart',
      '-pix_fmt', 'yuv420p',
      '-preset', 'veryfast',
      '-crf', '23',
      '-y',
      videoPath
    ]);

   
    const mp3Path = path.join(downloadFolder, `${titleSafe}.mp3`);
    await spawnSafe('ffmpeg', [
      '-i', fullTempPath,
      '-i', fullThumbPath,
      '-map', '0:a', '-map', '1:v',
      '-c:a', 'libmp3lame', '-q:a', '0',
      '-metadata', `title=${info.title}`,
      '-metadata', `artist=${info.uploader || 'Unknown'}`,
      '-metadata', `album=${info.album || info.title}`,
      '-disposition:v', 'attached_pic',
      '-y', mp3Path
    ]);

   
    await fs.unlink(fullTempPath).catch(() => {});
    await fs.unlink(fullThumbPath).catch(() => {});

    return {
      success: true,
      mp3Path,
      videoPath,
      actualDuration: targetDuration === Infinity ? 'full' : clipDuration
    };

  } catch (err) {
    console.error('Download failed:', err);
    return { success: false, message: err.message || 'Unknown error' };
  }
});



ipcMain.handle('file-exists', async (event, filePath) => {
  try {
    await fs.access(filePath, fs.constants.F_OK);
    return true;
  } catch (error) {
    return false;
  }
});


ipcMain.handle('path-dirname', (event, filePath) => path.dirname(filePath));
ipcMain.handle('path-basename', (event, filePath, ext) => path.basename(filePath, ext));
ipcMain.handle('path-extname', (event, filePath) => path.extname(filePath));
ipcMain.handle('path-join', (event, ...args) => path.join(...args));


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

ipcMain.on('resize-window', (event, width, height) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  win.setSize(width, height, true);
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
 if (autoUpdateEnabled) {
    startPeriodicUpdateChecks();
  }
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

ipcMain.on('init-auto-update-state', (event, enabled) => {
  autoUpdateEnabled = !!enabled;
  console.log(`Auto-update state loaded from localStorage: ${autoUpdateEnabled ? 'ENABLED' : 'DISABLED'}`);

  if (autoUpdateEnabled) {
    startPeriodicUpdateChecks();
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

ipcMain.on('set-auto-update-enabled', (event, enabled) => {
  autoUpdateEnabled = !!enabled;
  console.log(`Auto-update now ${enabled ? 'ENABLED' : 'DISABLED'}`);
  if (!enabled && updateCheckInterval) {
    clearInterval(updateCheckInterval);
    updateCheckInterval = null;
    console.log('Periodic update checks stopped');
  }
});

ipcMain.on('check-for-updates', () => {
  if (autoUpdateEnabled) {
    autoUpdater.checkForUpdatesAndNotify().catch(err => {
      console.log('Update check failed (harmless):', err.message);
    });
  } else {
    console.log('Update check blocked - toggle is off');
  }
});

let updateCheckInterval = null;

function startPeriodicUpdateChecks() {
  if (updateCheckInterval) {
    clearInterval(updateCheckInterval);
  }

  const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

  updateCheckInterval = setInterval(() => {
    if (autoUpdateEnabled) {
      console.log('Running scheduled update check...');
      autoUpdater.checkForUpdatesAndNotify()
        .catch(err => {
          console.log('Scheduled update check failed (normal):', err.message);
        });
    }
  }, CHECK_INTERVAL_MS);

  setTimeout(() => {
    if (autoUpdateEnabled) {
      console.log('Initial startup update check');
      autoUpdater.checkForUpdatesAndNotify().catch(() => {});
    }
  }, 10000);
}
