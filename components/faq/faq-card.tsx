'use client';

import React from 'react';
import { ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { STANDARD_DISCLAIMER, type FAQItem } from '@/app/(seo)/faq/faq-data';

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
    line = line.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-poly-black">$1</strong>');
    
    // Links: [text](url)
    line = line.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => {
      const isInternal = url.startsWith('/');
      if (isInternal) {
        return `<a href="${url}" class="text-poly-yellow hover:text-poly-yellow-hover underline">${text}</a>`;
      }
      return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-poly-yellow hover:text-poly-yellow-hover underline">${text}</a>`;
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
      className="border border-border bg-card overflow-hidden transition-colors hover:border-poly-yellow scroll-mt-8"
    >
      <button
        onClick={onToggle}
        className="w-full px-6 py-4 text-left flex items-center justify-between gap-4 hover:bg-poly-cream transition-colors"
        aria-expanded={isOpen}
        aria-controls={`faq-content-${faq.id}`}
      >
        <h3 className="font-sans font-bold uppercase text-poly-black flex-1">
          {faq.question}
        </h3>
        <ChevronDown
          className={`w-5 h-5 text-muted-foreground flex-shrink-0 transition-transform duration-200 ${
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
        <div className="px-6 py-4 border-t border-border bg-poly-paper font-body text-sm leading-relaxed text-muted-foreground">
          {/* Disclaimer if needed */}
          {faq.hasDisclaimer && (
            <div className="border border-border bg-poly-paper p-4 mb-4 border-l-4 border-l-poly-yellow">
              <p className="font-sans font-bold uppercase text-poly-black mb-1">
                {STANDARD_DISCLAIMER.title}
              </p>
              <p className="font-body text-sm text-muted-foreground">
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
