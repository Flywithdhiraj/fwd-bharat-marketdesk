const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('fwdDesktopNative', {
 sendNativeMessage(payload) {
 return ipcRenderer.invoke('fwd:native-message', payload || {});
 }
});
