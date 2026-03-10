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
};

export type GroupsStackParamList = {
  GroupList: undefined;
  AddGroup: undefined;
  GroupDetail: {groupId: string};
  AddMember: {groupId: string};
  AddExpense: {groupId: string; editExpenseId?: string};
  SplitEditor: {
    groupId: string;
    members: Array<{phone_number: string; display_name: string}>;
    totalAmount: number;
    splitType: 'equal' | 'percentage' | 'exact';
    onSave: (splits: Array<{phone_number: string; amount: number; percentage: number | null}>) => void;
  };
  ExpenseDetail: {expenseId: string; groupId: string};
  SettleUp: {groupId: string};
  GroupBalances: {groupId: string};
};
