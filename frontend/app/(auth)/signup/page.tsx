'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Check, ArrowRight, Shield, Zap } from 'lucide-react';

const plans = [
  { id: 'starter', name: 'Starter', price: 29, desc: 'Solo accountants', features: ['250 checks/mo', 'Unlimited QB companies', 'AI confidence matching'] },
  { id: 'growth', name: 'Growth', price: 59, desc: 'Growing firms', popular: true, features: ['750 checks/mo', 'Bulk approve & export', 'Priority support'] },
  { id: 'pro', name: 'Pro', price: 99, desc: 'Large firms', features: ['2,000 checks/mo', 'Custom integrations', 'SLA guarantee'] },
];

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const planParam = searchParams?.get('plan') || 'growth';

  const [selectedPlan, setSelectedPlan] = useState(planParam);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const supabase = createClient();

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            company_name: companyName,
            plan: selectedPlan,
          },
        },
      });

      if (authError) throw authError;

      if (authData.user) {
        window.location.href = '/dashboard';
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 border border-blue-100 rounded-full text-xs font-semibold text-blue-700 mb-4">
          <Zap size={12} /> 14-day free trial &middot; No credit card required
        </div>
        <h1 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight">Start Your Free Trial</h1>
        <p className="text-gray-500 mt-2 text-sm">Join 500+ accounting firms saving 15+ hours per week</p>
      </div>

      {/* Plan selector */}
      <div className="grid grid-cols-3 gap-2 mb-6">
        {plans.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setSelectedPlan(p.id)}
            className={`relative p-3 rounded-xl border-2 text-left transition-all ${
              selectedPlan === p.id
                ? 'border-blue-600 bg-blue-50/50 shadow-sm'
                : 'border-gray-100 hover:border-gray-200 bg-white'
            }`}
          >
            {p.popular && (
              <span className="absolute -top-2 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[8px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full">
                Popular
              </span>
            )}
            <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{p.name}</div>
            <div className="text-lg font-black text-gray-900">${p.price}<span className="text-[10px] font-medium text-gray-400">/mo</span></div>
            <div className="text-[10px] text-gray-400 mt-0.5">{p.desc}</div>
            {selectedPlan === p.id && (
              <div className="absolute top-2 right-2 w-4 h-4 bg-blue-600 rounded-full flex items-center justify-center">
                <Check size={10} className="text-white" />
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Selected plan features */}
      <div className="bg-gray-50 rounded-xl p-3 mb-6">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {plans.find(p => p.id === selectedPlan)?.features.map((f) => (
            <span key={f} className="text-xs text-gray-500 flex items-center gap-1">
              <Check size={12} className="text-blue-600" /> {f}
            </span>
          ))}
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSignup} className="space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
            {error}
          </div>
        )}

        <div>
          <label htmlFor="companyName" className="block text-sm font-medium text-gray-700 mb-1.5">
            Company / Firm Name
          </label>
          <input
            id="companyName"
            type="text"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="e.g. Rodriguez & Associates"
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white"
            required
          />
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
            Work Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@yourfirm.com"
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white"
            required
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Min 6 characters"
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white"
            minLength={6}
            required
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white py-3 rounded-xl hover:shadow-lg hover:shadow-blue-600/25 hover:-translate-y-px disabled:opacity-50 disabled:cursor-not-allowed font-bold text-sm transition-all flex items-center justify-center gap-2"
        >
          {loading ? 'Creating account...' : (
            <>Start 14-Day Free Trial <ArrowRight size={16} /></>
          )}
        </button>
      </form>

      {/* Trust signals */}
      <div className="flex items-center justify-center gap-4 mt-5 text-[11px] text-gray-400">
        <span className="flex items-center gap-1"><Shield size={11} /> SOC 2 Compliant</span>
        <span>&middot;</span>
        <span>256-bit encryption</span>
        <span>&middot;</span>
        <span>Cancel anytime</span>
      </div>

      <p className="text-center text-gray-500 mt-6 text-sm">
        Already have an account?{' '}
        <Link href="/login" className="text-blue-600 hover:underline font-semibold">
          Sign in
        </Link>
      </p>
    </div>
  );
}

export default function SignupPage() {
  return (
    <div className="bg-white rounded-2xl shadow-xl shadow-gray-900/5 border border-gray-100 p-6 sm:p-8">
      <Suspense fallback={
        <div className="text-center py-12 text-gray-400 text-sm">Loading...</div>
      }>
        <SignupForm />
      </Suspense>
    </div>
  );
}