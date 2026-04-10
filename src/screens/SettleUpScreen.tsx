import React, {useState, useEffect} from 'react';
import {View, Text, TouchableOpacity, StyleSheet, FlatList, ScrollView, KeyboardAvoidingView, Platform} from 'react-native';
import {useNavigation, useRoute} from '@react-navigation/native';
import type {RouteProp} from '@react-navigation/native';
import {useTheme} from '../theme';
import {useAlert} from '../components/ThemedAlert';
import {AppInput, AppButton, BottomSheet, Chip} from '../components/ui';
import {fonts} from '../theme/fonts';
import {spacing} from '../theme/spacing';
import {getGroupMembers} from '../db/queries/groupQueries';
import {getLocalUser} from '../db/queries/userQueries';
import {createSettlement} from '../db/queries/settlementQueries';
import {toPaisa} from '../utils/currency';
import {CURRENCIES} from '../utils/currencies';
import {getDefaultCurrency} from '../db/queries/settingsQueries';
import {triggerAutoSmsSync} from '../sync/AutoSmsSync';
import {generateHlcTimestamp} from '../sync/syncLogger';
import type {GroupMember} from '../models/Group';
import type {GroupsStackParamList} from '../types/navigation';

type Route = RouteProp<GroupsStackParamList, 'SettleUp'>;

export default function SettleUpScreen() {
  const {colors} = useTheme();
  const navigation = useNavigation();
  const route = useRoute<Route>();
  const {showAlert} = useAlert();
  const {groupId} = route.params;

  const [members, setMembers] = useState<GroupMember[]>([]);
  const [paidBy, setPaidBy] = useState('');
  const [paidTo, setPaidTo] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState(getDefaultCurrency());
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);

  useEffect(() => {
    const m = getGroupMembers(groupId);
    setMembers(m);
    const localUser = getLocalUser();
    if (m.length >= 2) {
      const me = m.find(member => member.phone_number === localUser?.phone_number);
      const other = m.find(member => member.phone_number !== localUser?.phone_number);
      setPaidBy(me ? me.phone_number : m[0].phone_number);
      setPaidTo(other ? other.phone_number : m[1].phone_number);
    }
  }, [groupId]);

  useEffect(() => {
    if (paidTo === paidBy && members.length > 0) {
      const other = members.find(m => m.phone_number !== paidBy);
      if (other) setPaidTo(other.phone_number);
    }
  }, [paidBy, paidTo, members]);

  const handleSettle = () => {
    if (!paidBy || !paidTo) {
      showAlert({title: 'Error', message: 'Need at least 2 members to settle'});
      return;
    }
    const amountNum = parseFloat(amount);
    if (!amountNum || amountNum <= 0) {
      showAlert({title: 'Error', message: 'Please enter a valid amount'});
      return;
    }
    if (paidBy === paidTo) {
      showAlert({title: 'Error', message: 'Payer and payee must be different'});
      return;
    }

    const now = generateHlcTimestamp();
    createSettlement(groupId, paidBy, paidTo, toPaisa(amountNum), currency, new Date().toISOString(), now);

    // Trigger auto-SMS sync in background
    triggerAutoSmsSync(groupId);

    navigation.goBack();
  };

  const styles = makeStyles(colors);

  if (members.length < 2) {
    return (
      <View style={styles.container}>
        <Text style={{fontSize: fonts.sizes.base, color: colors.textMuted, textAlign: 'center', marginTop: spacing['2xl']}}>
          Need at least 2 members to settle up
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{flex: 1}} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <Text style={styles.label}>Who paid?</Text>
      <View style={styles.chipRow}>
        {members.map(m => (
          <Chip
            key={m.phone_number}
            label={m.display_name}
            selected={paidBy === m.phone_number}
            onPress={() => setPaidBy(m.phone_number)}
          />
        ))}
      </View>

      <Text style={styles.label}>Paid to?</Text>
      <View style={styles.chipRow}>
        {members.filter(m => m.phone_number !== paidBy).map(m => (
          <Chip
            key={m.phone_number}
            label={m.display_name}
            selected={paidTo === m.phone_number}
            onPress={() => setPaidTo(m.phone_number)}
          />
        ))}
      </View>

      <AppInput
        label="Amount"
        value={amount}
        onChangeText={setAmount}
        placeholder="0.00"
        keyboardType="decimal-pad"
      />

      <Text style={styles.label}>Currency</Text>
      <TouchableOpacity
        style={styles.currencyButton}
        onPress={() => setShowCurrencyPicker(true)}
        activeOpacity={0.7}>
        <Text style={styles.currencyButtonText}>
          {CURRENCIES.find(c => c.code === currency)?.symbol || currency}{' '}
          {currency}
        </Text>
      </TouchableOpacity>

      <BottomSheet
        visible={showCurrencyPicker}
        onClose={() => setShowCurrencyPicker(false)}
        title="Select Currency">
        <FlatList
          data={CURRENCIES}
          keyExtractor={item => item.code}
          renderItem={({item}) => (
            <TouchableOpacity
              style={[
                styles.currencyRow,
                {borderBottomColor: colors.border},
                item.code === currency && {backgroundColor: colors.surfaceElevated},
              ]}
              activeOpacity={0.7}
              onPress={() => {
                setCurrency(item.code);
                setShowCurrencyPicker(false);
              }}>
              <Text style={[styles.currencySymbol, {color: colors.text}]}>{item.symbol}</Text>
              <View style={styles.currencyInfo}>
                <Text style={[styles.currencyCode, {color: colors.text}]}>{item.code}</Text>
                <Text style={[styles.currencyName, {color: colors.textMuted}]}>{item.name}</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      </BottomSheet>

      <AppButton
        title="Record Settlement"
        onPress={handleSettle}
        icon="handshake-outline"
        style={styles.button}
      />
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.xl,
    },
    label: {
      fontSize: fonts.sizes.base,
      fontWeight: fonts.weights.medium,
      color: colors.textSecondary,
      marginBottom: spacing.xs,
      marginTop: spacing.base,
    },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    currencyButton: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      padding: spacing.base,
    },
    currencyButtonText: {
      fontSize: fonts.sizes.md,
      color: colors.text,
    },
    currencyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.sm,
      borderBottomWidth: 1,
      borderRadius: 6,
    },
    currencySymbol: {
      fontSize: fonts.sizes.lg,
      fontWeight: fonts.weights.bold,
      width: 40,
      textAlign: 'center',
    },
    currencyInfo: {
      marginLeft: spacing.md,
    },
    currencyCode: {
      fontSize: fonts.sizes.base,
      fontWeight: fonts.weights.semibold,
    },
    currencyName: {
      fontSize: fonts.sizes.sm,
    },
    button: {
      marginTop: spacing['2xl'],
      marginBottom: spacing.base,
    },
  });
