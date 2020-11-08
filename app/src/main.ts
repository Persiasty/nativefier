import 'source-map-support/register';

import fs from 'fs';
import path from 'path';
import net from 'net';

import { app, crashReporter, globalShortcut, BrowserWindow } from 'electron';
import electronDownload from 'electron-dl';

import { createLoginWindow } from './components/loginWindow';
import { createMainWindow } from './components/mainWindow';
import { createTrayIcon } from './components/trayIcon';
import { isOSX } from './helpers/helpers';
import { inferFlashPath } from './helpers/inferFlash';

// Entrypoint for Squirrel, a windows update framework. See https://github.com/jiahaog/nativefier/pull/744
if (require('electron-squirrel-startup')) {
  app.exit();
}

const APP_ARGS_FILE_PATH = path.join(__dirname, '..', 'nativefier.json');
const appArgs = JSON.parse(fs.readFileSync(APP_ARGS_FILE_PATH, 'utf8'));

const fileDownloadOptions = { ...appArgs.fileDownloadOptions };
electronDownload(fileDownloadOptions);

if (appArgs.processEnvs) {
  // This is compatibility if just a string was passed.
  if (typeof appArgs.processEnvs === 'string') {
    process.env.processEnvs = appArgs.processEnvs;
  } else {
    Object.keys(appArgs.processEnvs).forEach((key) => {
      /* eslint-env node */
      process.env[key] = appArgs.processEnvs[key];
    });
  }
}

//let mainWindow: BrowserWindow;

if (typeof appArgs.flashPluginDir === 'string') {
  app.commandLine.appendSwitch('ppapi-flash-path', appArgs.flashPluginDir);
} else if (appArgs.flashPluginDir) {
  const flashPath = inferFlashPath();
  app.commandLine.appendSwitch('ppapi-flash-path', flashPath);
}

if (appArgs.ignoreCertificate) {
  app.commandLine.appendSwitch('ignore-certificate-errors');
}

if (appArgs.disableGpu) {
  app.disableHardwareAcceleration();
}

if (appArgs.ignoreGpuBlacklist) {
  app.commandLine.appendSwitch('ignore-gpu-blacklist');
}

if (appArgs.enableEs3Apis) {
  app.commandLine.appendSwitch('enable-es3-apis');
}

if (appArgs.diskCacheSize) {
  app.commandLine.appendSwitch('disk-cache-size', appArgs.diskCacheSize);
}

if (appArgs.basicAuthUsername) {
  app.commandLine.appendSwitch(
    'basic-auth-username',
    appArgs.basicAuthUsername,
  );
}

if (appArgs.basicAuthPassword) {
  app.commandLine.appendSwitch(
    'basic-auth-password',
    appArgs.basicAuthPassword,
  );
}

const isRunningMacos = isOSX();
let currentBadgeCount = 0;
const setDockBadge = isRunningMacos
  ? (count: number, bounce = false) => {
      app.dock.setBadge(count.toString());
      if (bounce && count > currentBadgeCount) app.dock.bounce();
      currentBadgeCount = count;
    }
  : () => undefined;

app.on('window-all-closed', () => {
  if (!isOSX() || appArgs.fastQuit) {
    app.quit();
  }
});

app.on('before-quit', () => {
  // not fired when the close button on the window is clicked
  if (isOSX()) {
    // need to force a quit as a workaround here to simulate the osx app hiding behaviour
    // Somehow sokution at https://github.com/atom/electron/issues/444#issuecomment-76492576 does not work,
    // e.prevent default appears to persist

    // might cause issues in the future as before-quit and will-quit events are not called
    app.exit(0);
  }
});

if (appArgs.crashReporter) {
  app.on('will-finish-launching', () => {
    crashReporter.start({
      companyName: appArgs.companyName || '',
      productName: appArgs.name,
      submitURL: appArgs.crashReporter,
      uploadToServer: true,
    });
  });
}

let client: net.Socket;
let instances: Map<string, BrowserWindow> = new Map();
const injectCommonJs = fs.readFileSync(path.join(__dirname, '..', 'inject/common.js'));

function sendMessage(client: net.Socket, msg: object) {
  const json = JSON.stringify(msg);
  const byteLen = Buffer.byteLength(json);
  const msgBuffer = Buffer.alloc(4 + byteLen);

  msgBuffer.writeInt32BE(byteLen, 0);
  msgBuffer.write(json, 4, json.length, 'utf8');

  client.write(msgBuffer);
}

function attachListeners(window, id) {
  window.webContents.on("did-finish-load", () => {
    window.webContents.executeJavaScript(injectCommonJs.toString()).then(() => {}).catch((e) => { console.error(e); });

    sendMessage(client, {
      command: "location",
      uid: id,
      url: window.webContents.getURL()
    });
  })

  window.webContents.on("did-navigate-in-page", () => {
    sendMessage(client, {
      command: "location_in_page",
      uid: id,
      url: window.webContents.getURL()
    });
  });

  window.on("closed", () => {
    sendMessage(client, {
      command: "close",
      uid: id
    });
  });
}

