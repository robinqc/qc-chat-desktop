import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { BrowserWindow, app, desktopCapturer, ipcMain } from "electron";

interface ScreenSource {
  id: string;
  name: string;
  thumbnail: string;
  isEmpty: boolean;
}

/**
 * Show a screen/window picker dialog and return the selected source.
 * Returns the Electron DesktopCapturerSource or null if cancelled.
 */
export function showScreenPicker(
  parentWindow: BrowserWindow,
): Promise<Electron.DesktopCapturerSource | null> {
  return new Promise((resolve) => {
    let resolved = false;

    const pickerWindow = new BrowserWindow({
      width: 680,
      height: 500,
      resizable: true,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      parent: parentWindow,
      modal: true,
      backgroundColor: "#1a1a1a",
      show: false,
      closable: true,
      title: "Share Your Screen",
      webPreferences: {
        preload: join(__dirname, "picker-preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    pickerWindow.setMenu(null);

    // Handle IPC: get sources
    const handleGetSources = async (): Promise<ScreenSource[]> => {
      const sources = await desktopCapturer.getSources({
        types: ["screen", "window"],
        thumbnailSize: { width: 300, height: 188 },
        fetchWindowIcons: true,
      });

      return sources.map((source) => ({
        id: source.id,
        name: source.name,
        thumbnail: source.thumbnail.isEmpty()
          ? ""
          : source.thumbnail.toDataURL(),
        isEmpty: source.thumbnail.isEmpty(),
      }));
    };

    // Handle IPC: source selected
    const handleSourceSelected = async (
      _event: Electron.IpcMainEvent,
      sourceId: string,
    ) => {
      if (resolved) return;
      resolved = true;

      const sources = await desktopCapturer.getSources({
        types: ["screen", "window"],
      });

      const selected = sources.find((s) => s.id === sourceId) ?? null;

      cleanup();
      resolve(selected);
    };

    // Handle IPC: cancelled
    const handleCancelled = () => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve(null);
    };

    function cleanup() {
      ipcMain.removeHandler("get-screen-sources");
      ipcMain.removeListener("screen-source-selected", handleSourceSelected);
      ipcMain.removeListener("screen-source-cancelled", handleCancelled);

      if (!pickerWindow.isDestroyed()) {
        pickerWindow.close();
      }
    }

    // Register IPC handlers
    ipcMain.handle("get-screen-sources", handleGetSources);
    ipcMain.on("screen-source-selected", handleSourceSelected);
    ipcMain.on("screen-source-cancelled", handleCancelled);

    // Handle window close (user clicks X)
    pickerWindow.on("closed", () => {
      if (!resolved) {
        resolved = true;
        ipcMain.removeHandler("get-screen-sources");
        ipcMain.removeListener("screen-source-selected", handleSourceSelected);
        ipcMain.removeListener("screen-source-cancelled", handleCancelled);
        resolve(null);
      }
    });

    // Load the picker HTML
    // In packaged app, picker.html is in Resources/ (via extraResource).
    // In dev, it's in the source tree.
    const pickerHtmlPath = app.isPackaged
      ? join(process.resourcesPath, "picker.html")
      : join(app.getAppPath(), "src", "picker.html");
    pickerWindow.loadURL(pathToFileURL(pickerHtmlPath).toString());

    pickerWindow.once("ready-to-show", () => {
      pickerWindow.show();
    });
  });
}
