import React, {useEffect, useState, useCallback} from 'react';
import {View, Text, ScrollView, TouchableOpacity, StyleSheet} from 'react-native';
import {useNavigation, useRoute} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import type {RouteProp} from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useTheme} from '../theme';
import {useAlert} from '../components/ThemedAlert';
import {SectionHeader, AppCard, Divider, AppAvatar} from '../components/ui';
import {fonts} from '../theme/fonts';
import {spacing} from '../theme/spacing';
import {getExpense, getExpenseSplits, deleteExpense, deleteExpenseSplits, deleteExpensePayers} from '../db/queries/expenseQueries';
import {getGroupMembers} from '../db/queries/groupQueries';
import {getLocalUser} from '../db/queries/userQueries';
import {formatCurrency} from '../utils/currency';
import {getCategoryByKey} from '../utils/expenseCategories';
import dayjs from 'dayjs';
import type {Expense, ExpenseSplit} from '../models/Expense';
import type {GroupMember} from '../models/Group';
import type {GroupsStackParamList} from '../types/navigation';

type Nav = NativeStackNavigationProp<GroupsStackParamList, 'ExpenseDetail'>;
type Route = RouteProp<GroupsStackParamList, 'ExpenseDetail'>;

export default function ExpenseDetailScreen() {
  const {colors} = useTheme();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const {showAlert} = useAlert();
  const {expenseId, groupId} = route.params;

  const [expense, setExpense] = useState<Expense | null>(null);
  const [splits, setSplits] = useState<ExpenseSplit[]>([]);
  const [members, setMembers] = useState<GroupMember[]>([]);

  useEffect(() => {
    setExpense(getExpense(expenseId));
    setSplits(getExpenseSplits(expenseId));
    setMembers(getGroupMembers(groupId));
  }, [expenseId, groupId]);

  const getMemberName = (phone: string) => {
    const localUser = getLocalUser();
    if (phone === localUser?.phone_number) return 'You';
    return members.find(m => m.phone_number === phone)?.display_name || phone;
  };

  const handleDelete = useCallback(() => {
    showAlert({
      title: 'Delete Expense',
      message: `Are you sure you want to delete "${expense?.description}"?`,
      buttons: [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            const now = Date.now().toString();
            deleteExpenseSplits(expenseId, now);
            deleteExpensePayers(expenseId, now);
            deleteExpense(expenseId, now);
            navigation.goBack();
          },
        },
      ],
    });
  }, [expense?.description, expenseId, navigation, showAlert]);

  const handleEdit = useCallback(() => {
    navigation.navigate('AddExpense', {groupId, editExpenseId: expenseId});
  }, [navigation, groupId, expenseId]);

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={{flexDirection: 'row', gap: 16, marginRight: 4}}>
          <TouchableOpacity onPress={handleEdit} hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
            <Icon name="pencil-outline" size={22} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleDelete} hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
            <Icon name="trash-can-outline" size={22} color={colors.negative} />
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation, colors, handleEdit, handleDelete]);

  const styles = makeStyles(colors);

  if (!expense) {
    return (
      <View style={styles.container}>
        <Text style={styles.emptyText}>Expense not found</Text>
      </View>
    );
  }

  const splitTypeLabel = {
    equal: 'Split equally',
    shares: 'Split by shares',
    percentage: 'Split by percentage',
    exact: 'Split by custom amounts',
  }[expense.split_type] || expense.split_type;

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Amount Card */}
      <AppCard style={{borderRadius: 16, padding: spacing.xl, alignItems: 'center'}}>
        <Text style={styles.description}>{expense.description}</Text>
        <Text style={styles.amount}>{formatCurrency(expense.amount, expense.currency)}</Text>
        {(() => {
          const localUser = getLocalUser();
          const mySplit = localUser ? splits.find(s => s.phone_number === localUser.phone_number) : null;
          return mySplit ? (
            <Text style={{fontSize: 13, color: colors.textMuted, marginTop: spacing.xs}}>
              Your share: {formatCurrency(mySplit.amount, expense.currency)}
            </Text>
          ) : null;
        })()}
      </AppCard>

      {/* Details */}
      <AppCard noPadding>
        <View style={styles.detailRow}>
          <View style={[styles.detailIcon, {backgroundColor: colors.surfaceElevated}]}>
            <Icon name="account-outline" size={16} color={colors.text} />
          </View>
          <Text style={[styles.detailLabel, {color: colors.textMuted}]}>Paid by</Text>
          <Text style={[styles.detailValue, {color: colors.text}]}>{getMemberName(expense.paid_by)}</Text>
        </View>
        <Divider inset={60} />
        <View style={styles.detailRow}>
          <View style={[styles.detailIcon, {backgroundColor: colors.surfaceElevated}]}>
            <Icon name={getCategoryByKey(expense.category || 'general').icon} size={16} color={colors.text} />
          </View>
          <Text style={[styles.detailLabel, {color: colors.textMuted}]}>Category</Text>
          <Text style={[styles.detailValue, {color: colors.text}]}>{getCategoryByKey(expense.category || 'general').label}</Text>
        </View>
        <Divider inset={60} />
        <View style={styles.detailRow}>
          <View style={[styles.detailIcon, {backgroundColor: colors.surfaceElevated}]}>
            <Icon name="calendar-outline" size={16} color={colors.text} />
          </View>
          <Text style={[styles.detailLabel, {color: colors.textMuted}]}>Date</Text>
          <Text style={[styles.detailValue, {color: colors.text}]}>{dayjs(expense.expense_date).format('D MMMM YYYY')}</Text>
        </View>
        <Divider inset={60} />
        <View style={styles.detailRow}>
          <View style={[styles.detailIcon, {backgroundColor: colors.surfaceElevated}]}>
            <Icon name="call-split" size={16} color={colors.text} />
          </View>
          <Text style={[styles.detailLabel, {color: colors.textMuted}]}>Split type</Text>
          <Text style={[styles.detailValue, {color: colors.text}]}>{splitTypeLabel}</Text>
        </View>
      </AppCard>

      {/* Splits */}
      <SectionHeader title="SPLIT DETAILS" />
      <AppCard noPadding>
        {splits.map((split, i) => (
          <React.Fragment key={split.id}>
            {i > 0 && <Divider inset={60} />}
            <View style={styles.splitRow}>
              <View style={{marginRight: spacing.md}}>
                <AppAvatar name={getMemberName(split.phone_number)} size="xs" />
              </View>
              <Text style={[styles.splitName, {color: colors.text}]}>{getMemberName(split.phone_number)}</Text>
              <Text style={[styles.splitAmount, {color: colors.text}]}>
                {formatCurrency(split.amount, expense.currency)}
              </Text>
            </View>
          </React.Fragment>
        ))}
      </AppCard>

      <View style={{height: spacing.xl}} />
    </ScrollView>
  );
}

const makeStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      paddingHorizontal: spacing.base,
      paddingTop: spacing.base,
    },
    description: {
      fontSize: fonts.sizes.lg,
      fontWeight: '600',
      color: colors.text,
      marginBottom: spacing.sm,
    },
    amount: {
      fontSize: 36,
      fontWeight: '700',
      color: colors.text,
    },
    detailRow: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: spacing.base,
    },
    detailIcon: {
      width: 28,
      height: 28,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: spacing.md,
    },
    detailLabel: {
      flex: 1,
      fontSize: fonts.sizes.sm,
    },
    detailValue: {
      fontSize: fonts.sizes.base,
      fontWeight: '500',
    },
    splitRow: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: spacing.base,
    },
    splitName: {
      flex: 1,
      fontSize: fonts.sizes.base,
    },
    splitAmount: {
      fontSize: fonts.sizes.base,
      fontWeight: '600',
    },
    emptyText: {
      fontSize: fonts.sizes.base,
      color: colors.textMuted,
      textAlign: 'center',
      marginTop: spacing['4xl'],
    },
  });
