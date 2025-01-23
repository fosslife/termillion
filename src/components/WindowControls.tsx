import React from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

const WindowControls: React.FC = () => {
  const appWindow = getCurrentWindow();

  const handleMinimize = () => {
    appWindow.minimize();
  };

  const handleMaximize = async () => {
    const isMaximized = await appWindow.isMaximized();
    if (isMaximized) {
      appWindow.unmaximize();
    } else {
      appWindow.maximize();
    }
  };

  const handleClose = () => {
    appWindow.close();
  };

  return (
    <div data-tauri-drag-region className="titlebar">
      <div className="titlebar-button" onClick={handleMinimize}>
        <img
          src="https://api.iconify.design/mdi:window-minimize.svg"
          alt="minimize"
        />
      </div>
      <div className="titlebar-button" onClick={handleMaximize}>
        <img
          src="https://api.iconify.design/mdi:window-maximize.svg"
          alt="maximize"
        />
      </div>
      <div className="titlebar-button" onClick={handleClose}>
        <img src="https://api.iconify.design/mdi:close.svg" alt="close" />
      </div>
    </div>
  );
};

export default WindowControls;
