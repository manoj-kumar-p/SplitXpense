import React, {useState, useEffect} from 'react';
import {View, Text, TextInput, TouchableOpacity, Switch, StyleSheet, ScrollView, FlatList} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import type {ProfileStackParamList} from '../types/navigation';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import {useTheme, useThemeContext} from '../theme';
import {fonts} from '../theme/fonts';
import {spacing} from '../theme/spacing';
import {SectionHeader, AppCard, Divider, ListRow, BottomSheet} from '../components/ui';
import {getLocalUser, createLocalUser, updateLocalUserName, updateLocalUserPhone} from '../db/queries/userQueries';
import {
  isAutoSmsEnabled, setAutoSmsEnabled,
  getDefaultCurrency, setDefaultCurrency,
  setThemePreference, type ThemePreference,
  isSyncNotificationsEnabled, setSyncNotificationsEnabled,
  isWeeklyReminderEnabled, setWeeklyReminderEnabled,
} from '../db/queries/settingsQueries';
import {scheduleWeeklyReminder, cancelWeeklyReminder} from '../notifications/WeeklyReminderScheduler';
import {CURRENCIES} from '../utils/currencies';
import {getAllPeers} from '../db/queries/syncQueries';
import {isValidPhone, formatPhone} from '../utils/phone';
import {COUNTRY_CODES, type CountryCode} from '../utils/countryCodes';
import {useAlert} from '../components/ThemedAlert';
import type {LocalUser} from '../models/User';
import type {Peer} from '../models/SyncOperation';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

interface Props {
  onSetupComplete?: () => void;
  navigation?: NativeStackNavigationProp<ProfileStackParamList, 'Profile'>;
}

const THEME_OPTIONS: {value: ThemePreference; label: string; icon: string}[] = [
  {value: 'system', label: 'Auto', icon: 'cellphone'},
  {value: 'light', label: 'Light', icon: 'white-balance-sunny'},
  {value: 'dark', label: 'Dark', icon: 'moon-waning-crescent'},
];

