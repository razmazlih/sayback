'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { trackEvent } from '@/lib/analytics';

type AnswerDetailCtaLinkProps = {
  href: string;
  source: string;
  slug: string;
  className: string;
  children: ReactNode;
};

export function AnswerDetailCtaLink({
  href,
  source,
  slug,
  className,
  children,
}: AnswerDetailCtaLinkProps) {
  return (
    <Link
      href={href}
      className={className}
      onClick={() =>
        trackEvent('answer_detail_cta_click', {
          source,
          slug,
        })
      }
    >
      {children}
    </Link>
  );
}
