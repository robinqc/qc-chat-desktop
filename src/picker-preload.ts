import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("screenPicker", {
  getSources: () => ipcRenderer.invoke("get-screen-sources"),
  selectSource: (sourceId: string) =>
    ipcRenderer.send("screen-source-selected", sourceId),
  cancel: () => ipcRenderer.send("screen-source-cancelled"),
});
