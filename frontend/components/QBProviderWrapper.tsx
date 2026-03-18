'use client';

import { QBProvider } from '@/hooks/useQBConnections';
import { ReactNode } from 'react';

export default function QBProviderWrapper({ children }: { children: ReactNode }) {
  return <QBProvider>{children}</QBProvider>;
}
