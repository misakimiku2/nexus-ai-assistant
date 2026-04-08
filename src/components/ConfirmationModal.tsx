import React from 'react';
import { X } from 'lucide-react';

interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  message?: string;
  children?: React.ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  title,
  message,
  children,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 rounded-xl shadow-2xl w-full max-w-md p-6 animate-in fade-in zoom-in duration-200">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">{title}</h3>
          <button onClick={onCancel} className="text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors">
            <X size={20} />
          </button>
        </div>
        {message && <p className="text-zinc-600 dark:text-zinc-300 mb-6">{message}</p>}
        {children && <div className="mb-6">{children}</div>}
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg bg-zinc-100 dark:bg-zinc-600 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-500 transition-colors"
          >
            取消
          </button>
          <button
            onClick={() => {
              onConfirm();
              onCancel();
            }}
            className="px-4 py-2 rounded-lg bg-red-500/10 dark:bg-red-500/20 text-red-600 dark:text-red-400 hover:bg-red-500/20 dark:hover:bg-red-500/30 transition-colors"
          >
            确认删除
          </button>
        </div>
      </div>
    </div>
  );
};
