export interface ExpenseCategory {
  key: string;
  label: string;
  icon: string; // MaterialCommunityIcons name
}

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  {key: 'general', label: 'General', icon: 'tag-outline'},
  {key: 'food', label: 'Food & Dining', icon: 'food-fork-drink'},
  {key: 'groceries', label: 'Groceries', icon: 'cart-outline'},
  {key: 'transport', label: 'Transport', icon: 'car-outline'},
  {key: 'fuel', label: 'Fuel', icon: 'gas-station-outline'},
  {key: 'rent', label: 'Rent', icon: 'home-outline'},
  {key: 'utilities', label: 'Utilities', icon: 'flash-outline'},
  {key: 'entertainment', label: 'Entertainment', icon: 'movie-outline'},
  {key: 'shopping', label: 'Shopping', icon: 'shopping-outline'},
  {key: 'travel', label: 'Travel', icon: 'airplane'},
  {key: 'health', label: 'Health', icon: 'hospital-box-outline'},
  {key: 'education', label: 'Education', icon: 'school-outline'},
  {key: 'subscriptions', label: 'Subscriptions', icon: 'credit-card-outline'},
  {key: 'gifts', label: 'Gifts', icon: 'gift-outline'},
  {key: 'sports', label: 'Sports', icon: 'basketball'},
  {key: 'pets', label: 'Pets', icon: 'paw'},
  {key: 'repair', label: 'Repairs', icon: 'wrench-outline'},
  {key: 'insurance', label: 'Insurance', icon: 'shield-outline'},
  {key: 'taxes', label: 'Taxes', icon: 'file-document-outline'},
  {key: 'other', label: 'Other', icon: 'dots-horizontal'},
];

export function getCategoryByKey(key: string): ExpenseCategory {
  return EXPENSE_CATEGORIES.find(c => c.key === key) || EXPENSE_CATEGORIES[0];
}
