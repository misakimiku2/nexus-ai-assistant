import React from 'react';
import { X, FileText, FileCode, FileSpreadsheet, FileType, File } from 'lucide-react';
import { cn } from '../lib/utils';
import { Attachment } from '../types';

interface AttachmentPreviewProps {
  attachment: Attachment;
  onRemove: (id: string) => void;
  isDarkMode: boolean;
}

const getFileIcon = (mimeType: string, fileName: string): React.ElementType => {
  const extension = fileName.split('.').pop()?.toLowerCase() || '';
  
  const codeExtensions = ['js', 'jsx', 'ts', 'tsx', 'py', 'java', 'c', 'cpp', 'h', 'hpp', 'cs', 'go', 'rs', 'php', 'rb', 'swift', 'kt', 'kts', 'html', 'css', 'scss', 'less', 'json', 'xml', 'yaml', 'yml', 'md', 'sh', 'bash', 'sql'];
  const spreadsheetExtensions = ['xlsx', 'xls', 'csv'];
  const documentExtensions = ['pdf', 'doc', 'docx', 'txt'];
  
  if (codeExtensions.includes(extension)) return FileCode;
  if (spreadsheetExtensions.includes(extension)) return FileSpreadsheet;
  if (documentExtensions.includes(extension)) return FileType;
  
  if (mimeType.includes('pdf') || mimeType.includes('document') || mimeType.includes('word')) {
    return FileType;
  }
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType.includes('csv')) {
    return FileSpreadsheet;
  }
  if (mimeType.includes('javascript') || mimeType.includes('typescript') || mimeType.includes('python') || 
      mimeType.includes('java') || mimeType.includes('c') || mimeType.includes('code')) {
    return FileCode;
  }
  
  return FileText;
};

const getFileExtension = (fileName: string): string => {
  return fileName.split('.').pop()?.toUpperCase() || 'FILE';
};

