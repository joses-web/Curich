// mock_electron.js
const path = require('path');
const os = require('os');
const fs = require('fs');

const userDataPath = path.join(os.tmpdir(), 'flo-pos-mock-data');
if (!fs.existsSync(userDataPath)) {
  fs.mkdirSync(userDataPath, { recursive: true });
}

const mockElectron = {
  app: {
    getPath: (name) => {
      if (name === 'userData') {
        return userDataPath;
      }
      return os.tmpdir();
    },
    getVersion: () => '1.0.0',
    isPackaged: false,
  },
  ipcMain: {
    handle: () => {},
    on: () => {},
  },
  dialog: {
    showMessageBox: () => Promise.resolve({ response: 0 }),
  },
};

const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function (id) {
  if (id === 'electron') {
    return mockElectron;
  }
  return originalRequire.apply(this, arguments);
};

module.exports = mockElectron;
