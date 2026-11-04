'use client';

import { Analytics } from '@vercel/analytics/next';
import { usePathname } from 'next/navigation';
import { AnalyticsScripts } from '@/app/analytics-scripts';
import { isPrivateAnalyticsPath, sanitizeAnalyticsUrl } from '@/lib/analytics-privacy';

export function SiteAnalytics() {
  const pathname = usePathname();
  if (!pathname || isPrivateAnalyticsPath(pathname)) return null;
  return <>
    <AnalyticsScripts />
    <Analytics beforeSend={(event) => {
      const url = sanitizeAnalyticsUrl(event.url);
      return url ? { ...event, url } : null;
    }} />
  </>;
}
