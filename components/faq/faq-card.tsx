'use client';

import React from 'react';
import { ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { STANDARD_DISCLAIMER, type FAQItem } from '@/app/faq/faq-data';

interface FAQCardProps {
  faq: FAQItem;
  isOpen: boolean;
  onToggle: () => void;
}

/**
 * Parse simple markdown-style text to JSX
 * Handles: **bold**, [links](url), bullet/numbered lists, paragraphs
 */
function parseMarkdownToJSX(text: string): React.ReactElement {
  const lines = text.split('\n');
  const elements: React.ReactElement[] = [];
  let listItems: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let listKey = 0;

  const flushList = () => {
    if (listItems.length > 0 && listType) {
      const ListTag = listType;
      elements.push(
        <ListTag key={`list-${listKey++}`} className={ListTag === 'ul' ? 'list-disc list-inside space-y-2 ml-4 mb-3' : 'list-decimal list-inside space-y-2 ml-4 mb-3'}>
          {listItems.map((item, i) => (
            <li key={i} dangerouslySetInnerHTML={{ __html: parseInlineFormatting(item) }} />
          ))}
        </ListTag>
      );
      listItems = [];
      listType = null;
    }
  };

  const parseInlineFormatting = (line: string): string => {
    // Bold: **text**
    line = line.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-slate-900">$1</strong>');
    
    // Links: [text](url)
    line = line.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => {
      const isInternal = url.startsWith('/');
      if (isInternal) {
        return `<a href="${url}" class="text-[#FDB022] hover:text-[#E69E1A] underline">${text}</a>`;
      }
      return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-[#FDB022] hover:text-[#E69E1A] underline">${text}</a>`;
    });
    
    return line;
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    
    // Empty line
    if (!trimmed) {
      flushList();
      return;
    }

    // Unordered list item
    if (trimmed.match(/^[-*]\s+(.+)/)) {
      const content = trimmed.replace(/^[-*]\s+/, '');
      if (listType !== 'ul') {
        flushList();
        listType = 'ul';
      }
      listItems.push(content);
      return;
    }

    // Ordered list item
    if (trimmed.match(/^\d+\.\s+(.+)/)) {
      const content = trimmed.replace(/^\d+\.\s+/, '');
      if (listType !== 'ol') {
        flushList();
        listType = 'ol';
      }
      listItems.push(content);
      return;
    }

    // Regular paragraph
    flushList();
    if (trimmed) {
      elements.push(
        <p key={index} className="mb-3" dangerouslySetInnerHTML={{ __html: parseInlineFormatting(trimmed) }} />
      );
    }
  });

  flushList(); // Flush any remaining list

  return <>{elements}</>;
}

export function FAQCard({ faq, isOpen, onToggle }: FAQCardProps) {
  return (
    <div
      id={faq.id}
      className="bg-white rounded-lg border-2 border-slate-200 overflow-hidden hover:border-slate-300 transition-colors scroll-mt-8"
    >
      <button
        onClick={onToggle}
        className="w-full px-6 py-4 text-left flex items-center justify-between gap-4 hover:bg-slate-50 transition-colors"
        aria-expanded={isOpen}
        aria-controls={`faq-content-${faq.id}`}
      >
        <h3 className="text-lg font-semibold text-slate-900 flex-1">
          {faq.question}
        </h3>
        <ChevronDown
          className={`w-5 h-5 text-slate-600 flex-shrink-0 transition-transform duration-200 ${
            isOpen ? 'transform rotate-180' : ''
          }`}
          aria-hidden="true"
        />
      </button>

      <div
        id={`faq-content-${faq.id}`}
        className={`overflow-hidden transition-all duration-300 ease-in-out ${
          isOpen ? 'max-h-[5000px] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 text-slate-700 leading-relaxed">
          {/* Disclaimer if needed */}
          {faq.hasDisclaimer && (
            <div className="bg-amber-50 border-2 border-amber-400 rounded-lg p-4 mb-4">
              <p className="text-sm font-semibold text-amber-900 mb-1">
                {STANDARD_DISCLAIMER.title}
              </p>
              <p className="text-sm text-amber-900">
                {faq.disclaimerText || STANDARD_DISCLAIMER.text}
              </p>
            </div>
          )}

          {/* FAQ Answer Content */}
          <div className="space-y-3">
            {parseMarkdownToJSX(faq.answer)}
          </div>
        </div>
      </div>
    </div>
  );
}
