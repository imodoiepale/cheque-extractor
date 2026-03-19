'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Crown } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { isSuperAdmin } from '@/lib/super-admin';

export default function SuperAdminLink() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const check = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user && isSuperAdmin(user.email)) {
        setShow(true);
      }
    };
    check();
  }, []);

  if (!show) return null;

  return (
    <Link
      href="/admin"
      className="flex items-center gap-2.5 px-2.5 py-[7px] text-[13px] font-medium text-amber-600 hover:text-amber-700 hover:bg-amber-50/70 rounded-lg transition-colors"
    >
      <Crown className="w-[16px] h-[16px]" />
      <span>Super Admin</span>
    </Link>
  );
}
