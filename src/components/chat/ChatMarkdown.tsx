'use client';

import React from 'react';

interface ChatMarkdownProps {
  content: string;
  isCustomer?: boolean;
}

/**
 * Robust, lightweight inline parser that converts Markdown formatting
 * (**bold**, *italic*, bullets, order badges, phone links, URLs) into clean React elements.
 * Eliminates raw markdown asterisks and unparsed formatting in chat bubbles.
 */
export const ChatMarkdown: React.FC<ChatMarkdownProps> = ({ content, isCustomer = false }) => {
  if (!content) return null;

  // Split into lines for block processing (bullet lists, paragraphs)
  const lines = content.split('\n');

  const parseInline = (text: string, keyPrefix: string): React.ReactNode[] => {
    // Regex matching bold (**text**), italics (*text*), order numbers (BPG-\d+), phone numbers, URLs
    const tokenRegex = /(\*\*[^*]+\*\*|\*[^*]+\*|https?:\/\/[^\s)]+|\+?91[\s-]?\d{5}[\s-]?\d{5}|\b[6-9]\d{9}\b|\bBPG-?\d{3,8}\b)/g;

    const parts = text.split(tokenRegex);

    return parts.map((part, index) => {
      const key = `${keyPrefix}-${index}`;
      if (!part) return null;

      // Bold: **text**
      if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
        return (
          <strong
            key={key}
            className={`font-black ${isCustomer ? 'text-white' : 'text-slate-900'}`}
          >
            {part.slice(2, -2)}
          </strong>
        );
      }

      // Italic: *text*
      if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
        return (
          <em key={key} className="italic opacity-90">
            {part.slice(1, -1)}
          </em>
        );
      }

      // Order ID badge: BPG-XXXX
      if (/^BPG-?\d{3,8}$/i.test(part)) {
        return (
          <span
            key={key}
            className={`inline-block px-1.5 py-0.5 rounded font-mono font-bold text-[10.5px] ${
              isCustomer
                ? 'bg-blue-800/60 text-blue-100 border border-blue-400/40'
                : 'bg-blue-50 text-blue-700 border border-blue-200'
            }`}
          >
            {part.toUpperCase()}
          </span>
        );
      }

      // Phone number: +91 98404 18228 or 9840418228
      if (/^(\+?91[\s-]?)?[6-9]\d{9}$/.test(part.replace(/[\s-]/g, ''))) {
        const cleanPhone = part.replace(/\D/g, '').slice(-10);
        return (
          <a
            key={key}
            href={`tel:+91${cleanPhone}`}
            className={`underline font-bold transition-opacity hover:opacity-80 ${
              isCustomer ? 'text-blue-100' : 'text-[#2874f0]'
            }`}
          >
            {part}
          </a>
        );
      }

      // URL link
      if (/^https?:\/\//.test(part)) {
        return (
          <a
            key={key}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className={`underline break-all font-semibold ${
              isCustomer ? 'text-white' : 'text-blue-600 hover:text-blue-800'
            }`}
          >
            {part}
          </a>
        );
      }

      return <React.Fragment key={key}>{part}</React.Fragment>;
    });
  };

  return (
    <div className="space-y-1.5 leading-relaxed">
      {lines.map((line, lineIndex) => {
        const trimmed = line.trim();

        // Empty line
        if (!trimmed) {
          return <div key={`line-${lineIndex}`} className="h-1.5" />;
        }

        // Bullet point: • or * or -
        const isBullet = /^[•*-]\s+/.test(trimmed);
        if (isBullet) {
          const bulletText = trimmed.replace(/^[•*-]\s+/, '');
          return (
            <div
              key={`line-${lineIndex}`}
              className="flex items-start gap-2 ml-1 my-0.5 text-xs"
            >
              <span
                className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${
                  isCustomer ? 'bg-white/80' : 'bg-blue-600'
                }`}
              />
              <span className="flex-1">{parseInline(bulletText, `bullet-${lineIndex}`)}</span>
            </div>
          );
        }

        return (
          <p key={`line-${lineIndex}`} className="text-xs">
            {parseInline(line, `p-${lineIndex}`)}
          </p>
        );
      })}
    </div>
  );
};
