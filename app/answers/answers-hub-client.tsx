'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';

type HubCategory = {
  id: string;
  label: string;
  description: string;
};

type HubItem = {
  slug: string;
  query: string;
  teaser: string;
  category: string;
};

function normalizeSearchValue(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function AnswersHubClient({
  categories,
  items,
}: {
  categories: readonly HubCategory[];
  items: readonly HubItem[];
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');

  const normalizedSearchTerm = normalizeSearchValue(searchTerm);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const inCategory = activeCategory === 'all' || item.category === activeCategory;
      if (!inCategory) {
        return false;
      }

      if (!normalizedSearchTerm) {
        return true;
      }

      const normalizedQuery = normalizeSearchValue(item.query);
      const normalizedTeaser = normalizeSearchValue(item.teaser);

      return (
        normalizedQuery.includes(normalizedSearchTerm) ||
        normalizedTeaser.includes(normalizedSearchTerm)
      );
    });
  }, [activeCategory, items, normalizedSearchTerm]);

  const groupedItems = useMemo(() => {
    return categories.map((category) => ({
      category,
      items: filteredItems.filter((item) => item.category === category.id),
    }));
  }, [categories, filteredItems]);

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border-2 border-black bg-white p-4 shadow-[0_8px_0_0_#111111] sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <h2 className="text-2xl font-black text-black sm:text-3xl">לחפש לפי סיטואציה</h2>
            <p className="max-w-3xl text-sm font-bold leading-6 text-neutral-700">
              אפשר לחפש ביטוי חופשי, או לסנן לפי קטגוריה כדי להגיע מהר לתשובה שמתאימה למצב שלך.
            </p>
          </div>
          <Link
            href="/#compose-section"
            className="inline-flex min-h-[44px] items-center justify-center rounded-full border-2 border-black bg-[#f7ff4f] px-4 py-2 text-sm font-black text-black transition hover:-translate-y-0.5"
          >
            לפתוח את כלי התשובות
          </Link>
        </div>

        <div className="mt-4 grid gap-3">
          <label htmlFor="answers-search" className="text-sm font-black text-black">
            חיפוש מהיר
          </label>
          <input
            id="answers-search"
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder='למשל: "צריך לדבר", לקוח, אקס'
            className="min-h-[48px] w-full rounded-[18px] border-2 border-black bg-[#fffdf7] px-4 py-2 text-sm font-bold text-black outline-none transition focus:bg-white"
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveCategory('all')}
            className={[
              'min-h-[38px] rounded-full border-2 border-black px-3 py-1.5 text-xs font-black transition',
              activeCategory === 'all' ? 'bg-black text-[#f7ff4f]' : 'bg-white text-black',
            ].join(' ')}
          >
            הכל
          </button>

          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => setActiveCategory(category.id)}
              className={[
                'min-h-[38px] rounded-full border-2 border-black px-3 py-1.5 text-xs font-black transition',
                activeCategory === category.id ? 'bg-black text-[#f7ff4f]' : 'bg-white text-black',
              ].join(' ')}
            >
              {category.label}
            </button>
          ))}
        </div>

        <p className="mt-4 text-sm font-bold text-neutral-700">
          נמצאו {filteredItems.length} דפים מתאימים.
        </p>
      </section>

      <div className="space-y-5">
        {groupedItems.map(({ category, items: categoryItems }) => (
          <section
            key={category.id}
            className="rounded-[26px] border-2 border-black bg-[#fff9ef] p-4 shadow-[0_8px_0_0_#111111]"
          >
            <div className="space-y-1">
              <h3 className="text-xl font-black text-black">{category.label}</h3>
              <p className="text-sm font-bold text-neutral-700">{category.description}</p>
            </div>

            {categoryItems.length === 0 ? (
              <p className="mt-4 rounded-2xl border-2 border-dashed border-black bg-white px-4 py-3 text-sm font-bold text-neutral-700">
                אין כרגע תוצאות בקטגוריה הזאת לפי הסינון שבחרת.
              </p>
            ) : (
              <ul className="mt-4 grid gap-3 md:grid-cols-2">
                {categoryItems.map((item) => (
                  <li key={item.slug}>
                    <Link
                      href={`/answers/${item.slug}`}
                      className="block rounded-[20px] border-2 border-black bg-white px-4 py-3 shadow-[0_5px_0_0_#111111] transition hover:-translate-y-0.5"
                    >
                      <p className="text-base font-black text-black">{item.query}</p>
                      <p className="mt-2 text-sm font-bold leading-6 text-neutral-700">{item.teaser}</p>
                      <span className="mt-3 inline-block text-xs font-black text-[#9a2f10]">
                        לצפייה בתשובות + FAQ
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
