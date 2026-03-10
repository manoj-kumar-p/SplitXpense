import {getLocalUser} from '../db/queries/userQueries';
import {getAllGroups} from '../db/queries/groupQueries';
import {getGroupExpenses, getExpenseSplits, getExpensePayers} from '../db/queries/expenseQueries';
import {getGroupSettlements} from '../db/queries/settlementQueries';
import {calculateGroupBalances} from '../utils/balance';
import {formatCurrency} from '../utils/currency';
import {getDefaultCurrency} from '../db/queries/settingsQueries';

export interface DebtSummary {
  totalOwed: number;
  totalOwedToUser: number;
  groupsInDebt: number;
}

export function computeDebtSummary(): DebtSummary {
  const user = getLocalUser();
  if (!user) return {totalOwed: 0, totalOwedToUser: 0, groupsInDebt: 0};

  const myPhone = user.phone_number;
  const groups = getAllGroups();
  let totalOwed = 0;
  let totalOwedToUser = 0;
  let groupsInDebt = 0;

  for (const group of groups) {
    const expenses = getGroupExpenses(group.id);
    const splits = expenses.flatMap(e => getExpenseSplits(e.id));
    const settlements = getGroupSettlements(group.id);
    const allPayers = expenses.flatMap(e => getExpensePayers(e.id));
    const debts = calculateGroupBalances(expenses, splits, settlements, allPayers);

    let groupDebt = 0;
    for (const debt of debts) {
      if (debt.from === myPhone) {
        groupDebt += debt.amount;
        totalOwed += debt.amount;
      } else if (debt.to === myPhone) {
        totalOwedToUser += debt.amount;
      }
    }
    if (groupDebt > 0) groupsInDebt++;
  }

  return {totalOwed, totalOwedToUser, groupsInDebt};
}

export function formatDebtNotificationBody(): string | null {
  const summary = computeDebtSummary();
  if (summary.totalOwed <= 0) return null;

  const currency = getDefaultCurrency();
  const formatted = formatCurrency(summary.totalOwed, currency);
  const groupWord = summary.groupsInDebt === 1 ? 'group' : 'groups';

  return `You owe ${formatted} across ${summary.groupsInDebt} ${groupWord}`;
}
