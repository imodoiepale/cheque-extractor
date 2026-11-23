import { qbFetch } from '@/lib/qb-http';

/**
 * QuickBooks references must carry the entity's Id; name-only refs fail, and
 * the hardcoded "Checking" / "Uncategorized Expense" / "Undeposited Funds"
 * do not exist in every company. Resolve real accounts by type instead.
 */
export interface QbRefs {
  bank: { value: string; name: string } | null;
  expense: { value: string; name: string } | null;
  income: { value: string; name: string } | null;
  undeposited: { value: string; name: string } | null;
}

type Account = { Id: string; Name: string; AccountType: string; AccountSubType?: string };

const ref = (a?: Account) => (a ? { value: String(a.Id), name: a.Name } : null);

/** Prefer an account named like `preferred`, else the first of the type. */
export function pickAccounts(accounts: Account[], bankName?: string | null): QbRefs {
  const of = (type: string) => accounts.filter((a) => a.AccountType === type);
  const named = (list: Account[], re: RegExp) => list.find((a) => re.test(a.Name)) || list[0];
  const banks = of('Bank');
  const bank = (bankName && banks.find((a) => a.Name === bankName)) || named(banks, /^checking$/i);
  return {
    bank: ref(bank),
    expense: ref(named(of('Expense'), /uncategori[sz]ed expense/i)),
    income: ref(named(of('Income'), /uncategori[sz]ed income/i)),
    undeposited: ref(
      accounts.find((a) => a.AccountSubType === 'UndepositedFunds') ||
        accounts.find((a) => /undeposited funds|payments to deposit/i.test(a.Name))
    ),
  };
}

export async function resolveQbRefs(
  base: string,
  realmId: string,
  accessToken: string,
  bankName?: string | null
): Promise<QbRefs> {
  const q = encodeURIComponent(
    "SELECT Id, Name, AccountType, AccountSubType FROM Account WHERE Active = true MAXRESULTS 1000"
  );
  const res = await qbFetch(`${base}/v3/company/${realmId}/query?query=${q}&minorversion=73`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Could not read QuickBooks accounts (${res.status})`);
  const data = await res.json();
  return pickAccounts(data?.QueryResponse?.Account || [], bankName);
}

/** Vendor/Customer Id by exact display name, or null (the ref is then omitted). */
export async function findEntityRef(
  base: string,
  realmId: string,
  accessToken: string,
  entity: 'Vendor' | 'Customer',
  name?: string | null
): Promise<{ value: string; name: string } | null> {
  if (!name) return null;
  const q = encodeURIComponent(`SELECT Id, DisplayName FROM ${entity} WHERE DisplayName = '${name.replace(/'/g, "\\'")}'`);
  const res = await qbFetch(`${base}/v3/company/${realmId}/query?query=${q}&minorversion=73`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  if (!res.ok) return null;
  const hit = (await res.json())?.QueryResponse?.[entity]?.[0];
  return hit ? { value: String(hit.Id), name: hit.DisplayName } : null;
}
