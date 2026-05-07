/**
 * WOLFPAK AI — Desktop App (Electron)
 * Cross-platform: Mac, Windows, Linux
 * Starts the wolfpak server and opens the Command Center
 */
const { app, BrowserWindow, Tray, Menu, shell, nativeImage, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');

let mainWindow = null;
let tray = null;
let serverProcess = null;
const API_PORT = 8787;
const MESH_PORT = 4002;

// ─── SERVER MANAGEMENT ──────────────────────────────────────

function startServer() {
  const tsxPath = path.join(__dirname, '..', 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx');
  const entryPath = path.join(__dirname, '..', 'src', 'cli', 'index.ts');

  serverProcess = spawn(tsxPath, [entryPath, 'start', '--port', String(MESH_PORT), '--api-port', String(API_PORT)], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  serverProcess.stdout.on('data', (data) => {
    console.log(`[server] ${data.toString().trim()}`);
  });

  serverProcess.stderr.on('data', (data) => {
    console.error(`[server] ${data.toString().trim()}`);
  });

  serverProcess.on('error', (err) => {
    console.error('[server] Failed to start:', err.message);
    dialog.showErrorBox('WOLFPAK Server Error', `Failed to start the server: ${err.message}\n\nMake sure you ran "npm install" first.`);
  });

  serverProcess.on('exit', (code) => {
    console.log(`[server] Exited with code ${code}`);
    serverProcess = null;
  });
}

function stopServer() {
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    serverProcess = null;
  }
}

function waitForServer(retries = 30) {
  return new Promise((resolve, reject) => {
    const check = (remaining) => {
      if (remaining <= 0) return reject(new Error('Server did not start in time'));

      const req = http.get(`http://localhost:${API_PORT}/health`, (res) => {
        if (res.statusCode === 200) {
          resolve();
        } else {
          setTimeout(() => check(remaining - 1), 500);
        }
      });

      req.on('error', () => {
        setTimeout(() => check(remaining - 1), 500);
      });

      req.end();
    };

    check(retries);
  });
}

// ─── WINDOW ─────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: 'WOLFPAK AI',
    backgroundColor: '#0a0a0f',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    icon: getIconPath(),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    show: false,
  });

  // Show when ready to prevent flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.loadURL(`http://localhost:${API_PORT}/app/`);

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Mac: hide instead of close
  if (process.platform === 'darwin') {
    mainWindow.on('close', (e) => {
      if (!app.isQuitting) {
        e.preventDefault();
        mainWindow.hide();
      }
    });
  }
}

// ─── TRAY ───────────────────────────────────────────────────

function createTray() {
  const iconPath = getTrayIconPath();
  tray = new Tray(iconPath);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open WOLFPAK',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Open in Browser',
      click: () => shell.openExternal(`http://localhost:${API_PORT}/app/`),
    },
    {
      label: 'API Health',
      click: () => shell.openExternal(`http://localhost:${API_PORT}/health`),
    },
    { type: 'separator' },
    {
      label: 'Quit WOLFPAK',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip('WOLFPAK AI — Running');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// ─── ICONS ──────────────────────────────────────────────────

function getIconPath() {
  const iconDir = path.join(__dirname, 'icons');
  if (process.platform === 'win32') return path.join(iconDir, 'icon.ico');
  if (process.platform === 'darwin') return path.join(iconDir, 'icon.icns');
  return path.join(iconDir, 'icon.png');
}

function getTrayIconPath() {
  const iconDir = path.join(__dirname, 'icons');
  const trayIcon = path.join(iconDir, 'tray-icon.png');
  if (fs.existsSync(trayIcon)) return trayIcon;
  return path.join(iconDir, 'icon.png');
}

// ─── APP LIFECYCLE ──────────────────────────────────────────

app.whenReady().then(async () => {
  console.log('[wolfpak] Starting WOLFPAK AI Desktop...');

  // Check if server already running
  try {
    await waitForServer(2);
    console.log('[wolfpak] Server already running');
  } catch {
    console.log('[wolfpak] Starting server...');
    startServer();
    try {
      await waitForServer(30);
      console.log('[wolfpak] Server ready');
    } catch {
      dialog.showErrorBox('WOLFPAK Error', 'Server failed to start. Check that port 8787 is available.');
      app.quit();
      return;
    }
  }

  createWindow();
  createTray();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow) {
    mainWindow.show();
  } else {
    createWindow();
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
  stopServer();
});
