'use client';

import dynamic from 'next/dynamic';

const CompanySwitcher = dynamic(() => import('@/components/CompanySwitcher'), { ssr: false });

export default function SidebarCompanySwitcher() {
  return <CompanySwitcher />;
}
