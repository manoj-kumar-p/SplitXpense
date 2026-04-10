import {calculateGroupBalances} from '../src/utils/balance';
import type {Expense, ExpenseSplit, ExpensePayer} from '../src/models/Expense';
import type {Settlement} from '../src/models/Settlement';

const A = '+91A';
const B = '+91B';
const C = '+91C';

function expense(
  id: string,
  paidBy: string,
  amount: number,
  currency = 'INR',
): Expense {
  return {
    id,
    group_id: 'g1',
    description: 'test',
    amount,
    currency,
    paid_by: paidBy,
    split_type: 'equal',
    category: 'general',
    expense_date: '2024-01-01',
    hlc_timestamp: '1-0000-x',
    is_deleted: 0,
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
  };
}

function split(expenseId: string, phone: string, amount: number): ExpenseSplit {
  return {
    id: `${expenseId}-${phone}`,
    expense_id: expenseId,
    phone_number: phone,
    amount,
    percentage: null,
    hlc_timestamp: '1-0000-x',
    is_deleted: 0,
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
  };
}

function payer(expenseId: string, phone: string, amount: number): ExpensePayer {
  return {
    id: `${expenseId}-payer-${phone}`,
    expense_id: expenseId,
    phone_number: phone,
    amount,
    hlc_timestamp: '1-0000-x',
    is_deleted: 0,
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
  };
}

function settlement(paidBy: string, paidTo: string, amount: number, currency = 'INR'): Settlement {
  return {
    id: `s-${paidBy}-${paidTo}-${amount}`,
    group_id: 'g1',
    paid_by: paidBy,
    paid_to: paidTo,
    amount,
    currency,
    settled_at: '2024-01-02',
    hlc_timestamp: '1-0000-x',
    is_deleted: 0,
    created_at: '2024-01-02',
    updated_at: '2024-01-02',
  };
}

describe('calculateGroupBalances', () => {
  describe('simplified', () => {
    it('returns no debts when nothing is owed', () => {
      const debts = calculateGroupBalances([], [], []);
      expect(debts).toEqual([]);
    });

    it('handles a simple two-person split', () => {
      // A pays 100, A and B split equally → B owes A 50.
      const e = expense('e1', A, 100);
      const splits = [split('e1', A, 50), split('e1', B, 50)];
      const debts = calculateGroupBalances([e], splits, []);
      expect(debts).toEqual([{from: B, to: A, amount: 50}]);
    });

    it('zeroes out a fully settled debt', () => {
      const e = expense('e1', A, 100);
      const splits = [split('e1', A, 50), split('e1', B, 50)];
      const settlements = [settlement(B, A, 50)];
      const debts = calculateGroupBalances([e], splits, settlements);
      expect(debts).toEqual([]);
    });

    it('reduces debts to minimum number of transactions', () => {
      // A pays 300, equal split → B owes A 100, C owes A 100.
      // B pays 300, equal split → A owes B 100, C owes B 100.
      // Net: A=300-100-100=100, B=300-100-100=100, C=-100-100=-200.
      // Simplified: C → A 100, C → B 100.
      const e1 = expense('e1', A, 300);
      const e2 = expense('e2', B, 300);
      const splits = [
        split('e1', A, 100), split('e1', B, 100), split('e1', C, 100),
        split('e2', A, 100), split('e2', B, 100), split('e2', C, 100),
      ];
      const debts = calculateGroupBalances([e1, e2], splits, []);
      expect(debts).toHaveLength(2);
      expect(debts.every(d => d.from === C)).toBe(true);
      const totalOwed = debts.reduce((s, d) => s + d.amount, 0);
      expect(totalOwed).toBe(200);
    });

    it('uses explicit payers when provided', () => {
      // Bill of 200; A pays 150, B pays 50; equal split (100 each).
      // A is owed 150-100 = 50; B is owed 50-100 = -50 → B owes A 50.
      const e = expense('e1', `${A},${B}`, 200);
      const splits = [split('e1', A, 100), split('e1', B, 100)];
      const payers = [payer('e1', A, 150), payer('e1', B, 50)];
      const debts = calculateGroupBalances([e], splits, [], payers);
      expect(debts).toEqual([{from: B, to: A, amount: 50}]);
    });
  });

  describe('unsimplified', () => {
    it('returns pairwise debts without netting across expenses', () => {
      const e1 = expense('e1', A, 100);
      const splits = [split('e1', A, 50), split('e1', B, 50)];
      const debts = calculateGroupBalances([e1], splits, [], undefined, false);
      expect(debts).toEqual([{from: B, to: A, amount: 50}]);
    });

    it('cancels offsetting pairwise amounts', () => {
      // A pays 100, equal split → B owes A 50.
      // B pays 100, equal split → A owes B 50.
      // Pairwise net = zero.
      const e1 = expense('e1', A, 100);
      const e2 = expense('e2', B, 100);
      const splits = [
        split('e1', A, 50), split('e1', B, 50),
        split('e2', A, 50), split('e2', B, 50),
      ];
      const debts = calculateGroupBalances([e1, e2], splits, [], undefined, false);
      expect(debts).toEqual([]);
    });
  });

  describe('mixed currencies', () => {
    let warnSpy: jest.SpyInstance;
    beforeEach(() => {
      warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterEach(() => {
      warnSpy.mockRestore();
    });

    it('only includes the dominant currency', () => {
      // Two INR expenses + one USD expense → USD ignored.
      const inr1 = expense('e1', A, 100, 'INR');
      const inr2 = expense('e2', A, 100, 'INR');
      const usd = expense('e3', A, 100, 'USD');
      const splits = [
        split('e1', A, 50), split('e1', B, 50),
        split('e2', A, 50), split('e2', B, 50),
        split('e3', A, 50), split('e3', B, 50),
      ];
      const debts = calculateGroupBalances([inr1, inr2, usd], splits, []);
      // B owes A 100 (only INR counted, not 150).
      expect(debts).toEqual([{from: B, to: A, amount: 100}]);
      expect(warnSpy).toHaveBeenCalled();
    });
  });
});
