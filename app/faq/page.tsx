'use client';

import { useState } from 'react';
import { Navigation } from '@/components/polycopy/navigation';
import { FAQCard } from '@/components/faq/faq-card';
import { faqData, FAQ_CATEGORIES } from './faq-data';

export default function FAQPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  // Filter FAQs based on search query
  const filteredFaqs = faqData.filter(faq =>
    faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
    faq.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
    faq.answer.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleFaq = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <Navigation />
      
      <div className="max-w-4xl mx-auto px-4 py-16">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4">
            Frequently Asked Questions
          </h1>
          <p className="text-lg text-slate-600 mb-8">
            Everything you need to know about Polycopy copy trading
          </p>

          {/* Search Box */}
          <div className="max-w-2xl mx-auto">
            <div className="relative">
              <input
                type="text"
                placeholder="Search FAQs... (e.g., 'wallet', 'premium', 'security')"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-3 pl-12 border-2 border-slate-300 rounded-lg focus:border-[#FDB022] focus:outline-none text-slate-900 placeholder-slate-400"
              />
              <svg
                className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
            {searchQuery && (
              <p className="text-sm text-slate-600 mt-2">
                Found {filteredFaqs.length} result{filteredFaqs.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>
        </div>

        {/* FAQ Sections */}
        <div className="space-y-12">
          {FAQ_CATEGORIES.map((category) => {
            const categoryFaqs = filteredFaqs.filter((faq) => faq.category === category);
            
            if (categoryFaqs.length === 0) return null;

            return (
              <section key={category} id={category.toLowerCase().replace(/\s+/g, '-')} className="scroll-mt-8">
                <h2 className="text-2xl font-bold text-slate-900 mb-6 pb-3 border-b-2 border-[#FDB022]">
                  {category}
                </h2>

                <div className="space-y-3">
                  {categoryFaqs.map((faq) => {
                    const globalIndex = faqData.indexOf(faq);
                    const isOpen = openIndex === globalIndex;

                    return (
                      <FAQCard
                        key={faq.id}
                        faq={faq}
                        isOpen={isOpen}
                        onToggle={() => toggleFaq(globalIndex)}
                      />
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>

        {/* No Results */}
        {filteredFaqs.length === 0 && (
          <div className="text-center py-12">
            <p className="text-slate-600 text-lg mb-4">No FAQs found matching "{searchQuery}"</p>
            <button
              onClick={() => setSearchQuery('')}
              className="text-[#FDB022] hover:text-[#E69E1A] font-medium underline"
            >
              Clear search
            </button>
          </div>
        )}

        {/* Footer CTA */}
        <div className="mt-16 bg-gradient-to-r from-[#FDB022] to-[#E69E1A] rounded-xl p-8 text-center">
          <h3 className="text-2xl font-bold text-black mb-4">
            Still have questions?
          </h3>
          <p className="text-black/80 mb-6">
            We're here to help! Reach out to our support team.
          </p>
          <div className="flex justify-center">
            <a
              href="https://twitter.com/polycopyapp"
              target="_blank"
              rel="noopener noreferrer"
              className="px-6 py-3 bg-black text-white rounded-lg font-semibold hover:bg-slate-800 transition-colors"
            >
              DM us on X
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