const getFileStyle = (fileName: string, isDarkMode: boolean): { bg: string; text: string; icon: string } => {
  const extension = fileName.split('.').pop()?.toLowerCase() || '';
  
  const styles: Record<string, { bgLight: string; bgDark: string; textLight: string; textDark: string; iconLight: string; iconDark: string }> = {
    pdf: { 
      bgLight: 'bg-red-50 border-red-200', 
      bgDark: 'bg-red-950/50 border-red-800',
      textLight: 'text-red-700',
      textDark: 'text-red-300',
      iconLight: 'text-red-500',
      iconDark: 'text-red-400'
    },
    doc: { 
      bgLight: 'bg-blue-50 border-blue-200', 
      bgDark: 'bg-blue-950/50 border-blue-800',
      textLight: 'text-blue-700',
      textDark: 'text-blue-300',
      iconLight: 'text-blue-500',
      iconDark: 'text-blue-400'
    },
    docx: { 
      bgLight: 'bg-blue-50 border-blue-200', 
      bgDark: 'bg-blue-950/50 border-blue-800',
      textLight: 'text-blue-700',
      textDark: 'text-blue-300',
      iconLight: 'text-blue-500',
      iconDark: 'text-blue-400'
    },
    txt: { 
      bgLight: 'bg-gray-50 border-gray-200', 
      bgDark: 'bg-gray-800/50 border-gray-700',
      textLight: 'text-gray-700',
      textDark: 'text-gray-300',
      iconLight: 'text-gray-500',
      iconDark: 'text-gray-400'
    },
    xlsx: { 
      bgLight: 'bg-green-50 border-green-200', 
      bgDark: 'bg-green-950/50 border-green-800',
      textLight: 'text-green-700',
      textDark: 'text-green-300',
      iconLight: 'text-green-500',
      iconDark: 'text-green-400'
    },
    xls: { 
      bgLight: 'bg-green-50 border-green-200', 
      bgDark: 'bg-green-950/50 border-green-800',
      textLight: 'text-green-700',
      textDark: 'text-green-300',
      iconLight: 'text-green-500',
      iconDark: 'text-green-400'
    },
    csv: { 
      bgLight: 'bg-emerald-50 border-emerald-200', 
      bgDark: 'bg-emerald-950/50 border-emerald-800',
      textLight: 'text-emerald-700',
      textDark: 'text-emerald-300',
      iconLight: 'text-emerald-500',
      iconDark: 'text-emerald-400'
    },
    js: { 
      bgLight: 'bg-yellow-50 border-yellow-200', 
      bgDark: 'bg-yellow-950/50 border-yellow-800',
      textLight: 'text-yellow-700',
      textDark: 'text-yellow-300',
      iconLight: 'text-yellow-500',
      iconDark: 'text-yellow-400'
    },
    jsx: { 
      bgLight: 'bg-yellow-50 border-yellow-200', 
      bgDark: 'bg-yellow-950/50 border-yellow-800',
      textLight: 'text-yellow-700',
      textDark: 'text-yellow-300',
      iconLight: 'text-yellow-500',
      iconDark: 'text-yellow-400'
    },
    ts: { 
      bgLight: 'bg-blue-50 border-blue-200', 
      bgDark: 'bg-blue-950/50 border-blue-800',
      textLight: 'text-blue-700',
      textDark: 'text-blue-300',
      iconLight: 'text-blue-500',
      iconDark: 'text-blue-400'
    },
    tsx: { 
      bgLight: 'bg-blue-50 border-blue-200', 
      bgDark: 'bg-blue-950/50 border-blue-800',
      textLight: 'text-blue-700',
      textDark: 'text-blue-300',
      iconLight: 'text-blue-500',
      iconDark: 'text-blue-400'
    },
    py: { 
      bgLight: 'bg-indigo-50 border-indigo-200', 
      bgDark: 'bg-indigo-950/50 border-indigo-800',
      textLight: 'text-indigo-700',
      textDark: 'text-indigo-300',
      iconLight: 'text-indigo-500',
      iconDark: 'text-indigo-400'
    },
    java: { 
      bgLight: 'bg-orange-50 border-orange-200', 
      bgDark: 'bg-orange-950/50 border-orange-800',
      textLight: 'text-orange-700',
      textDark: 'text-orange-300',
      iconLight: 'text-orange-500',
      iconDark: 'text-orange-400'
    },
    go: { 
      bgLight: 'bg-cyan-50 border-cyan-200', 
      bgDark: 'bg-cyan-950/50 border-cyan-800',
      textLight: 'text-cyan-700',
      textDark: 'text-cyan-300',
      iconLight: 'text-cyan-500',
      iconDark: 'text-cyan-400'
    },
    rs: { 
      bgLight: 'bg-orange-50 border-orange-200', 
      bgDark: 'bg-orange-950/50 border-orange-800',
      textLight: 'text-orange-700',
      textDark: 'text-orange-300',
      iconLight: 'text-orange-500',
      iconDark: 'text-orange-400'
    },
    html: { 
      bgLight: 'bg-orange-50 border-orange-200', 
      bgDark: 'bg-orange-950/50 border-orange-800',
      textLight: 'text-orange-700',
      textDark: 'text-orange-300',
      iconLight: 'text-orange-500',
      iconDark: 'text-orange-400'
    },
    css: { 
      bgLight: 'bg-purple-50 border-purple-200', 
      bgDark: 'bg-purple-950/50 border-purple-800',
      textLight: 'text-purple-700',
      textDark: 'text-purple-300',
      iconLight: 'text-purple-500',
      iconDark: 'text-purple-400'
    },
    json: { 
      bgLight: 'bg-amber-50 border-amber-200', 
      bgDark: 'bg-amber-950/50 border-amber-800',
      textLight: 'text-amber-700',
      textDark: 'text-amber-300',
      iconLight: 'text-amber-500',
      iconDark: 'text-amber-400'
    },
    md: { 
      bgLight: 'bg-slate-50 border-slate-200', 
      bgDark: 'bg-slate-800/50 border-slate-700',
      textLight: 'text-slate-700',
      textDark: 'text-slate-300',
      iconLight: 'text-slate-500',
      iconDark: 'text-slate-400'
    },
    sql: { 
      bgLight: 'bg-violet-50 border-violet-200', 
      bgDark: 'bg-violet-950/50 border-violet-800',
      textLight: 'text-violet-700',
      textDark: 'text-violet-300',
      iconLight: 'text-violet-500',
      iconDark: 'text-violet-400'
    },
  };
  
  const defaultStyle = {
    bgLight: 'bg-zinc-100 border-zinc-200',
    bgDark: 'bg-zinc-700 border-zinc-600',
    textLight: 'text-zinc-600',
    textDark: 'text-zinc-300',
    iconLight: 'text-zinc-500',
    iconDark: 'text-zinc-400'
  };
  
  const style = styles[extension] || defaultStyle;
  
  return {
    bg: isDarkMode ? style.bgDark : style.bgLight,
    text: isDarkMode ? style.textDark : style.textLight,
    icon: isDarkMode ? style.iconDark : style.iconLight
  };
};