export default function ProfileScreen({onSetupComplete, navigation}: Props) {
  const {colors} = useTheme();
  const themeCtx = useThemeContext();
  const insets = useSafeAreaInsets();
  const {showAlert} = useAlert();
  const [user, setUser] = useState<LocalUser | null>(null);
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [isFirstLaunch, setIsFirstLaunch] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [editingPhone, setEditingPhone] = useState(false);
  const [editPhone, setEditPhone] = useState('');
  const [autoSms, setAutoSms] = useState(false);
  const [currencySearch, setCurrencySearch] = useState('');
  const [defaultCurrency, setDefaultCurrencyState] = useState('INR');
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<CountryCode>(COUNTRY_CODES[0]);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [syncNotifs, setSyncNotifs] = useState(true);
  const [weeklyReminder, setWeeklyReminder] = useState(true);

  useEffect(() => {
    const existing = getLocalUser();
    if (existing) {
      setUser(existing);
      setPhone(existing.phone_number);
      setName(existing.display_name);
      setIsFirstLaunch(false);
    }
  }, []);

  useEffect(() => {
    setAutoSms(isAutoSmsEnabled());
    setDefaultCurrencyState(getDefaultCurrency());
    setPeers(getAllPeers());
    setSyncNotifs(isSyncNotificationsEnabled());
    setWeeklyReminder(isWeeklyReminderEnabled());
  }, []);

  const handleSave = () => {
    if (!name.trim()) {
      showAlert({title: 'Error', message: 'Please enter your name'});
      return;
    }
    if (isFirstLaunch) {
      const digits = phone.replace(/[^0-9]/g, '');
      if (!digits || digits.length < 4 || digits.length > 15) {
        showAlert({title: 'Error', message: 'Please enter a valid phone number'});
        return;
      }
      const normalized = selectedCountry.code + digits;
      if (!isValidPhone(normalized)) {
        showAlert({title: 'Error', message: 'Please enter a valid phone number'});
        return;
      }
      const created = createLocalUser(normalized, name.trim());
      setUser(created);
      setIsFirstLaunch(false);
      onSetupComplete?.();
    } else {
      updateLocalUserName(name.trim());
      setUser(prev => (prev ? {...prev, display_name: name.trim()} : null));
      setEditingName(false);
    }
  };

  const handleSavePhone = () => {
    const digits = editPhone.replace(/[^0-9]/g, '');
    if (!digits || digits.length < 4 || digits.length > 15) {
      showAlert({title: 'Error', message: 'Please enter a valid phone number'});
      return;
    }
    const normalized = selectedCountry.code + digits;
    if (!isValidPhone(normalized)) {
      showAlert({title: 'Error', message: 'Please enter a valid phone number'});
      return;
    }
    updateLocalUserPhone(normalized);
    setUser(prev => (prev ? {...prev, phone_number: normalized} : null));
    setPhone(normalized);
    setEditingPhone(false);
  };

  const startEditingPhone = () => {
    if (user) {
      // Extract digits from current phone (strip country code)
      const current = user.phone_number;
      const match = COUNTRY_CODES.find(c => current.startsWith(c.code));
      if (match) {
        setSelectedCountry(match);
        setEditPhone(current.slice(match.code.length));
      } else {
        setEditPhone(current.replace(/^\+/, ''));
      }
    }
    setEditingPhone(true);
  };

  const handleToggleAutoSms = (enabled: boolean) => {
    setAutoSms(enabled);
    setAutoSmsEnabled(enabled);
  };

  const handleToggleSyncNotifs = (enabled: boolean) => {
    setSyncNotifs(enabled);
    setSyncNotificationsEnabled(enabled);
  };

  const handleToggleWeeklyReminder = async (enabled: boolean) => {
    setWeeklyReminder(enabled);
    setWeeklyReminderEnabled(enabled);
    if (enabled) {
      await scheduleWeeklyReminder();
    } else {
      await cancelWeeklyReminder();
    }
  };

  const handleCurrencySelect = (code: string) => {
    setDefaultCurrencyState(code);
    setDefaultCurrency(code);
    setShowCurrencyPicker(false);
  };

  const styles = makeStyles(colors);
  const curCurrency = CURRENCIES.find(c => c.code === defaultCurrency);

  // --- Country Picker Modal ---
  const countryPickerModal = (
    <BottomSheet visible={showCountryPicker} onClose={() => { setShowCountryPicker(false); setCountrySearch(''); }} title="Select Country">
      <TextInput
        style={[styles.searchInput, {backgroundColor: colors.surfaceElevated, color: colors.text}]}
        placeholder="Search..."
        placeholderTextColor={colors.textMuted}
        value={countrySearch}
        onChangeText={setCountrySearch}
        autoFocus
      />
      <FlatList
        data={COUNTRY_CODES.filter(c =>
          countrySearch
            ? c.name.toLowerCase().includes(countrySearch.toLowerCase()) ||
              c.code.includes(countrySearch) ||
              c.iso.toLowerCase().includes(countrySearch.toLowerCase())
            : true,
        )}
        keyExtractor={item => item.iso}
        renderItem={({item}) => (
          <TouchableOpacity
            style={[
              styles.pickerRow,
              item.iso === selectedCountry.iso && {backgroundColor: colors.surfaceElevated},
            ]}
            onPress={() => {
              setSelectedCountry(item);
              setShowCountryPicker(false);
              setCountrySearch('');
            }}>
            <Text style={{fontSize: 20, marginRight: spacing.md}}>{item.flag}</Text>
            <Text style={[styles.pickerLabel, {color: colors.text}]}>{item.name}</Text>
            <Text style={[styles.pickerCode, {color: colors.textMuted}]}>{item.code}</Text>
          </TouchableOpacity>
        )}
      />
    </BottomSheet>
  );

  // --- Currency Picker Modal ---
  const filteredCurrencies = currencySearch
    ? CURRENCIES.filter(c =>
        c.name.toLowerCase().includes(currencySearch.toLowerCase()) ||
        c.code.toLowerCase().includes(currencySearch.toLowerCase()) ||
        c.symbol.includes(currencySearch),
      )
    : CURRENCIES;

  const currencyPickerModal = (
    <BottomSheet visible={showCurrencyPicker} onClose={() => { setShowCurrencyPicker(false); setCurrencySearch(''); }} title="Default Currency">
      <TextInput
        style={[styles.searchInput, {backgroundColor: colors.surfaceElevated, color: colors.text}]}
        placeholder="Search currency..."
        placeholderTextColor={colors.textMuted}
        value={currencySearch}
        onChangeText={setCurrencySearch}
        autoFocus
      />
      <FlatList
        data={filteredCurrencies}
        keyExtractor={item => item.code}
        renderItem={({item}) => (
          <TouchableOpacity
            style={[
              styles.pickerRow,
              item.code === defaultCurrency && {backgroundColor: colors.surfaceElevated},
            ]}
            onPress={() => { handleCurrencySelect(item.code); setCurrencySearch(''); }}>
            <Text style={{fontSize: 16, fontWeight: '700', width: 36, color: colors.text}}>{item.symbol}</Text>
            <Text style={[styles.pickerLabel, {color: colors.text}]}>{item.name}</Text>
            <Text style={[styles.pickerCode, {color: colors.textMuted}]}>{item.code}</Text>
          </TouchableOpacity>
        )}
      />
    </BottomSheet>
  );

  // =================== SETUP SCREEN ===================
  if (isFirstLaunch) {
    return (
      <View style={[styles.setupContainer, {paddingTop: insets.top}]}>
        <View style={styles.setupHeader}>
          <View style={[styles.setupIconWrap, {backgroundColor: colors.surfaceElevated}]}>
            <Icon name="account-plus-outline" size={40} color={colors.text} />
          </View>
          <Text style={[styles.setupTitle, {color: colors.text}]}>Welcome to SplitXpense</Text>
          <Text style={[styles.setupSubtitle, {color: colors.textMuted}]}>
            Split expenses with friends.{'\n'}No internet required.
          </Text>
        </View>

        <View style={styles.setupForm}>
          <Text style={[styles.setupLabel, {color: colors.textSecondary}]}>Phone Number</Text>
          <View style={styles.phoneRow}>
            <TouchableOpacity
              style={[styles.countryBtn, {backgroundColor: colors.surface, borderColor: colors.border}]}
              onPress={() => setShowCountryPicker(true)}>
              <Text style={{fontSize: 18}}>{selectedCountry.flag}</Text>
              <Text style={[styles.countryCode, {color: colors.text}]}>{selectedCountry.code}</Text>
              <Icon name="chevron-down" size={14} color={colors.textMuted} />
            </TouchableOpacity>
            <TextInput
              style={[styles.setupInput, styles.phoneInput, {backgroundColor: colors.surface, borderColor: colors.border, color: colors.text}]}
              value={phone}
              onChangeText={setPhone}
              placeholder="98765 43210"
              placeholderTextColor={colors.placeholder}
              keyboardType="phone-pad"
            />
          </View>

          <Text style={[styles.setupLabel, {color: colors.textSecondary, marginTop: spacing.lg}]}>Your Name</Text>
          <TextInput
            style={[styles.setupInput, {backgroundColor: colors.surface, borderColor: colors.border, color: colors.text}]}
            value={name}
            onChangeText={setName}
            placeholder="Enter your name"
            placeholderTextColor={colors.placeholder}
            autoFocus
          />

          <TouchableOpacity
            style={[styles.setupBtn, {backgroundColor: colors.text}]}
            onPress={handleSave}
            activeOpacity={0.8}>
            <Text style={[styles.setupBtnText, {color: colors.background}]}>Get Started</Text>
            <Icon name="arrow-right" size={20} color={colors.background} />
          </TouchableOpacity>
        </View>

        {countryPickerModal}
      </View>
    );
  }

  // =================== PROFILE SCREEN ===================
  return (
    <>
    <ScrollView style={[styles.container, {backgroundColor: colors.background, paddingTop: insets.top + spacing.base}]} showsVerticalScrollIndicator={false}>
      {/* Header Card */}
      <View style={[styles.profileCard, {backgroundColor: colors.surface, borderColor: colors.border}]}>
        <View style={[styles.avatar, {backgroundColor: colors.text}]}>
          <Text style={[styles.avatarText, {color: colors.background}]}>
            {user?.display_name?.charAt(0).toUpperCase()}
          </Text>
        </View>
        {editingName ? (
          <View style={styles.editNameRow}>
            <TextInput
              style={[styles.editNameInput, {color: colors.text, borderColor: colors.border}]}
              value={name}
              onChangeText={setName}
              autoFocus
              onSubmitEditing={handleSave}
            />
            <TouchableOpacity onPress={handleSave}>
              <Icon name="check" size={22} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setName(user?.display_name || ''); setEditingName(false); }}>
              <Icon name="close" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.nameRow} onPress={() => setEditingName(true)}>
            <Text style={[styles.userName, {color: colors.text}]}>{user?.display_name}</Text>
            <Icon name="pencil-outline" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        )}
        {editingPhone ? (
          <View style={styles.editPhoneRow}>
            <TouchableOpacity
              style={[styles.editCountryBtn, {backgroundColor: colors.surfaceElevated}]}
              onPress={() => setShowCountryPicker(true)}>
              <Text style={{fontSize: 14}}>{selectedCountry.flag}</Text>
              <Text style={{color: colors.text, fontSize: fonts.sizes.sm, fontWeight: '500'}}>{selectedCountry.code}</Text>
            </TouchableOpacity>
            <TextInput
              style={[styles.editPhoneInput, {color: colors.text, borderColor: colors.border}]}
              value={editPhone}
              onChangeText={setEditPhone}
              keyboardType="phone-pad"
              autoFocus
              onSubmitEditing={handleSavePhone}
            />
            <TouchableOpacity onPress={handleSavePhone}>
              <Icon name="check" size={22} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setEditingPhone(false)}>
              <Icon name="close" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.phoneDisplayRow} onPress={startEditingPhone}>
            <Text style={[styles.userPhone, {color: colors.textMuted}]}>
              {user ? formatPhone(user.phone_number) : ''}
            </Text>
            <Icon name="pencil-outline" size={14} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Preferences Section */}
      <SectionHeader title="PREFERENCES" />
      <AppCard noPadding>
        <ListRow
          icon="currency-usd"
          label="Currency"
          value={curCurrency ? `${curCurrency.symbol} ${curCurrency.code}` : defaultCurrency}
          onPress={() => setShowCurrencyPicker(true)}
        />
        <Divider inset={spacing.base + 32 + spacing.md} />
        <ListRow
          icon="message-text-outline"
          label="Auto SMS Sync"
          rightElement={
            <Switch
              value={autoSms}
              onValueChange={handleToggleAutoSms}
              trackColor={{false: colors.border, true: colors.accent}}
              thumbColor={autoSms ? colors.text : colors.subtle}
            />
          }
        />
      </AppCard>

      {/* Notifications Section */}
      <SectionHeader title="NOTIFICATIONS" />
      <AppCard noPadding>
        <ListRow
          icon="bell-ring-outline"
          label="Sync Alerts"
          rightElement={
            <Switch
              value={syncNotifs}
              onValueChange={handleToggleSyncNotifs}
              trackColor={{false: colors.border, true: colors.accent}}
              thumbColor={syncNotifs ? colors.text : colors.subtle}
            />
          }
        />
        <Divider inset={spacing.base + 32 + spacing.md} />
        <ListRow
          icon="calendar-clock"
          label="Weekly Reminder"
          rightElement={
            <Switch
              value={weeklyReminder}
              onValueChange={handleToggleWeeklyReminder}
              trackColor={{false: colors.border, true: colors.accent}}
              thumbColor={weeklyReminder ? colors.text : colors.subtle}
            />
          }
        />
      </AppCard>

      {/* Appearance Section */}
      <SectionHeader title="APPEARANCE" />
      <AppCard noPadding>
        <View style={styles.themeRow}>
          {THEME_OPTIONS.map(opt => {
            const active = themeCtx.preference === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.themeOption,
                  {backgroundColor: active ? colors.text : colors.surfaceElevated},
                ]}
                activeOpacity={0.7}
                onPress={() => {
                  themeCtx.setPreference(opt.value);
                  setThemePreference(opt.value);
                }}>
                <Icon
                  name={opt.icon}
                  size={18}
                  color={active ? colors.background : colors.textMuted}
                />
                <Text style={[
                  styles.themeLabel,
                  {color: active ? colors.background : colors.textMuted},
                ]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </AppCard>

      {/* Sync Status Section */}
      {peers.length > 0 && (
        <>
          <SectionHeader title="SYNC STATUS" />
          <AppCard noPadding>
            {peers.map((peer, i) => (
              <React.Fragment key={peer.phone_number}>
                {i > 0 && <Divider inset={spacing.base + 32 + spacing.md} />}
                <View style={styles.peerRow}>
                  <View style={[styles.peerAvatar, {backgroundColor: colors.surfaceElevated}]}>
                    <Text style={{color: colors.text, fontWeight: '600'}}>
                      {(peer.display_name || peer.phone_number).charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{flex: 1}}>
                    <Text style={{color: colors.text, fontSize: fonts.sizes.base, fontWeight: '500'}}>
                      {peer.display_name || peer.phone_number}
                    </Text>
                    <Text style={{color: colors.textMuted, fontSize: fonts.sizes.xs, marginTop: 2}}>
                      {peer.last_wifi_sync ? `WiFi ${dayjs(peer.last_wifi_sync).fromNow()}` : 'WiFi: never'}
                      {' · '}
                      {peer.last_sms_sync ? `SMS ${dayjs(peer.last_sms_sync).fromNow()}` : 'SMS: never'}
                    </Text>
                  </View>
                  {peer.wifi_ip && (
                    <View style={[styles.onlineBadge, {backgroundColor: colors.positive + '20'}]}>
                      <View style={[styles.onlineDot, {backgroundColor: colors.positive}]} />
                    </View>
                  )}
                </View>
              </React.Fragment>
            ))}
          </AppCard>
        </>
      )}

      {/* Data & Tools Section */}
      {navigation && (
        <>
          <SectionHeader title="DATA & TOOLS" />
          <AppCard noPadding>
            <ListRow icon="sync" label="Sync & Devices" onPress={() => navigation.navigate('Sync')} />
            <Divider inset={spacing.base + 32 + spacing.md} />
            <ListRow icon="chart-bar" label="Statistics" onPress={() => navigation.navigate('Stats')} />
          </AppCard>
        </>
      )}

      {/* About Section */}
      <SectionHeader title="ABOUT" />
      <AppCard noPadding>
        {navigation && (
          <>
            <ListRow icon="information-outline" label="How SplitXpense Works" onPress={() => navigation.navigate('About')} />
            <Divider inset={spacing.base + 32 + spacing.md} />
            <ListRow icon="shield-check-outline" label="Privacy & Terms" onPress={() => navigation.navigate('Policy')} />
            <Divider inset={spacing.base + 32 + spacing.md} />
          </>
        )}
        <ListRow icon="tag-outline" label="Version" value="1.0.0" />
      </AppCard>

      <View style={{height: spacing.xl}} />
    </ScrollView>
    {currencyPickerModal}
    {countryPickerModal}
  </>
  );
}

