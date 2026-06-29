const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const { spawn } = require('child_process');
const { shell } = require('electron');
const { autoUpdater } = require('electron-updater');
let autoUpdateEnabled = false
const { execFile } = require('child_process');
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

const ffprobeStatic = require('ffprobe-static');

function getFfprobePath() {
  return ffprobeStatic.path;
}

ipcMain.handle('get-audio-metadata', async (event, filePath) => {
  if (typeof filePath !== 'string') return null;

  const ext = path.extname(filePath).toLowerCase();
  if (!['.mp3','.flac','.wav','.m4a','.ogg','.aac','.opus'].includes(ext)) {
    return null;
  }

  const ffprobePath = getFfprobePath();

  return new Promise((resolve) => {
    execFile(ffprobePath, [
      '-v', 'quiet',
      '-select_streams', 'a:0',
      '-show_entries', 'stream=codec_name,bit_rate,sample_rate,bits_per_raw_sample:format=duration',
      '-of', 'json',
      filePath
    ], { timeout: 3000 }, (error, stdout) => {

      if (error) {
        console.warn(`[Metadata] ffprobe failed for ${filePath.split('/').pop()}`);
        return resolve({
          codec: ext.replace('.', '').toUpperCase(),
          bitrate: null,
          sampleRate: null,
          bitDepth: null,
          duration: null
        });
      }

      try {
        const data = JSON.parse(stdout);
        const stream = data.streams?.[0] || {};
        const format = data.format || {};

        resolve({
          codec: (stream.codec_name || '').toUpperCase(),
          bitrate: stream.bit_rate ? Math.round(parseInt(stream.bit_rate) / 1000) + ' kbps' : null,
          sampleRate: stream.sample_rate ? (parseInt(stream.sample_rate) / 1000).toFixed(1) + ' kHz' : null,
          bitDepth: stream.bits_per_raw_sample ? stream.bits_per_raw_sample + ' bit' : null,
          duration: format.duration ? parseFloat(format.duration) : null
        });
      } catch (e) {
        console.warn('[Metadata] Failed to parse ffprobe output');
        resolve({
          codec: ext.replace('.', '').toUpperCase(),
          bitrate: null,
          sampleRate: null,
          bitDepth: null,
          duration: null
        });
      }
    });
  });
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 441,
    height: 743,
    frame: false,
    transparent: false,
     backgroundColor: '#000000',
    resizable: false,
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

mainWindow.webContents.on('context-menu', (event, params) => {
  if (!params.isEditable) return;

  const menuTemplate = [
    { role: 'cut' },
    { role: 'copy' },
    { role: 'paste' },
    { role: 'selectall' }
  ];

  const menu = Menu.buildFromTemplate(menuTemplate);
  menu.popup({
    window: mainWindow,
    x: params.x,
    y: params.y
  });
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


async function downloadSoundCloudPlaylist(url, downloadFolder, event, genre) {
  const sender = event?.sender;
  const sendProgress = (percent, extra = {}) => {
    if (sender) sender.send('download-progress', {
      percent: Math.min(100, Math.max(0, Math.round(percent || 0))),
      ...extra
    });
  };

  const sanitize = (s) => (s || '').replace(/[/\\?%*:|"<>]/g, '').trim() || 'Unknown';
  let meta;
  {
    let json = '';
    const p = spawn('yt-dlp', ['--dump-single-json', url]);
    p.stdout.on('data', d => json += d.toString());
    p.stderr.on('data', d => console.error(d.toString()));
    await new Promise((res, rej) => {
      p.on('close', c => c === 0 ? res() : rej(new Error('yt-dlp failed')));
      p.on('error', rej);
    });
    meta = JSON.parse(json);
  }

  const entries = meta._type === 'playlist' && meta.entries?.length ? meta.entries : [meta];
  const totalTracks = entries.length;
  const results = [];

  sendProgress(0, { status: 'downloading', message: `Found ${totalTracks} track(s)` });

  for (let i = 0; i < totalTracks; i++) {
    const entry = entries[i];
    const titleSafe = sanitize(entry.title);
    const tempPath = path.join(downloadFolder, `NEONKAT_SC_TEMP_${Date.now()}_${i}.mp3`);
    const outPath = path.join(downloadFolder, `${titleSafe}.mp3`);

    await new Promise((resolve, reject) => {
      const p = spawn('yt-dlp', [
        entry.webpage_url,
        '--extract-audio',
        '--audio-format', 'mp3',
        '--audio-quality', '0',
        '--embed-thumbnail',
        '--convert-thumbnails', 'jpg',
        '--no-playlist',
        '-o', tempPath,
        '--newline'
      ]);

      p.stdout.on('data', (data) => {
        const lines = data.toString().split('\n');
        for (const line of lines) {
          const match = line.match(/(\d+(?:\.\d+)?)%/);
          if (match) {
            const filePercent = parseFloat(match);
            const overallPercent = ((i + filePercent / 100) / totalTracks) * 100;
            sendProgress(overallPercent, {
              status: 'downloading',
              currentTrack: entry.title,
              trackPercent: filePercent,
              message: `Downloading ${entry.title}`
            });
          }
        }
      });

      p.on('close', async (code) => {
        if (code === 0) {
          try {
            await spawnSafe('ffmpeg', [
              '-i', tempPath,
              '-c:a', 'copy',
              '-metadata', `title=${entry.title}`,
              '-metadata', `artist=${entry.uploader || 'Unknown'}`,
              '-metadata', `album=${entry.album || entry.title}`,
              '-metadata', `genre=${genre}`,
              '-y', outPath
            ]);
            await fs.unlink(tempPath).catch(() => {});
            results.push(outPath);
            resolve();
          } catch (err) {
            reject(err);
          }
        } else {
          reject(new Error(`yt-dlp failed for track: ${entry.title}`));
        }
      });

      p.on('error', reject);
    });
  }

  sendProgress(100, { status: 'complete', message: 'Download complete' });
  return results;
}

function spawnYtDlpWithProgress(args, sendProgress, basePercent = 0, percentScale = 1) {
  return new Promise((resolve, reject) => {
    const proc = spawn('yt-dlp', args);

    proc.stdout.on('data', (data) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        const match = line.match(/(\d{1,3}(?:\.\d+)?)%/);
        if (match) {
          const percent = parseFloat(match[1]);
          sendProgress(basePercent + percent * percentScale);
        }
      }
    });

    proc.stderr.on('data', (d) => {});

    proc.on('close', (code) => code === 0 ? resolve() : reject(new Error(`yt-dlp failed with code ${code}`)));
    proc.on('error', reject);
  });
}


async function downloadSingleSoundCloud(url, downloadFolder, sendProgress = () => {}, genre) {
  const sanitize = (s) => (s || '').replace(/[/\\?%*:|"<>]/g, '').trim() || 'Unknown';

  let info;
  {
    let json = '';
    const p = spawn('yt-dlp', ['--dump-single-json', '--no-playlist', url]);
    p.stdout.on('data', d => json += d.toString());
    p.stderr.on('data', d => console.error('yt-dlp stderr:', d.toString()));
    await new Promise((resolve, reject) => {
      p.on('close', code => code === 0 ? resolve() : reject(new Error('yt-dlp failed')));
      p.on('error', reject);
    });
    info = JSON.parse(json);
  }

  const titleSafe = sanitize(info.title);
  const tempPath = path.join(downloadFolder, `NEONKAT_SC_TEMP_${Date.now()}.mp3`);
  const outPath = path.join(downloadFolder, `${titleSafe}.mp3`);
  await spawnYtDlpWithProgress(
    [
      url,
      '--extract-audio',
      '--audio-format', 'mp3',
      '--audio-quality', '0',
      '--embed-thumbnail',
      '--convert-thumbnails', 'jpg',
      '--no-playlist',
      '-o', tempPath
    ],
    sendProgress,
    0,  
    1    
  );


  await spawnSafe('ffmpeg', [
    '-i', tempPath,
    '-c:a', 'copy',
    '-metadata', `title=${info.title}`,
    '-metadata', `artist=${info.uploader || 'Unknown'}`,
    '-metadata', `album=${info.album || info.title}`,
    '-metadata', `genre=${genre}`,
    '-y', outPath
  ]);

  await fs.unlink(tempPath).catch(() => {});

  return outPath;
}

ipcMain.handle('load-folder-direct', async (event, folderPath) => {
  if (!folderPath || typeof folderPath !== 'string') {
    console.error('load-folder-direct called with invalid path:', folderPath);
    return { canceled: true, error: 'No valid folder path provided' };
  }

  try {
    const stats = await fs.stat(folderPath);
    if (!stats.isDirectory()) {
      console.error('Not a directory:', folderPath);
      return { canceled: true, error: 'Path is not a directory' };
    }

    const files = await fs.readdir(folderPath, { withFileTypes: true });
    
    const audioExts = ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.opus', '.aac'];
    const audioFiles = [];

    for (const file of files) {
      if (file.isFile()) {
        const ext = path.extname(file.name).toLowerCase();
        if (audioExts.includes(ext)) {
          audioFiles.push(path.join(folderPath, file.name));
        }
      }
    }

    console.log(`Loaded ${audioFiles.length} audio files from:`, folderPath);

    return {
      folderPath,
      audioFilePaths: audioFiles
    };

  } catch (err) {
    console.error('Direct folder load failed:', err.message);
    return { canceled: true, error: err.message };
  }
});

ipcMain.on('set-resizable', (event, value) => {
  if (mainWindow) {
    mainWindow.setResizable(value);
  }
});


ipcMain.handle('download-youtube', async (event, { 
  url, 
  downloadFolder, 
  skipVideo = false, 
  artworkDuration = 30, 
  format,
  genre = 'Music',
  extraYtdlpArgs = ''
}) => {
  downloadCancelled = false;

  if (!downloadFolder || !fsSync.existsSync(downloadFolder)) {
    return { success: false, message: 'Pick a valid folder' };
  }

  if (/soundcloud\.com/.test(url)) {
    const sender = event.sender;
    const sendProgress = (percent) => sender.send('download-progress', { percent });

    let scResult;
    if (/\/sets\//.test(url)) {
      const files = await downloadSoundCloudPlaylist(url, downloadFolder, event, genre);
      scResult = { success: true, count: files.length, files };
    } else {
      const file = await downloadSingleSoundCloud(url, downloadFolder, sendProgress, genre);
      scResult = { success: true, count: 1, files: [file] };
    }
    sendProgress(100, { status: 'finished', message: 'Download complete' });
    return scResult;
  }

  const extraArgs = parseExtraArgs(extraYtdlpArgs);
  const sender = event.sender;
  const sendProgress = (percent, extra = {}) => {
    sender.send('download-progress', { 
      percent: Math.min(100, Math.max(0, Math.round(percent || 0))),
      ...extra 
    });
  };

  sendProgress(0, { status: 'starting', message: 'Starting download...' });

  const sanitizedTitle = (title) => title.replace(/[/\\?%*:|"<>]/g, '').trim() || 'Unknown';
  let targetDuration = typeof artworkDuration === 'number' && artworkDuration > 0 ? artworkDuration : 30;
  if (artworkDuration === 'full' || artworkDuration === Infinity) targetDuration = Infinity;

  const uniqueSuffix = Date.now();
  const tempVideoPath = path.join(downloadFolder, `NEONKAT_TEMP_${uniqueSuffix}.%(ext)s`);
  const thumbTemp = path.join(downloadFolder, `NEONKAT_THUMB_${uniqueSuffix}.%(ext)s`);

  try {
    if (downloadCancelled) return { success: false, message: 'Cancelled' };

    sendProgress(3, { status: 'fetching-info', message: 'Fetching video info...' });
    let infoOutput = '';
    const infoProc = trackProcess(spawn('yt-dlp', ['--dump-single-json', '--no-playlist', ...extraArgs, url]));
    infoProc.stdout.on('data', d => infoOutput += d.toString());
    let infoStderr = '';
    infoProc.stderr.on('data', d => infoStderr += d.toString());

    await new Promise((resolve, reject) => {
      infoProc.on('close', code => {
        clearProcess(infoProc);
        if (downloadCancelled) reject(new Error('Cancelled'));
         else code === 0 ? resolve() : reject(new Error(`Info fetch failed:\n${infoStderr}`));
      });
      infoProc.on('error', (err) => { clearProcess(infoProc); reject(err); });
    });

    const info = JSON.parse(infoOutput);
    sendProgress(8, { status: 'info-fetched', message: 'Metadata received' });
    const titleSafe = sanitizedTitle(info.title);
    sendProgress(10, { status: 'thumbnail', message: 'Downloading thumbnail...' });

    if (downloadCancelled) throw new Error('Cancelled');

    const thumbProc = trackProcess(spawn('yt-dlp', [
      url,
      '--write-thumbnail',
      '--convert-thumbnails', 'jpg',
      '--skip-download',
      '--no-playlist',
      ...extraArgs,
      '-o', thumbTemp
    ]));
    await new Promise((resolve, reject) => {
      thumbProc.on('close', (code) => {
        clearProcess(thumbProc);
        if (downloadCancelled) reject(new Error('Cancelled'));
        else resolve(code);
      });
      thumbProc.on('error', (err) => { clearProcess(thumbProc); reject(err); });
    });

    const thumbFiles = await fs.readdir(downloadFolder);
    const thumbFile = thumbFiles.find(f => f.startsWith(`NEONKAT_THUMB_${uniqueSuffix}`));
    if (!thumbFile) throw new Error('Thumbnail not found after download');
    const fullThumbPath = path.join(downloadFolder, `NEONKAT_THUMB_${uniqueSuffix}.jpg`);
    sendProgress(15);

    if (downloadCancelled) throw new Error('Cancelled');

    if (skipVideo) {
      sendProgress(20, { status: 'audio', message: 'Downloading audio...' });

      const mp3Path = path.join(downloadFolder, `${titleSafe}.mp3`);
      const tempAudioPath = path.join(downloadFolder, `NEONKAT_AUDIO_${uniqueSuffix}.%(ext)s`);

      const audioProc = trackProcess(spawn('yt-dlp', [
        url,
        '-f', 'bestaudio/best',
        '--no-playlist',
        ...extraArgs,
        '-o', tempAudioPath
      ]));

      let lastAudioPercent = 0;
      let audioStderr = '';
      audioProc.stdout.on('data', (data) => {
        const line = data.toString();
        const match = line.match(/(\d{1,3}(?:\.\d+)?)%/);
        if (match) {
          const p = parseFloat(match[1]);
          if (Math.floor(p) > Math.floor(lastAudioPercent)) {
            lastAudioPercent = p;
            sendProgress(20 + (p * 0.4));
          }
        }
      });

      audioProc.stderr.on('data', (d) => { audioStderr += d.toString(); });

      await new Promise((res, rej) => {
        audioProc.on('close', code => {
          clearProcess(audioProc);
          if (downloadCancelled) rej(new Error('Cancelled'));
          else code === 0 ? res() : rej(new Error(`Audio download failed:\n${audioStderr}`));
        });
        audioProc.on('error', (err) => { clearProcess(audioProc); rej(err); });
      });

      if (downloadCancelled) throw new Error('Cancelled');

      sendProgress(60, { status: 'audio-processing', message: 'Embedding thumbnail...' });

      const audioTempFile = (await fs.readdir(downloadFolder)).find(f => f.startsWith(`NEONKAT_AUDIO_${uniqueSuffix}`));
      const audioTempFull = path.join(downloadFolder, audioTempFile);

      const embedProc = trackProcess(spawn('ffmpeg', [
        '-i', audioTempFull,
        '-i', fullThumbPath,
        '-map', '0:a', '-map', '1:v?',
        '-c:a', 'libmp3lame', '-q:a', '0',
        '-c:v', 'copy',
        '-metadata', `title=${info.title}`,
        '-metadata', `artist=${info.uploader || 'Unknown'}`,
        '-metadata', `album=${info.album || info.title}`,
        '-metadata', `genre=${genre}`,
        '-disposition:v', 'attached_pic',
        '-y', mp3Path
      ], { stdio: ['ignore', 'pipe', 'pipe'] }));

      await new Promise((res, rej) => {
        embedProc.on('close', (code) => {
          clearProcess(embedProc);
          if (downloadCancelled) rej(new Error('Cancelled'));
          else res(code);
        });
        embedProc.on('error', (err) => { clearProcess(embedProc); rej(err); });
      });

      await fs.unlink(audioTempFull).catch(() => {});
      await fs.unlink(fullThumbPath).catch(() => {});

      sendProgress(100, { status: 'finished', message: 'Audio download complete' });
      return { success: true, mp3Path, videoPath: null, actualDuration: 'full' };
    }

    sendProgress(20, { status: 'video', message: 'Downloading video + audio...' });

    const videoProc = trackProcess(spawn('yt-dlp', [
      url,
      '-f', format,
      '--merge-output-format', 'mp4',
      '--no-playlist',
      ...extraArgs,
      '-o', tempVideoPath
    ]));

    let lastVideoPercent = 0;
    let videoStderr = '';
    videoProc.stdout.on('data', (data) => {
      const line = data.toString();
      const match = line.match(/(\d{1,3}(?:\.\d+)?)%/);
      if (match) {
        const p = parseFloat(match[1]);
        if (Math.floor(p) > Math.floor(lastVideoPercent)) {
          lastVideoPercent = p;
          sendProgress(20 + (p * 0.55));
        }
      }
    });
    videoProc.stderr.on('data', (d) => { videoStderr += d.toString(); });

 await new Promise((res, rej) => {
  videoProc.on('close', code => {
    clearProcess(videoProc);
    if (downloadCancelled) rej(new Error('Cancelled'));
    else code === 0 ? res() : rej(new Error(`Video download failed:\n${videoStderr}`));
  });
  videoProc.on('error', (err) => { clearProcess(videoProc); rej(err); });
});

    if (downloadCancelled) throw new Error('Cancelled');

   sendProgress(75, { status: 'processing', message: 'Processing video...' });


let fullTempPath = path.join(downloadFolder, `NEONKAT_TEMP_${uniqueSuffix}.mp4`);
const tempExists = await fs.access(fullTempPath).then(() => true).catch(() => false);

if (!tempExists) {
  const tempFiles = await fs.readdir(downloadFolder);
  const tempFile = tempFiles.find(f => f.startsWith(`NEONKAT_TEMP_${uniqueSuffix}`));
  if (!tempFile) throw new Error('Temp video file not found after download');
  fullTempPath = path.join(downloadFolder, tempFile);
}

const fullDuration = await new Promise((resolve) => {
  execFile(
    getFfprobePath(),
    [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      fullTempPath
    ],
    { timeout: 10000 },
    (error, stdout) => {
      if (error) console.warn('[ffprobe] error:', error.message);
      resolve(parseFloat(stdout) || 0);
    }
  );
});

    if (downloadCancelled) throw new Error('Cancelled');

    const videoPath = path.join(downloadFolder, `${titleSafe}.mp4`);
    let clipDuration = fullDuration;
    let startTime = 0;

    if (targetDuration !== Infinity) {
      clipDuration = Math.min(targetDuration, fullDuration);
      startTime = Math.max(0, (fullDuration / 2) - (clipDuration / 2));
    }

    const clipProc = trackProcess(spawn('ffmpeg', [
      '-nostdin',
      '-ss', startTime.toFixed(2),
      '-i', fullTempPath,
      '-t', clipDuration.toFixed(2),
      '-c', 'copy',
      '-y', videoPath
    ], { stdio: ['ignore', 'pipe', 'pipe'] }));

    await new Promise((res, rej) => {
      clipProc.on('close', (code) => {
        clearProcess(clipProc);
        if (downloadCancelled) rej(new Error('Cancelled'));
        else res(code);
      });
      let clipStderr = '';
      clipProc.stderr.on('data', (d) => { 
        clipStderr += d.toString();
      });
    });

    if (downloadCancelled) throw new Error('Cancelled');

    sendProgress(90, { status: 'audio-extract', message: 'Creating audio version...' });

    const mp3Path = path.join(downloadFolder, `${titleSafe}.mp3`);
    const mp3Proc = trackProcess(spawn('ffmpeg', [
      '-i', fullTempPath,
      '-i', fullThumbPath,
      '-map', '0:a', '-map', '1:v',
      '-c:a', 'libmp3lame', '-q:a', '0',
      '-metadata', `title=${info.title}`,
      '-metadata', `artist=${info.uploader || 'Unknown'}`,
      '-metadata', `album=${info.album || info.title}`,
      '-metadata', `genre=${genre}`, 
      '-disposition:v', 'attached_pic',
      '-y', mp3Path
    ], { stdio: ['ignore', 'pipe', 'pipe'] }));

    await new Promise((res, rej) => {
      mp3Proc.on('close', (code) => {
        clearProcess(mp3Proc);
        if (downloadCancelled) rej(new Error('Cancelled'));
        else res(code);
      });
      mp3Proc.on('error', (err) => { clearProcess(mp3Proc); rej(err); });
    });

    await fs.unlink(fullTempPath).catch(() => {});
    await fs.unlink(fullThumbPath).catch(() => {});

    sendProgress(100, { status: 'finished', message: 'Download complete' });

    return {
      success: true,
      mp3Path,
      videoPath,
      actualDuration: targetDuration === Infinity ? 'full' : clipDuration
    };

} catch (err) {
  if (currentDownloadProcess) {
    try { currentDownloadProcess.kill('SIGKILL'); } catch (e) {}
    currentDownloadProcess = null;
  }
  const isCancel = err.message === 'Cancelled';
  console.error(isCancel ? 'Download cancelled by user' : 'Download failed:', isCancel ? '' : err);
  sendProgress(0, { status: isCancel ? 'cancelled' : 'error', message: isCancel ? 'Download cancelled' : (err.message || 'Download failed') });
  return { success: false, message: isCancel ? 'Cancelled' : (err.message || 'Unknown error'), cancelled: isCancel };
}
});


  function parseExtraArgs(str) {
    if (!str || !str.trim()) return [];
    const args = [];
    const regex = /(?:[^\s"']+|"[^"]*"|'[^']*')+/g;
    let match;
    while ((match = regex.exec(str)) !== null) {
      args.push(match[0].replace(/^["']|["']$/g, ''));
    }
    return args;
  }


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

ipcMain.on('Always-Top', (event, isit) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  win.setAlwaysOnTop(isit, 'screen-saver');
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


let currentDownloadProcess = null;
let downloadCancelled = false;

function trackProcess(proc) {
  currentDownloadProcess = proc;
  downloadCancelled = false;
  return proc;
}

function clearProcess(proc) {
  if (currentDownloadProcess === proc) {
    currentDownloadProcess = null;
  }
}

ipcMain.handle('cancel-download', () => {
  downloadCancelled = true;
  if (currentDownloadProcess) {
    try { currentDownloadProcess.kill('SIGTERM'); } catch (e) {}
    currentDownloadProcess = null;
    return { cancelled: true };
  }
  return { cancelled: false };
});

ipcMain.handle('resolve-stream-url', async (event, pageUrl) => {
  return new Promise((resolve) => {
    let output = '';
    const proc = spawn('yt-dlp', ['-g', '--no-playlist', pageUrl]);
    proc.stdout.on('data', d => output += d.toString());
    proc.on('close', (code) => {
      const urls = output.trim().split('\n').filter(Boolean);
      if (code === 0 && urls.length) {
        resolve({
          success: true,
          url: urls[urls.length - 1],
          videoUrl: urls.length > 1 ? urls[0] : null
        });
      } else {
        resolve({ success: false });
      }
    });
    proc.on('error', () => resolve({ success: false }));
  });
});