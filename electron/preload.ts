import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("openplayAPI", {
  invoke: (command: string, args?: any) => {
    return ipcRenderer.invoke("openplay:invoke", command, args);
  },
  listen: (event: string, callback: (eventData: { payload: any }) => void) => {
    const handler = (_: any, data: { event: string; payload: any }) => {
      if (data.event === event) {
        callback({ payload: data.payload });
      }
    };
    ipcRenderer.on("openplay:event", handler);
    return () => {
      ipcRenderer.removeListener("openplay:event", handler);
    };
  },
  convertFileSrc: (filePath: string): string => {
    if (!filePath) return "";
    if (
      filePath.startsWith("http://") ||
      filePath.startsWith("https://") ||
      filePath.startsWith("data:") ||
      filePath.startsWith("blob:") ||
      filePath.startsWith("asset:") ||
      filePath.startsWith("openplay://")
    ) {
      return filePath;
    }
    const normalized = filePath.replace(/\\/g, "/");
    const leadingSlash = normalized.startsWith("/") ? normalized : "/" + normalized;
    return `openplay://file${encodeURI(leadingSlash)}`;
  },
  minimize: () => ipcRenderer.invoke("openplay:window:minimize"),
  restore: () => ipcRenderer.invoke("openplay:window:restore"),
  maximize: () => ipcRenderer.invoke("openplay:window:maximize"),
  close: () => ipcRenderer.invoke("openplay:window:close"),
  isMaximized: () => ipcRenderer.invoke("openplay:window:isMaximized"),
  setFullscreen: (enabled: boolean, displayId?: string) =>
    ipcRenderer.invoke("openplay:window:setFullscreen", enabled, displayId),
  isFullscreen: () => ipcRenderer.invoke("openplay:window:isFullscreen"),
  getDisplays: () => ipcRenderer.invoke("openplay:window:getDisplays"),
});
