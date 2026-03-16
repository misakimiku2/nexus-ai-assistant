import React, { useState, useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';

interface WindowControlsProps {
  onClosePanel?: () => void;
}

export const WindowControls: React.FC<WindowControlsProps> = ({ onClosePanel }) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [isTauri, setIsTauri] = useState(false);

  useEffect(() => {
    const checkTauri = async () => {
      try {
        const appWindow = getCurrentWindow();
        setIsTauri(true);
        const maximized = await appWindow.isMaximized();
        setIsMaximized(maximized);
      } catch {
        setIsTauri(false);
      }
    };
    checkTauri();
  }, []);

  const handleMinimize = async () => {
    if (isTauri) {
      const appWindow = getCurrentWindow();
      await appWindow.minimize();
    }
  };

  const handleMaximize = async () => {
    if (isTauri) {
      const appWindow = getCurrentWindow();
      if (isMaximized) {
        await appWindow.unmaximize();
        setIsMaximized(false);
      } else {
        await appWindow.maximize();
        setIsMaximized(true);
      }
    }
  };

  const handleClose = async () => {
    if (isTauri) {
      const appWindow = getCurrentWindow();
      await appWindow.close();
    } else if (onClosePanel) {
      onClosePanel();
    }
  };

  return (
    <div className="flex gap-1.5">
      <button
        onClick={handleMinimize}
        className="w-3 h-3 rounded-full bg-amber-500/80 hover:bg-amber-500 transition-colors"
        title="最小化"
      />
      <button
        onClick={handleMaximize}
        className="w-3 h-3 rounded-full bg-emerald-500/80 hover:bg-emerald-500 transition-colors"
        title={isMaximized ? "还原" : "最大化"}
      />
      <button
        onClick={handleClose}
        className="w-3 h-3 rounded-full bg-red-500/80 hover:bg-red-500 transition-colors"
        title="关闭"
      />
    </div>
  );
};
