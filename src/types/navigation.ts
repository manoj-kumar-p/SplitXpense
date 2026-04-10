export type RootTabParamList = {
  Groups: undefined;
  Friends: undefined;
  Activity: undefined;
  ProfileTab: undefined;
};

export type ProfileStackParamList = {
  Profile: undefined;
  Sync: undefined;
  Stats: undefined;
  Policy: undefined;
  About: undefined;
  AccountMappings: undefined;
  Backup: undefined;
};

export type GroupsStackParamList = {
  GroupList: undefined;
  AddGroup: undefined;
  GroupDetail: {groupId: string};
  AddMember: {groupId: string};
  AddExpense: {groupId: string; editExpenseId?: string};
  ExpenseDetail: {expenseId: string; groupId: string};
  SettleUp: {groupId: string};
  GroupBalances: {groupId: string};
  QuickAddExpense: {transactionId: string};
};