export const AttachmentPreview: React.FC<AttachmentPreviewProps> = ({
  attachment,
  onRemove,
  isDarkMode
}) => {
  const [isHovered, setIsHovered] = React.useState(false);
  
  if (attachment.type === 'image') {
    return (
      <div 
        className="relative group"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div className={cn(
          "w-16 h-16 rounded-lg overflow-hidden border",
          isDarkMode ? "border-zinc-600" : "border-zinc-200"
        )}>
          <img 
            src={attachment.data} 
            alt={attachment.name}
            className="w-full h-full object-cover"
            style={{ 
              imageRendering: 'auto',
              WebkitFontSmoothing: 'antialiased',
              MozOsxFontSmoothing: 'grayscale',
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              transform: 'translateZ(0)',
              WebkitTransform: 'translateZ(0)'
            }}
            decoding="async"
          />
        </div>
        <button 
          onClick={() => onRemove(attachment.id)}
          className={cn(
            "absolute -top-1.5 -right-1.5 p-1 rounded-full bg-red-500 text-white hover:bg-red-600 transition-all shadow-sm",
            isHovered ? "opacity-100 scale-100" : "opacity-0 scale-75"
          )}
        >
          <X size={10} />
        </button>
      </div>
    );
  }
  
  const FileIcon = getFileIcon(attachment.mimeType, attachment.name);
  const extension = getFileExtension(attachment.name);
  const fileStyle = getFileStyle(attachment.name, isDarkMode);
  
  return (
    <div 
      className="relative group"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className={cn(
        "w-16 h-16 rounded-lg border flex flex-col items-center justify-center p-1 gap-0.5 transition-colors",
        fileStyle.bg
      )}>
        <FileIcon size={20} className={cn("shrink-0", fileStyle.icon)} />
        <span className={cn(
          "text-[9px] font-bold leading-none",
          fileStyle.text
        )}>
          {extension}
        </span>
      </div>
      <button 
        onClick={() => onRemove(attachment.id)}
        className={cn(
          "absolute -top-1.5 -right-1.5 p-1 rounded-full bg-red-500 text-white hover:bg-red-600 transition-all shadow-sm",
          isHovered ? "opacity-100 scale-100" : "opacity-0 scale-75"
        )}
      >
        <X size={10} />
      </button>
    </div>
  );
};

interface AttachmentListProps {
  attachments: Attachment[];
  onRemove: (id: string) => void;
  isDarkMode: boolean;
  maxPreviewNameLength?: number;
}

export const AttachmentList: React.FC<AttachmentListProps> = ({
  attachments,
  onRemove,
  isDarkMode,
  maxPreviewNameLength = 20
}) => {
  if (attachments.length === 0) return null;
  
  const truncateFileName = (name: string, maxLength: number): string => {
    if (name.length <= maxLength) return name;
    const extension = name.split('.').pop() || '';
    const nameWithoutExt = name.slice(0, -(extension.length + 1));
    const truncatedName = nameWithoutExt.slice(0, maxLength - extension.length - 4);
    return `${truncatedName}...${extension}`;
  };
  
  return (
    <div className="flex flex-wrap gap-2">
      {attachments.map(attachment => (
        <div key={attachment.id} className="flex flex-col items-center gap-1">
          <AttachmentPreview
            attachment={attachment}
            onRemove={onRemove}
            isDarkMode={isDarkMode}
          />
          {attachment.type !== 'image' && (
            <span className={cn(
              "text-[9px] max-w-[60px] truncate text-center",
              isDarkMode ? "text-zinc-400" : "text-zinc-500"
            )} title={attachment.name}>
              {truncateFileName(attachment.name, maxPreviewNameLength)}
            </span>
          )}
        </div>
      ))}
    </div>
  );
};
