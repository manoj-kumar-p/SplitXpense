export interface Currency {
  code: string;
  symbol: string;
  name: string;
}

export const CURRENCIES: Currency[] = [
  {code: 'INR', symbol: '\u20B9', name: 'Indian Rupee'},
  {code: 'USD', symbol: '$', name: 'US Dollar'},
  {code: 'EUR', symbol: '\u20AC', name: 'Euro'},
  {code: 'GBP', symbol: '\u00A3', name: 'British Pound'},
  {code: 'JPY', symbol: '\u00A5', name: 'Japanese Yen'},
  {code: 'CNY', symbol: '\u00A5', name: 'Chinese Yuan'},
  {code: 'KRW', symbol: '\u20A9', name: 'South Korean Won'},
  {code: 'AUD', symbol: 'A$', name: 'Australian Dollar'},
  {code: 'CAD', symbol: 'C$', name: 'Canadian Dollar'},
  {code: 'SGD', symbol: 'S$', name: 'Singapore Dollar'},
  {code: 'AED', symbol: 'AED', name: 'UAE Dirham'},
  {code: 'SAR', symbol: 'SAR', name: 'Saudi Riyal'},
  {code: 'CHF', symbol: 'CHF', name: 'Swiss Franc'},
  {code: 'MYR', symbol: 'RM', name: 'Malaysian Ringgit'},
  {code: 'THB', symbol: '\u0E3F', name: 'Thai Baht'},
  {code: 'IDR', symbol: 'Rp', name: 'Indonesian Rupiah'},
  {code: 'PHP', symbol: '\u20B1', name: 'Philippine Peso'},
  {code: 'BRL', symbol: 'R$', name: 'Brazilian Real'},
  {code: 'ZAR', symbol: 'R', name: 'South African Rand'},
  {code: 'SEK', symbol: 'kr', name: 'Swedish Krona'},
  {code: 'NOK', symbol: 'kr', name: 'Norwegian Krone'},
  {code: 'DKK', symbol: 'kr', name: 'Danish Krone'},
  {code: 'NZD', symbol: 'NZ$', name: 'New Zealand Dollar'},
  {code: 'MXN', symbol: 'MX$', name: 'Mexican Peso'},
  {code: 'TWD', symbol: 'NT$', name: 'Taiwan Dollar'},
  {code: 'HKD', symbol: 'HK$', name: 'Hong Kong Dollar'},
  {code: 'TRY', symbol: '\u20BA', name: 'Turkish Lira'},
  {code: 'RUB', symbol: '\u20BD', name: 'Russian Ruble'},
  {code: 'PLN', symbol: 'z\u0142', name: 'Polish Zloty'},
  {code: 'NGN', symbol: '\u20A6', name: 'Nigerian Naira'},
  {code: 'EGP', symbol: 'E\u00A3', name: 'Egyptian Pound'},
  {code: 'KES', symbol: 'KSh', name: 'Kenyan Shilling'},
  {code: 'BDT', symbol: '\u09F3', name: 'Bangladeshi Taka'},
  {code: 'PKR', symbol: 'Rs', name: 'Pakistani Rupee'},
  {code: 'LKR', symbol: 'Rs', name: 'Sri Lankan Rupee'},
  {code: 'NPR', symbol: 'Rs', name: 'Nepalese Rupee'},
  {code: 'VND', symbol: '\u20AB', name: 'Vietnamese Dong'},
  {code: 'CLP', symbol: 'CLP$', name: 'Chilean Peso'},
  {code: 'COP', symbol: 'COL$', name: 'Colombian Peso'},
  {code: 'ARS', symbol: 'AR$', name: 'Argentine Peso'},
];

const symbolMap = new Map(CURRENCIES.map(c => [c.code, c.symbol]));

export function getCurrencySymbol(code: string): string {
  return symbolMap.get(code) || code;
}

export const DEFAULT_CURRENCY = 'INR';
