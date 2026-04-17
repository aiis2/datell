import React, { useState } from 'react';
import { X, FileSpreadsheet, FileText, Image as ImageIcon, File } from 'lucide-react';
import type { FileAttachment } from '../types';

interface Props {
  attachment: FileAttachment;
  onRemove?: () => void;
}

const FilePreview: React.FC<Props> = ({ attachment, onRemove }) => {
  const [previewOpen, setPreviewOpen] = useState(false);
  const iconMap = {
    excel: <FileSpreadsheet size={14} className="text-green-600" />,
    csv: <FileText size={14} className="text-blue-600" />,
    image: <ImageIcon size={14} className="text-purple-600" />,
    pdf: <FileText size={14} className="text-red-600" />,
    unknown: <File size={14} className="text-gray-600" />,
  };

  const sizeStr = attachment.size < 1024
    ? `${attachment.size}B`
    : attachment.size < 1024 * 1024
      ? `${(attachment.size / 1024).toFixed(1)}KB`
      : `${(attachment.size / 1024 / 1024).toFixed(1)}MB`;

  // Show thumbnail for image attachments
  if (attachment.type === 'image' && attachment.data) {
    const src = attachment.data.startsWith('data:') ? attachment.data : `data:image/*;base64,${attachment.data}`;
    return (
      <>
        <div className="relative group flex-shrink-0">
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            title={`预览 ${attachment.name}`}
            className="block"
          >
            <img
              src={src}
              alt={attachment.name}
              className="w-16 h-16 rounded-lg object-cover border border-gray-200 dark:border-gray-600"
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 rounded-lg transition-colors" />
            <div className="absolute bottom-0 left-0 right-0 px-1 py-0.5 bg-black/50 rounded-b-lg text-[9px] text-white truncate opacity-0 group-hover:opacity-100 transition-opacity">
              {attachment.name}
            </div>
          </button>
          {onRemove && (
            <button
              onClick={(e) => { e.stopPropagation(); onRemove(); }}
              title="移除图片"
              className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
            >
              <X size={10} />
            </button>
          )}
        </div>
        {previewOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
            onClick={() => setPreviewOpen(false)}
          >
            <button
              onClick={() => setPreviewOpen(false)}
              title="关闭预览"
              className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            >
              <X size={18} />
            </button>
            <div
              className="max-w-[90vw] max-h-[90vh] flex flex-col items-center gap-3"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={src}
                alt={attachment.name}
                className="max-w-[90vw] max-h-[82vh] object-contain rounded-xl shadow-2xl bg-white"
              />
              <div className="text-xs text-white/90 bg-black/40 px-3 py-1.5 rounded-full max-w-[80vw] truncate">
                {attachment.name}
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="flex items-center gap-1.5 bg-gray-100 dark:bg-gray-700 rounded-lg px-2.5 py-1.5 text-xs group">
      {iconMap[attachment.type]}
      <span className="truncate max-w-[120px] text-gray-700 dark:text-gray-300">{attachment.name}</span>
      <span className="text-gray-400">{sizeStr}</span>
      {onRemove && (
        <button
          onClick={onRemove}
          title="移除附件"
          className="ml-0.5 opacity-0 group-hover:opacity-100 p-0.5 hover:text-red-500 transition-all"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
};

export default FilePreview;