const makeStyles = (colors: any) =>
  StyleSheet.create({
    // ---- Setup Screen ----
    setupContainer: {
      flex: 1,
      backgroundColor: colors.background,
      padding: spacing.xl,
      justifyContent: 'center',
    },
    setupHeader: {
      alignItems: 'center',
      marginBottom: spacing['2xl'],
    },
    setupIconWrap: {
      width: 80,
      height: 80,
      borderRadius: 40,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.lg,
    },
    setupTitle: {
      fontSize: fonts.sizes['2xl'],
      fontWeight: fonts.weights.bold,
    },
    setupSubtitle: {
      fontSize: fonts.sizes.base,
      textAlign: 'center',
      marginTop: spacing.sm,
      lineHeight: 22,
    },
    setupForm: {},
    setupLabel: {
      fontSize: fonts.sizes.sm,
      fontWeight: fonts.weights.medium,
      marginBottom: 6,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    setupInput: {
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: spacing.base,
      paddingVertical: 14,
      fontSize: fonts.sizes.md,
    },
    phoneRow: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    countryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: spacing.md,
      gap: 6,
    },
    countryCode: {
      fontSize: fonts.sizes.md,
      fontWeight: fonts.weights.medium,
    },
    phoneInput: {
      flex: 1,
    },
    setupBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 12,
      paddingVertical: 16,
      marginTop: spacing['2xl'],
      gap: spacing.sm,
    },
    setupBtnText: {
      fontSize: fonts.sizes.md,
      fontWeight: fonts.weights.semibold,
    },

    // ---- Profile Screen ----
    container: {
      flex: 1,
      paddingHorizontal: spacing.base,
    },
    profileCard: {
      alignItems: 'center',
      borderRadius: 16,
      borderWidth: 1,
      padding: spacing.xl,
      marginBottom: spacing.lg,
    },
    avatar: {
      width: 64,
      height: 64,
      borderRadius: 32,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.md,
    },
    avatarText: {
      fontSize: fonts.sizes['2xl'],
      fontWeight: fonts.weights.bold,
    },
    nameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    userName: {
      fontSize: fonts.sizes.lg,
      fontWeight: fonts.weights.semibold,
    },
    editNameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    editNameInput: {
      fontSize: fonts.sizes.lg,
      fontWeight: fonts.weights.semibold,
      borderBottomWidth: 1,
      paddingVertical: 2,
      minWidth: 120,
      textAlign: 'center',
    },
    userPhone: {
      fontSize: fonts.sizes.sm,
      marginTop: 4,
    },
    phoneDisplayRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: 4,
    },
    editPhoneRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: spacing.sm,
    },
    editCountryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 6,
      gap: 4,
    },
    editPhoneInput: {
      fontSize: fonts.sizes.sm,
      borderBottomWidth: 1,
      paddingVertical: 2,
      minWidth: 100,
      textAlign: 'center',
    },

    // Theme
    themeRow: {
      flexDirection: 'row',
      padding: spacing.md,
      gap: spacing.sm,
    },
    themeOption: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 10,
      borderRadius: 10,
      gap: 6,
    },
    themeLabel: {
      fontSize: fonts.sizes.sm,
      fontWeight: '600',
    },

    // Peers
    peerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: spacing.base,
      gap: spacing.md,
    },
    peerAvatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    onlineBadge: {
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    onlineDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },

    // Picker content (inside BottomSheet)
    searchInput: {
      borderRadius: 10,
      paddingHorizontal: spacing.base,
      paddingVertical: 10,
      fontSize: fonts.sizes.base,
      marginBottom: spacing.md,
    },
    pickerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: spacing.sm,
      borderRadius: 8,
    },
    pickerLabel: {
      flex: 1,
      fontSize: fonts.sizes.base,
    },
    pickerCode: {
      fontSize: fonts.sizes.sm,
    },
  });
