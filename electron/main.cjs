// Alva's Electron shell. The game itself is built by the existing itch
// release pipeline and served from this app's private, local alva:// origin.
// Node integration stays disabled in the renderer.
const { app, BrowserWindow, net, protocol, shell } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

protocol.registerSchemesAsPrivileged([{
  scheme: 'alva',
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
}]);

const APP_HOST = 'app';
const APP_ORIGIN = 'alva://app';

function gameRoot() {
  return path.join(app.getAppPath(), 'dist', 'desktop');
}

async function serveGame(request) {
  const url = new URL(request.url);
  if (url.host !== APP_HOST) return new Response('Not found', { status: 404 });
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return new Response('Bad request', { status: 400 });
  }
  const root = gameRoot();
  const file = path.resolve(root, '.' + pathname);
  if (file !== root && !file.startsWith(root + path.sep)) {
    return new Response('Forbidden', { status: 403 });
  }
  try {
    return await net.fetch(pathToFileURL(file).toString());
  } catch {
    return new Response('Not found', { status: 404 });
  }
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 640,
    minHeight: 360,
    backgroundColor: '#050506',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(APP_ORIGIN + '/')) event.preventDefault();
  });
  window.loadURL(APP_ORIGIN + '/index.html');
}

app.whenReady().then(() => {
  protocol.handle('alva', serveGame);
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
