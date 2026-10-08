'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { User, ChevronDown } from 'lucide-react';
import LogoutButton from './LogoutButton';

interface UserData {
  email: string;
  user_metadata?: {
    company_name?: string;
    full_name?: string;
  };
}

export default function UserProfile() {
  const [user, setUser] = useState<UserData | null>(null);
  const [showMenu, setShowMenu] = useState(false);

  useEffect(() => {
    const getUser = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUser(user as UserData);
      }
    };
    getUser();
  }, []);

  if (!user) return null;

  const displayName = user.user_metadata?.company_name || user.user_metadata?.full_name || user.email?.split('@')[0] || 'User';
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-input press hover:bg-shell-text/[0.08]"
      >
        {/* Avatar */}
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-light to-brand-dark flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
          {initials}
        </div>
        
        {/* User Info */}
        <div className="flex-1 text-left min-w-0">
          <p className="text-sm font-medium text-shell-text truncate">
            {displayName}
          </p>
          <p className="text-xs text-shell-muted truncate">
            {user.email}
          </p>
        </div>

        {/* Dropdown Icon */}
        <ChevronDown className={`w-4 h-4 text-shell-muted transition-transform duration-quick ease-settle flex-shrink-0 ${showMenu ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Menu */}
      {showMenu && (
        <div className="absolute bottom-full left-0 right-0 mb-2 z-50 py-2 rounded-tile bg-shell-solid border border-glass-border-dark shadow-glass-modal animate-popover-in">
          <div className="px-3 py-2 border-b border-glass-border-dark">
            <p className="text-xs font-medium text-shell-text truncate">{displayName}</p>
            <p className="text-xs text-shell-muted truncate">{user.email}</p>
          </div>
          
          <div className="px-2 py-1">
            <LogoutButton />
          </div>
        </div>
      )}
    </div>
  );
}
