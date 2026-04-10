import React, {useState, useEffect} from 'react';
import {View, Text, TouchableOpacity, StyleSheet, ScrollView, FlatList} from 'react-native';
import {useNavigation, useRoute} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import type {RouteProp} from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import dayjs from 'dayjs';
import {useTheme} from '../theme';
import {fonts} from '../theme/fonts';
import {spacing} from '../theme/spacing';
import {AppCard, AppButton, AppInput, Chip, BottomSheet} from '../components/ui';
import {getPendingTransaction, markTransactionAdded, dismissTransaction} from '../db/queries/pendingTransactionQueries';
import {getAllGroups, getGroupMembers} from '../db/queries/groupQueries';
import {getLocalUser} from '../db/queries/userQueries';
import {createExpense, createExpenseSplit, createExpensePayer} from '../db/queries/expenseQueries';
import {formatCurrency} from '../utils/currency';
import {EXPENSE_CATEGORIES, getCategoryByKey} from '../utils/expenseCategories';
import {triggerAutoSmsSync} from '../sync/AutoSmsSync';
import {generateHlcTimestamp} from '../sync/syncLogger';
import type {PendingTransaction} from '../models/PendingTransaction';
import type {Group} from '../models/Group';
import type {GroupsStackParamList} from '../types/navigation';

type Nav = NativeStackNavigationProp<GroupsStackParamList, 'QuickAddExpense'>;
type Route = RouteProp<GroupsStackParamList, 'QuickAddExpense'>;

export default function QuickAddExpenseScreen() {
  const {colors} = useTheme();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const {transactionId} = route.params;

  const [txn, setTxn] = useState<PendingTransaction | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('general');
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  useEffect(() => {
    const pending = getPendingTransaction(transactionId);
    setTxn(pending);

    const allGroups = getAllGroups();
    setGroups(allGroups);

    if (pending) {
      setDescription(pending.note || pending.merchant || '');
      if (pending.mapped_group_id) {
        setSelectedGroupId(pending.mapped_group_id);
      } else if (allGroups.length > 0) {
        setSelectedGroupId(allGroups[0].id);
      }
    }
  }, [transactionId]);

  const handleAddExpense = () => {
    if (!txn || !selectedGroupId) return;

    const localUser = getLocalUser();
    if (!localUser) return;

    const members = getGroupMembers(selectedGroupId);
    if (members.length === 0) return;

    const hlcTimestamp = generateHlcTimestamp();
    const dateStr = dayjs(txn.detected_at).format('YYYY-MM-DD');

    const expense = createExpense(
      selectedGroupId,
      description.trim() || 'Expense',
      txn.amount,
      txn.currency,
      localUser.phone_number,
      'equal',
      dateStr,
      hlcTimestamp,
      category,
    );

    createExpensePayer(expense.id, localUser.phone_number, txn.amount, hlcTimestamp);

    const perPerson = Math.floor(txn.amount / members.length);
    const remainder = txn.amount - perPerson * members.length;
    members.forEach((m, i) => {
      createExpenseSplit(
        expense.id,
        m.phone_number,
        perPerson + (i === 0 ? remainder : 0),
        null,
        hlcTimestamp,
      );
    });

    markTransactionAdded(txn.id);
    triggerAutoSmsSync(selectedGroupId);
    navigation.goBack();
  };

  const handleDismiss = () => {
    if (!txn) return;
    dismissTransaction(txn.id);
    navigation.goBack();
  };

  const formatPaymentMode = (mode: string): string => {
    switch (mode) {
      case 'upi': return 'UPI';
      case 'debit_card': return 'Debit Card';
      case 'credit_card': return 'Credit Card';
      case 'net_banking': return 'Net Banking';
      case 'wallet': return 'Wallet';
      default: return '';
    }
  };

  const styles = makeStyles(colors);

  if (!txn) {
    return (
      <View style={styles.container}>
        <Text style={styles.screenTitle}>Quick Add</Text>
        <Text style={styles.notFoundText}>Transaction not found</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <Text style={styles.screenTitle}>Quick Add</Text>

      {/* Transaction card */}
      <AppCard style={styles.txnCard}>
        <Text style={styles.txnAmount}>
          {formatCurrency(txn.amount, txn.currency)}
        </Text>
        {txn.merchant ? (
          <View style={styles.txnRow}>
            <Icon name="store-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.txnRowText}>{txn.merchant}</Text>
          </View>
        ) : null}
        {(txn.payment_mode || txn.instrument_id) ? (
          <View style={styles.txnRow}>
            <Icon name="credit-card-outline" size={16} color={colors.textSecondary} />
            <View style={styles.txnChipRow}>
              {txn.payment_mode ? (
                <View style={[styles.paymentChip, {backgroundColor: colors.surfaceElevated, borderColor: colors.border}]}>
                  <Text style={[styles.paymentChipText, {color: colors.text}]}>
                    {formatPaymentMode(txn.payment_mode)}
                  </Text>
                </View>
              ) : null}
              {txn.instrument_id ? (
                <Text style={styles.txnRowTextMuted}>{txn.instrument_id}</Text>
              ) : null}
            </View>
          </View>
        ) : null}
        <View style={styles.txnRow}>
          <Icon name="clock-outline" size={16} color={colors.textSecondary} />
          <Text style={styles.txnRowText}>
            {dayjs(txn.detected_at).format('MMM D, YYYY h:mm A')}
          </Text>
        </View>
      </AppCard>

      {/* Group picker */}
      <Text style={styles.label}>Group</Text>
      {groups.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.groupScroll}
          contentContainerStyle={styles.groupScrollContent}>
          {groups.map(g => (
            <Chip
              key={g.id}
              label={g.name}
              selected={selectedGroupId === g.id}
              onPress={() => setSelectedGroupId(g.id)}
            />
          ))}
        </ScrollView>
      ) : (
        <Text style={styles.noGroupsText}>No groups found. Create a group first.</Text>
      )}

      {/* Description */}
      <AppInput
        label="Description"
        value={description}
        onChangeText={setDescription}
        placeholder="What was this for?"
      />

      {/* Category picker */}
      <Text style={styles.label}>Category</Text>
      <TouchableOpacity
        style={styles.categoryButton}
        onPress={() => setShowCategoryPicker(true)}>
        <Icon name={getCategoryByKey(category).icon} size={18} color={colors.text} />
        <Text style={styles.categoryButtonText}>{getCategoryByKey(category).label}</Text>
        <Icon name="chevron-down" size={16} color={colors.textMuted} />
      </TouchableOpacity>

      <BottomSheet visible={showCategoryPicker} onClose={() => setShowCategoryPicker(false)} title="Select Category">
        <FlatList
          data={EXPENSE_CATEGORIES}
          keyExtractor={item => item.key}
          renderItem={({item}) => (
            <TouchableOpacity
              style={[
                styles.categoryRow,
                {borderBottomColor: colors.border},
                item.key === category && {backgroundColor: colors.surfaceElevated},
              ]}
              onPress={() => {
                setCategory(item.key);
                setShowCategoryPicker(false);
              }}>
              <Icon name={item.icon} size={20} color={colors.text} style={{width: 32}} />
              <Text style={[styles.categoryLabel, {color: colors.text}]}>{item.label}</Text>
              {item.key === category && <Icon name="check" size={18} color={colors.primary} />}
            </TouchableOpacity>
          )}
        />
      </BottomSheet>

      {/* Add expense button */}
      <AppButton
        title="Add Expense"
        onPress={handleAddExpense}
        disabled={!selectedGroupId || groups.length === 0}
        style={{marginTop: spacing['2xl']}}
      />

      {/* Dismiss */}
      <TouchableOpacity onPress={handleDismiss} style={styles.dismissButton}>
        <Text style={styles.dismissText}>Dismiss</Text>
      </TouchableOpacity>

      <View style={{height: spacing.xl}} />
    </ScrollView>
  );
}

const makeStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.sm,
    },
    screenTitle: {
      fontSize: fonts.sizes.xl,
      fontWeight: fonts.weights.bold,
      color: colors.text,
      marginBottom: spacing.base,
    },
    notFoundText: {
      fontSize: fonts.sizes.base,
      color: colors.textMuted,
      textAlign: 'center',
      marginTop: spacing['2xl'],
    },
    txnCard: {
      padding: spacing.xl,
    },
    txnAmount: {
      fontSize: 28,
      fontWeight: fonts.weights.bold,
      color: colors.text,
      marginBottom: spacing.md,
    },
    txnRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: spacing.sm,
    },
    txnRowText: {
      fontSize: fonts.sizes.base,
      color: colors.text,
    },
    txnRowTextMuted: {
      fontSize: fonts.sizes.sm,
      color: colors.textMuted,
    },
    txnChipRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      flex: 1,
    },
    paymentChip: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: 12,
      borderWidth: 1,
    },
    paymentChipText: {
      fontSize: fonts.sizes.xs,
      fontWeight: fonts.weights.medium,
    },
    label: {
      fontSize: fonts.sizes.base,
      fontWeight: fonts.weights.medium,
      color: colors.textSecondary,
      marginBottom: spacing.xs,
      marginTop: spacing.base,
    },
    groupScroll: {
      flexGrow: 0,
    },
    groupScrollContent: {
      gap: spacing.sm,
      paddingVertical: spacing.xs,
    },
    noGroupsText: {
      fontSize: fonts.sizes.sm,
      color: colors.textMuted,
      fontStyle: 'italic',
    },
    categoryButton: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      padding: spacing.base,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    categoryButtonText: {
      flex: 1,
      fontSize: fonts.sizes.md,
      color: colors.text,
    },
    categoryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.base,
      borderBottomWidth: 1,
      gap: spacing.sm,
    },
    categoryLabel: {
      flex: 1,
      fontSize: fonts.sizes.base,
    },
    dismissButton: {
      alignItems: 'center',
      paddingVertical: spacing.base,
      marginTop: spacing.sm,
    },
    dismissText: {
      fontSize: fonts.sizes.base,
      color: colors.textMuted,
      textDecorationLine: 'underline',
    },
  });
