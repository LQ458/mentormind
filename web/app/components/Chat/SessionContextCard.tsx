
import React from 'react';

interface SessionContextCardProps {
  type: 'image' | 'audio' | 'document';
  title: string;
  summary: string;
  timestamp: Date;
  onRemove?: () => void;
}

export default function SessionContextCard({ 
  type, 
  title, 
  summary, 
  timestamp,
  onRemove 
}: SessionContextCardProps) {
  const icons = {
    image: (
      <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
    audio: (
      <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
      </svg>
    ),
    document: (
      <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    )
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow relative group">
      <div className="flex items-start space-x-3">
        <div className="mt-1">
          {icons[type]}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
            {type === 'image' ? 'Image Context' : type === 'audio' ? 'Audio Context' : 'Context'}
          </div>
          <p className="text-sm text-gray-800 font-medium line-clamp-2 mb-1">
            {summary}
          </p>
          <div className="text-[10px] text-gray-400">
            {timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
        {onRemove && (
          <button 
            onClick={onRemove}
            className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
            title="Remove context"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
