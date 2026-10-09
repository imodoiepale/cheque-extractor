import { supabase } from "@/components/admin-kit/shim/supabase";

// Ported: DepthMe's admin-* edge functions are served by /api/admin/fn/[name].
const FUNCTIONS_URL = '/api/admin/fn';

export async function callEdgeFn<T = unknown>(
  name: string,
  body?: unknown
): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  const res = await fetch(`${FUNCTIONS_URL}/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${name}: ${res.status} ${text}`);
  }

  return res.json() as Promise<T>;
}
