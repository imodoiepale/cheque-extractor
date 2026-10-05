'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { LogOut } from 'lucide-react';
import { useState } from 'react';

export default function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleLogout = async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push('/login');
      router.refresh();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleLogout}
      disabled={loading}
      className="w-full flex items-center gap-2.5 px-2.5 py-[7px] text-[13px] font-medium rounded-input press text-error hover:text-error/80 hover:bg-error/15 disabled:opacity-disabled"
    >
      <LogOut className="w-4 h-4" />
      <span>{loading ? 'Logging out...' : 'Logout'}</span>
    </button>
  );
}
