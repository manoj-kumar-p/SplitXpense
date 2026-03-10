import type {Expense, ExpenseSplit, ExpensePayer} from '../models/Expense';
import type {Settlement} from '../models/Settlement';

export interface Debt {
  from: string; // phone_number of debtor
  to: string;   // phone_number of creditor
  amount: number; // paisa
}

/**
 * Build per-person net balances from expenses, splits, settlements.
 */
function buildNetBalances(
  expenses: Expense[],
  splits: ExpenseSplit[],
  settlements: Settlement[],
  payers?: ExpensePayer[],
): Record<string, number> {
  const netBalance: Record<string, number> = {};

  const ensure = (phone: string) => {
    if (!(phone in netBalance)) netBalance[phone] = 0;
  };

  for (const expense of expenses) {
    const expenseSplits = splits.filter(s => s.expense_id === expense.id);
    const expensePayers = payers?.filter(p => p.expense_id === expense.id);

    // Credit payers
    if (expensePayers && expensePayers.length > 0) {
      for (const payer of expensePayers) {
        ensure(payer.phone_number);
        netBalance[payer.phone_number] += payer.amount;
      }
    } else {
      const payerPhones = expense.paid_by.split(',');
      if (payerPhones.length === 1) {
        ensure(expense.paid_by);
        netBalance[expense.paid_by] += expense.amount;
      } else {
        const perPayer = Math.floor(expense.amount / payerPhones.length);
        for (const phone of payerPhones) {
          ensure(phone);
          netBalance[phone] += perPayer;
        }
      }
    }

    // Debit split members
    for (const split of expenseSplits) {
      ensure(split.phone_number);
      netBalance[split.phone_number] -= split.amount;
    }
  }

  // Process settlements
  for (const settlement of settlements) {
    ensure(settlement.paid_by);
    ensure(settlement.paid_to);
    netBalance[settlement.paid_by] += settlement.amount;
    netBalance[settlement.paid_to] -= settlement.amount;
  }

  return netBalance;
}

/**
 * Calculate debts for a group.
 * When simplify=true (default), uses greedy algorithm to minimize number of transactions.
 * When simplify=false, returns individual pairwise debts.
 */
export function calculateGroupBalances(
  expenses: Expense[],
  splits: ExpenseSplit[],
  settlements: Settlement[],
  payers?: ExpensePayer[],
  simplify: boolean = true,
): Debt[] {
  const netBalance = buildNetBalances(expenses, splits, settlements, payers);

  if (simplify) {
    return simplifyDebts(netBalance);
  }

  return unsimplifiedDebts(expenses, splits, settlements, payers);
}

/**
 * Return pairwise debts without simplification.
 * Shows who owes whom from each individual expense.
 */
function unsimplifiedDebts(
  expenses: Expense[],
  splits: ExpenseSplit[],
  settlements: Settlement[],
  payers?: ExpensePayer[],
): Debt[] {
  // Track pairwise balances: key = "from->to"
  const pairwise: Record<string, number> = {};

  const addPairwise = (from: string, to: string, amount: number) => {
    if (from === to || amount <= 0) return;
    const key = `${from}->${to}`;
    const reverseKey = `${to}->${from}`;
    if (pairwise[reverseKey]) {
      pairwise[reverseKey] -= amount;
      if (pairwise[reverseKey] < 0) {
        pairwise[key] = -pairwise[reverseKey];
        delete pairwise[reverseKey];
      } else if (pairwise[reverseKey] === 0) {
        delete pairwise[reverseKey];
      }
    } else {
      pairwise[key] = (pairwise[key] || 0) + amount;
    }
  };

  for (const expense of expenses) {
    const expSplits = splits.filter(s => s.expense_id === expense.id);
    const expPayers = payers?.filter(p => p.expense_id === expense.id);

    // Determine who paid and how much
    const payerAmounts: Array<{phone: string; amount: number}> = [];
    if (expPayers && expPayers.length > 0) {
      for (const p of expPayers) {
        payerAmounts.push({phone: p.phone_number, amount: p.amount});
      }
    } else {
      const payerPhones = expense.paid_by.split(',');
      if (payerPhones.length === 1) {
        payerAmounts.push({phone: expense.paid_by, amount: expense.amount});
      } else {
        const perPayer = Math.floor(expense.amount / payerPhones.length);
        for (const phone of payerPhones) {
          payerAmounts.push({phone, amount: perPayer});
        }
      }
    }

    // Each split member owes each payer proportionally
    for (const split of expSplits) {
      for (const payer of payerAmounts) {
        if (split.phone_number === payer.phone) continue;
        // Split member owes payer: split.amount * (payer.amount / total)
        const payerShare = Math.round(split.amount * payer.amount / expense.amount);
        addPairwise(split.phone_number, payer.phone, payerShare);
      }
    }
  }

  // Process settlements
  for (const settlement of settlements) {
    addPairwise(settlement.paid_to, settlement.paid_by, settlement.amount);
  }

  const debts: Debt[] = [];
  for (const [key, amount] of Object.entries(pairwise)) {
    if (amount > 0) {
      const [from, to] = key.split('->');
      debts.push({from, to, amount: Math.round(amount)});
    }
  }

  return debts.sort((a, b) => b.amount - a.amount);
}

function simplifyDebts(netBalance: Record<string, number>): Debt[] {
  const creditors: Array<{phone: string; amount: number}> = [];
  const debtors: Array<{phone: string; amount: number}> = [];

  for (const [phone, balance] of Object.entries(netBalance)) {
    if (balance > 0) {
      creditors.push({phone, amount: balance});
    } else if (balance < 0) {
      debtors.push({phone, amount: -balance});
    }
  }

  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  const debts: Debt[] = [];
  let i = 0;
  let j = 0;

  while (i < creditors.length && j < debtors.length) {
    const transferAmount = Math.min(creditors[i].amount, debtors[j].amount);

    if (transferAmount > 0) {
      debts.push({
        from: debtors[j].phone,
        to: creditors[i].phone,
        amount: Math.round(transferAmount),
      });
    }

    creditors[i].amount -= transferAmount;
    debtors[j].amount -= transferAmount;

    if (creditors[i].amount === 0) i++;
    if (debtors[j].amount === 0) j++;
  }

  return debts;
}

export function getNetBalance(phoneNumber: string, debts: Debt[]): number {
  let net = 0;
  for (const debt of debts) {
    if (debt.to === phoneNumber) net += debt.amount;
    if (debt.from === phoneNumber) net -= debt.amount;
  }
  return net;
}
