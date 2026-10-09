const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('blitz', Object.freeze({
  action: (name, value) => ipcRenderer.invoke('blitz:action', name, value),
  subscribe: callback => { const listener = (_event, state) => callback(state); ipcRenderer.on('blitz:state', listener); return () => ipcRenderer.removeListener('blitz:state', listener); },
}));
