'use client';

import { useState } from 'react';
import Script from 'next/script';
import { FAQCard } from '@/components/faq/faq-card';
import { faqData, FAQ_CATEGORIES } from './faq-data';

export default function FAQPage() {
  // Generate FAQ structured data for Google
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqData.map(faq => ({
      "@type": "Question",
      "name": faq.question,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": faq.answer
      }
    }))
  };
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
    <div className="min-h-screen bg-poly-cream">
      {/* FAQ Schema for rich snippets in search results */}
      <Script id="faq-schema" type="application/ld+json" strategy="beforeInteractive">
        {JSON.stringify(faqSchema)}
      </Script>

      <div className="max-w-4xl mx-auto px-4 py-16">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="font-sans font-black uppercase tracking-tight text-4xl md:text-5xl text-poly-black mb-4">
            Frequently Asked Questions
          </h1>
          <p className="font-body text-lg text-muted-foreground mb-8">
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
                className="w-full px-4 py-3 pl-12 border border-border bg-card font-body text-sm text-poly-black placeholder-muted-foreground focus:border-poly-yellow focus:outline-none"
              />
              <svg
                className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground"
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
              <p className="font-body text-sm text-muted-foreground mt-2">
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
                <h2 className="font-sans text-[10px] font-bold uppercase tracking-widest text-poly-yellow mb-6 pb-3 border-b-2 border-poly-yellow">
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
            <p className="font-body text-muted-foreground text-lg mb-4">No FAQs found matching "{searchQuery}"</p>
            <button
              onClick={() => setSearchQuery('')}
              className="text-poly-yellow hover:text-poly-yellow-hover font-medium underline"
            >
              Clear search
            </button>
          </div>
        )}

        {/* Footer CTA */}
        <div className="mt-16 bg-poly-black p-8 text-center border border-border">
          <h3 className="font-sans font-black uppercase tracking-tight text-2xl text-white mb-4">
            Still have questions?
          </h3>
          <p className="font-body text-white/80 mb-6">
            We're here to help! Reach out to our support team.
          </p>
          <div className="flex justify-center">
            <a
              href="https://twitter.com/polycopyapp"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block bg-poly-yellow px-8 py-3.5 font-sans text-xs font-bold uppercase tracking-widest text-poly-black transition-all hover:bg-poly-black hover:text-poly-yellow border border-poly-yellow"
            >
              DM us on X
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