let _receiveBuffer: Buffer = null;
function onData(data) {
  console.log(data.toString());
  _receiveBuffer = (null == _receiveBuffer) ? data : Buffer.concat([_receiveBuffer, data]);
  while(null != _receiveBuffer && _receiveBuffer.length > 3) {
      var size = _receiveBuffer.readInt32BE(0);
      if((size + 4) > _receiveBuffer.length) {
          break;
      }

      var json = _receiveBuffer.toString('utf8', 4, (size + 4));
      _receiveBuffer = ((size + 4) == _receiveBuffer.length) ? null : _receiveBuffer.slice((size + 4));

      try {
          var msg = JSON.parse(json);
          let window = instances.get(msg.uid);
          switch(msg.command) {
            case 'open':
              let wnd = createMainWindow(appArgs, app.quit.bind(this), setDockBadge, msg.partition);
              instances.set(msg.uid, wnd);
              attachListeners(wnd, msg.uid);
              break;
            case 'inject':
              if (window) {
                window.webContents.executeJavaScript(msg.script.toString())
                  .then(() => {}).catch((e) => { console.error(e); });
              }
              break;
            case 'show':
              if (window) {
                window.show();
              }
              break;
            case 'hide':
              if (window) {
                window.hide();
              }
              break;
            case 'quit':
              if (window) {
                window.close();
                window.destroy();
              }
              break;
            case 'get_cookies':
              if (window) {
                window.webContents.session.cookies.get({ url: msg.url, name: msg.name })
                  .then((cookies) => {
                    sendMessage(client, {
                      command: "cookies",
                      cookies: cookies,
                      uid: msg.uid
                    });
                  }).catch((e) => { console.log(e); });
              }
              break;
            case 'goto':
              if (window) {
                window.webContents.executeJavaScript(`location.href = "${msg.url}";`)
                  .then(() => {}).catch((e) => { console.error(e); });
              }
              break;
            case 'maximize':
              if (window) {
                window.maximize();
              }
              break;
            case 'minimize':
                if (window) {
                  window.minimize();
                }
                break;
              case 'reload':
                if (window) {
                  window.webContents.reload();
                }
                break;
            case 'devtools':
              if (window) {
                if (window.webContents.isDevToolsOpened()) {
                  window.webContents.closeDevTools();
                } else {
                  window.webContents.openDevTools();
                }
              }
              break;
              case 'devtools':
                if (window) {
                  if (window.webContents.isDevToolsOpened()) {
                    window.webContents.closeDevTools();
                  } else {
                    window.webContents.openDevTools();
                  }
                }
                break;
              case 'get_mute':
                if (window) {
                  sendMessage(client, {
                    command: "mute",
                    state: window.webContents.isAudioMuted(),
                    uid: msg.uid
                  });
                }
                break;
              case 'mute':
                if (window) {
                  window.webContents.setAudioMuted(msg.state)
                }
                break;
          }
      }
      catch(ex) {
          console.error(ex);
      }
  }
}

// quit if singleInstance mode and there's already another instance running
const shouldQuit = appArgs.singleInstance && !app.requestSingleInstanceLock();
if (shouldQuit) {
  app.quit();
} else {
  // app.on('second-instance', () => {
  //   if (mainWindow) {
  //     if (!mainWindow.isVisible()) {
  //       // try
  //       mainWindow.show();
  //     }
  //     if (mainWindow.isMinimized()) {
  //       // minimized
  //       mainWindow.restore();
  //     }
  //     mainWindow.focus();
  //   }
  // });

  app.on('ready', () => {
    client = net.createConnection({ port: 8080 }, () => {
      console.log('connected to server!');
      sendMessage(client, {command: "startup", pid: process.pid})
    });
    
    client.on('data', (data) => { 
      console.log(data.toString());
      onData(data);
    });

    client.on('end', () => {
      console.log('disconnected from server');
    });
    // mainWindow = createMainWindow(appArgs, app.quit.bind(this), setDockBadge);
    
    // createTrayIcon(appArgs, mainWindow);

    // mainWindow.webContents.on("did-finish-load", () => {
    //   if (mainWindow) {
    //     mainWindow.webContents.executeJavaScript(injectCommonJs.toString()).then(() => {}).catch((e) => { console.error(e); });

    //     sendMessage(client, {
    //       command: "location",
    //       url: mainWindow.webContents.getURL()
    //     });
    //   }
    // })

    // mainWindow.webContents.on("did-navigate-in-page", () => {
    //   if (mainWindow) {
    //     sendMessage(client, {
    //       command: "location_in_page",
    //       url: mainWindow.webContents.getURL()
    //     });
    //   }
    // });


    // Register global shortcuts
    // if (appArgs.globalShortcuts) {
    //   appArgs.globalShortcuts.forEach((shortcut) => {
    //     globalShortcut.register(shortcut.key, () => {
    //       shortcut.inputEvents.forEach((inputEvent) => {
    //         mainWindow.webContents.sendInputEvent(inputEvent);
    //       });
    //     });
    //   });
    // }
  });
}

// app.on('new-window-for-tab', () => {
//   mainWindow.emit('new-tab');
// });

app.on('login', (event, webContents, request, authInfo, callback) => {
  // for http authentication
  event.preventDefault();

  if (
    appArgs.basicAuthUsername !== null &&
    appArgs.basicAuthPassword !== null
  ) {
    callback(appArgs.basicAuthUsername, appArgs.basicAuthPassword);
  } else {
    createLoginWindow(callback);
  }
});


