import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Minimize2, X, Minus } from 'lucide-react';
import { cn } from '../lib/utils';
import { useTranslation } from 'react-i18next';

interface CloseConfirmModalProps {
  isOpen: boolean;
  isDarkMode: boolean;
  askEveryTime: boolean;
  onAskEveryTimeChange: (value: boolean) => void;
  onMinimize: () => void;
  onCloseApp: () => void;
  onCancel: () => void;
}

export const CloseConfirmModal: React.FC<CloseConfirmModalProps> = ({
  isOpen,
  isDarkMode,
  askEveryTime,
  onAskEveryTimeChange,
  onMinimize,
  onCloseApp,
  onCancel,
}) => {
  const { t } = useTranslation();

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onCancel}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className={cn(
              "relative w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden border",
              isDarkMode
                ? "bg-zinc-800 border-zinc-700"
                : "bg-white border-zinc-200"
            )}
          >
            <div className={cn(
              "px-6 pt-6 pb-4",
              isDarkMode ? "text-zinc-100" : "text-zinc-900"
            )}>
              <div className="flex items-center justify-center mb-4">
                <div className={cn(
                  "w-14 h-14 rounded-full flex items-center justify-center",
                  isDarkMode ? "bg-zinc-700" : "bg-zinc-100"
                )}>
                  <Minus size={28} className={cn(
                    isDarkMode ? "text-zinc-300" : "text-zinc-600"
                  )} />
                </div>
              </div>

              <h3 className={cn(
                "text-lg font-semibold text-center mb-2",
                isDarkMode ? "text-zinc-100" : "text-zinc-900"
              )}>
                {t('closeConfirm.title')}
              </h3>
              <p className={cn(
                "text-sm text-center mb-6",
                isDarkMode ? "text-zinc-400" : "text-zinc-500"
              )}>
                {t('closeConfirm.message')}
              </p>

              <div className="flex gap-3 mb-5">
                <button
                  onClick={onMinimize}
                  className={cn(
                    "flex-1 flex flex-col items-center justify-center gap-2 py-4 rounded-xl border transition-all",
                    isDarkMode
                      ? "bg-indigo-500/10 border-indigo-500/30 hover:bg-indigo-500/20 text-indigo-400"
                      : "bg-indigo-50 border-indigo-200 hover:bg-indigo-100 text-indigo-600"
                  )}
                >
                  <Minimize2 size={22} />
                  <span className="text-sm font-medium">{t('closeConfirm.minimize')}</span>
                </button>
                <button
                  onClick={onCloseApp}
                  className={cn(
                    "flex-1 flex flex-col items-center justify-center gap-2 py-4 rounded-xl border transition-all",
                    isDarkMode
                      ? "bg-red-500/10 border-red-500/30 hover:bg-red-500/20 text-red-400"
                      : "bg-red-50 border-red-200 hover:bg-red-100 text-red-600"
                  )}
                >
                  <X size={22} />
                  <span className="text-sm font-medium">{t('closeConfirm.closeApp')}</span>
                </button>
              </div>

              <label className={cn(
                "flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors",
                isDarkMode
                  ? "bg-zinc-700/50 hover:bg-zinc-700"
                  : "bg-zinc-50 hover:bg-zinc-100"
              )}>
                <span className={cn(
                  "text-sm",
                  isDarkMode ? "text-zinc-300" : "text-zinc-600"
                )}>
                  {t('closeConfirm.askEveryTime')}
                </span>
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={askEveryTime}
                    onChange={(e) => onAskEveryTimeChange(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className={cn(
                    "w-9 h-5 rounded-full transition-colors",
                    isDarkMode ? "bg-zinc-600" : "bg-zinc-300",
                    "peer-checked:bg-indigo-500"
                  )} />
                  <div className={cn(
                    "absolute top-[2px] left-[2px] w-4 h-4 bg-white rounded-full transition-transform shadow-sm",
                    "peer-checked:translate-x-4"
                  )} />
                </div>
              </label>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
