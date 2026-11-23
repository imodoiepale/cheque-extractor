/**
 * Self-check for QuickBooks account resolution.
 * Run: npx tsx lib/qb-refs.check.ts
 */
import assert from 'assert';
import { pickAccounts } from './qb-refs';

// A company with none of the old hardcoded names still resolves every ref.
const odd = pickAccounts([
  { Id: '7', Name: 'Operating Account', AccountType: 'Bank' },
  { Id: '9', Name: 'Supplies', AccountType: 'Expense' },
  { Id: '11', Name: 'Sales', AccountType: 'Income' },
  { Id: '4', Name: 'Payments to deposit', AccountType: 'Other Current Asset', AccountSubType: 'UndepositedFunds' },
]);
assert.deepStrictEqual(odd.bank, { value: '7', name: 'Operating Account' });
assert.deepStrictEqual(odd.expense, { value: '9', name: 'Supplies' });
assert.deepStrictEqual(odd.income, { value: '11', name: 'Sales' });
assert.deepStrictEqual(odd.undeposited, { value: '4', name: 'Payments to deposit' });

// Preferred names win; a named bank account wins over "Checking".
const std = [
  { Id: '1', Name: 'Savings', AccountType: 'Bank' },
  { Id: '2', Name: 'Checking', AccountType: 'Bank' },
  { Id: '3', Name: 'Rent', AccountType: 'Expense' },
  { Id: '5', Name: 'Uncategorized Expense', AccountType: 'Expense' },
];
assert.strictEqual(pickAccounts(std).bank?.value, '2');
assert.strictEqual(pickAccounts(std).expense?.value, '5');
assert.strictEqual(pickAccounts(std, 'Savings').bank?.value, '1');

// Missing types come back null, so callers can refuse with a clear message.
assert.strictEqual(pickAccounts([]).bank, null);

console.log('qb-refs: all checks passed');
