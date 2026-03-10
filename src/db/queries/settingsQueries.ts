import {getDatabase} from '../database';

export function getSetting(key: string): string | null {
  const db = getDatabase();
  const result = db.executeSync('SELECT value FROM app_settings WHERE key = ?;', [key]);
  if (result.rows && result.rows.length > 0) {
    return (result.rows[0] as any).value;
  }
  return null;
}

export function setSetting(key: string, value: string): void {
  const db = getDatabase();
  db.executeSync(
    'INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?);',
    [key, value],
  );
}

export function isAutoSmsEnabled(): boolean {
  const val = getSetting('auto_sms_sync');
  // Default to enabled if never set
  if (val === null) return true;
  return val === 'true';
}

export function setAutoSmsEnabled(enabled: boolean): void {
  setSetting('auto_sms_sync', enabled ? 'true' : 'false');
}

export type ThemePreference = 'system' | 'light' | 'dark';

export function getThemePreference(): ThemePreference {
  const val = getSetting('theme_preference');
  if (val === 'light' || val === 'dark') return val;
  return 'system';
}

export function setThemePreference(pref: ThemePreference): void {
  setSetting('theme_preference', pref);
}

export function getDefaultCurrency(): string {
  return getSetting('default_currency') || 'INR';
}

export function setDefaultCurrency(code: string): void {
  setSetting('default_currency', code);
}

// --- Notification Settings ---

export function isSyncNotificationsEnabled(): boolean {
  const val = getSetting('notifications_sync_enabled');
  if (val === null) return true;
  return val === 'true';
}

export function setSyncNotificationsEnabled(enabled: boolean): void {
  setSetting('notifications_sync_enabled', enabled ? 'true' : 'false');
}

export function isWeeklyReminderEnabled(): boolean {
  const val = getSetting('notifications_weekly_reminder_enabled');
  if (val === null) return true;
  return val === 'true';
}

export function setWeeklyReminderEnabled(enabled: boolean): void {
  setSetting('notifications_weekly_reminder_enabled', enabled ? 'true' : 'false');
}
