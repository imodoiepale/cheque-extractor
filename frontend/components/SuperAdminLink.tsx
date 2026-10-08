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
      className="flex items-center gap-2.5 px-2.5 py-[7px] text-[13px] font-medium rounded-input press text-warning hover:text-warning-foreground hover:bg-warning/20"
    >
      <Crown className="w-4 h-4" />
      <span>Super Admin</span>
    </Link>
  );
}
