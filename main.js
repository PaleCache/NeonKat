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




const spawnSafe = (cmd, args) => {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    proc.stdout.on('data', () => {});
    proc.stderr.on('data', () => {});
    proc.on('close', code => resolve(code));
    proc.on('error', reject);
  });
};

ipcMain.handle('download-youtube', async (event, { url, downloadFolder, skipVideo = false }) => {
  if (!downloadFolder || !fsSync.existsSync(downloadFolder)) {
    return { success: false, message: 'Pick a valid folder' };
  }

  const sanitizedTitle = (title) => title.replace(/[/\\?%*:|"<>]/g, '').trim() || 'Unknown';

  try {
    if (skipVideo) {
      const audioArgs = [
        url,
        '--extract-audio',
        '--audio-format', 'mp3',
        '--audio-quality', '0',
        '--embed-thumbnail',
        '--add-metadata',
        '--parse-metadata', 'uploader:%(meta_artist)s',
        '--parse-metadata', 'playlist_title:%(meta_album)s',
        '--windows-filenames',
        '--restrict-filenames',
        '--ignore-errors',
        '--no-overwrites',
        '--retries', '10',
        '--retry-sleep', 'exp=1:60',
        '--sleep-interval', '5',
        '--output', path.join(downloadFolder, '%(uploader|Unknown)s - %(title)s.%(ext)s')
      ];

      await spawnSafe('yt-dlp', audioArgs);
      const files = await fs.readdir(downloadFolder);
      const mp3Paths = files
        .filter(f => f.toLowerCase().endsWith('.mp3'))
        .map(f => path.join(downloadFolder, f));

      return {
        success: true,
        mp3Paths,
        videoPath: null,
        message: mp3Paths.length > 1 ? `Ripped ${mp3Paths.length} tracks (playlist)` : 'Audio-only done'
      };
    }

    const tempVideoPath = path.join(downloadFolder, 'NEONKAT_TEMP.%(ext)s');
    const thumbTemp = path.join(downloadFolder, 'NEONKAT_THUMB.%(ext)s');
    let info;
    try {
      let output = '';
      const infoProc = spawn('yt-dlp', ['--dump-single-json', '--no-playlist', url]);
      infoProc.stdout.on('data', d => output += d.toString());
      await new Promise((resolve, reject) => {
        infoProc.on('close', code => code === 0 ? resolve() : reject(new Error('Info failed')));
        infoProc.on('error', reject);
      });
      info = JSON.parse(output);
    } catch (e) {
      throw new Error('Failed to get video info - probably not a single video or ip is rate limited / detected as a bot');
    }

    const formats = info.formats || [];
    const hasVideo = formats.some(f => f && f.vcodec !== 'none');
    let videoPath = null;
    let mp3Path = null;
    await spawnSafe('yt-dlp', [url, '--write-thumbnail', '--convert-thumbnails', 'jpg', '--skip-download', '--no-playlist', '-o', thumbTemp]);

    const thumbFiles = await fs.readdir(downloadFolder);
    const thumbFile = thumbFiles.find(f => f.startsWith('NEONKAT_THUMB.'));
    if (!thumbFile) throw new Error('Thumbnail not found');
    const fullThumbPath = path.join(downloadFolder, thumbFile);

    if (!hasVideo) {
      const audioArgs = [
        url,
        '--extract-audio',
        '--audio-format', 'mp3',
        '--audio-quality', '0',
        '--embed-thumbnail',
        '--add-metadata',
        '--no-playlist',
        '-o', path.join(downloadFolder, sanitizedTitle(info.title) + '.%(ext)s')
      ];
      await spawnSafe('yt-dlp', audioArgs);

      const files = await fs.readdir(downloadFolder);
      mp3Path = path.join(downloadFolder, files.find(f => f.toLowerCase().endsWith('.mp3')));
      await fs.unlink(fullThumbPath);

      return { success: true, mp3Path, videoPath: null };
    }

    await spawnSafe('yt-dlp', [url, '-f', 'bestvideo[height<=480]+bestaudio/best[height<=480]', '--merge-output-format', 'mp4', '--no-playlist', '-o', tempVideoPath]);

    const files = await fs.readdir(downloadFolder);
    const tempFile = files.find(f => f.startsWith('NEONKAT_TEMP.'));
    if (!tempFile) throw new Error('Temp file not found');
    const fullTempPath = path.join(downloadFolder, tempFile);

    const duration = await new Promise((resolve, reject) => {
      const ffprobe = spawn('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', fullTempPath]);
      let out = '';
      ffprobe.stdout.on('data', d => out += d);
      ffprobe.on('close', code => resolve(parseFloat(out) || 0));
      ffprobe.on('error', reject);
    });

    const startTime = Math.max(0, (duration / 2) - 7.5);
    videoPath = path.join(downloadFolder, sanitizedTitle(info.title) + '.mp4');

    await spawnSafe('ffmpeg', [
      '-nostdin', '-ss', startTime.toString(), '-i', fullTempPath,
      '-t', '30', '-vf', 'fps=30,scale=-1:-1:flags=lanczos', '-an',
      '-movflags', '+faststart', '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-crf', '23', '-y',
      videoPath
    ]);


    mp3Path = path.join(downloadFolder, sanitizedTitle(info.title) + '.mp3');
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

    await fs.unlink(fullTempPath);
    await fs.unlink(fullThumbPath);

    return { success: true, mp3Path, videoPath };

  } catch (err) {
    console.error('Download failed:', err.stack || err);
    return { success: false, message: `Error: ${err.message}` };
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

