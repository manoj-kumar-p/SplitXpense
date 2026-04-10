import React, {useState, useEffect} from 'react';
import {View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, FlatList, KeyboardAvoidingView, Platform} from 'react-native';
import {useNavigation, useRoute} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import type {RouteProp} from '@react-navigation/native';
import DateTimePicker from '@react-native-community/datetimepicker';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useTheme} from '../theme';
import {useAlert} from '../components/ThemedAlert';
import {AppInput, AppButton, BottomSheet, Chip} from '../components/ui';
import {fonts} from '../theme/fonts';
import {spacing} from '../theme/spacing';
import {getGroupMembers} from '../db/queries/groupQueries';
import {getLocalUser} from '../db/queries/userQueries';
import {createExpense, createExpenseSplit, createExpensePayer, getExpense, getExpenseSplits, getExpensePayers, updateExpense, deleteExpenseSplits, deleteExpensePayers} from '../db/queries/expenseQueries';
import {toPaisa, fromPaisa} from '../utils/currency';
import {CURRENCIES} from '../utils/currencies';
import {getDefaultCurrency} from '../db/queries/settingsQueries';
import {triggerAutoSmsSync} from '../sync/AutoSmsSync';
import {generateHlcTimestamp} from '../sync/syncLogger';
import {EXPENSE_CATEGORIES, getCategoryByKey} from '../utils/expenseCategories';
import type {GroupMember} from '../models/Group';
import type {SplitType} from '../models/Expense';
import type {GroupsStackParamList} from '../types/navigation';

type Nav = NativeStackNavigationProp<GroupsStackParamList, 'AddExpense'>;
type Route = RouteProp<GroupsStackParamList, 'AddExpense'>;

export default function AddExpenseScreen() {
  const {colors} = useTheme();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const {showAlert} = useAlert();
  const {groupId, editExpenseId} = route.params;
  const isEditing = !!editExpenseId;

  const [members, setMembers] = useState<GroupMember[]>([]);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState(getDefaultCurrency());
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  const [splitType, setSplitType] = useState<SplitType>('equal');
  const [category, setCategory] = useState('general');
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [expenseDate, setExpenseDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Multi-payer: phone -> amount string
  const [payers, setPayers] = useState<Record<string, string>>({});
  const [showMultiPayer, setShowMultiPayer] = useState(false);
  const [singlePayer, setSinglePayer] = useState('');

  // Split config: phone -> value string (shares/percentage/exact amount)
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [splitValues, setSplitValues] = useState<Record<string, string>>({});

  useEffect(() => {
    const m = getGroupMembers(groupId);
    setMembers(m);

    if (isEditing && editExpenseId) {
      // Load existing expense data
      const expense = getExpense(editExpenseId);
      if (expense) {
        setDescription(expense.description);
        setAmount(fromPaisa(expense.amount).toString());
        setCurrency(expense.currency);
        setSplitType(expense.split_type);
        setCategory(expense.category || 'general');
        if (expense.expense_date) {
          const parsed = new Date(expense.expense_date + 'T00:00:00');
          if (!isNaN(parsed.getTime())) setExpenseDate(parsed);
        }

        // Load payers
        const existingPayers = getExpensePayers(editExpenseId);
        if (existingPayers.length > 1) {
          setShowMultiPayer(true);
          const payerMap: Record<string, string> = {};
          existingPayers.forEach(p => {
            payerMap[p.phone_number] = fromPaisa(p.amount).toString();
          });
          setPayers(payerMap);
          setSinglePayer(existingPayers[0].phone_number);
        } else if (existingPayers.length === 1) {
          setSinglePayer(existingPayers[0].phone_number);
        } else {
          setSinglePayer(expense.paid_by);
        }

        // Load splits
        const existingSplits = getExpenseSplits(editExpenseId);
        const splitPhones = existingSplits.map(s => s.phone_number);
        setSelectedMembers(splitPhones);

        const vals: Record<string, string> = {};
        m.forEach(member => {
          vals[member.phone_number] = '1'; // default
        });
        existingSplits.forEach(s => {
          if (expense.split_type === 'exact') {
            vals[s.phone_number] = fromPaisa(s.amount).toString();
          } else if (expense.split_type === 'percentage' && s.percentage != null) {
            vals[s.phone_number] = s.percentage.toString();
          } else if (expense.split_type === 'shares') {
            // Reverse-engineer shares from amounts
            const totalAmount = expense.amount;
            const totalSplits = existingSplits.length;
            if (totalAmount > 0 && totalSplits > 0) {
              const share = Math.round((s.amount / totalAmount) * totalSplits);
              vals[s.phone_number] = (share || 1).toString();
            }
          }
        });
        setSplitValues(vals);
      }
    } else if (m.length > 0) {
      // Default payer is the local user (you)
      const localUser = getLocalUser();
      const me = m.find(member => member.phone_number === localUser?.phone_number);
      setSinglePayer(me ? me.phone_number : m[0].phone_number);
      setSelectedMembers(m.map(member => member.phone_number));
      // Default shares: 1 each
      const defaults: Record<string, string> = {};
      m.forEach(member => {
        defaults[member.phone_number] = '1';
      });
      setSplitValues(defaults);
    }
  }, [groupId, editExpenseId]);

  const getName = (phone: string) =>
    members.find(m => m.phone_number === phone)?.display_name || phone;

  const handleSave = () => {
    if (!description.trim()) {
      showAlert({title: 'Error', message: 'Please enter a description'});
      return;
    }
    const amountNum = parseFloat(amount);
    if (!amountNum || amountNum <= 0) {
      showAlert({title: 'Error', message: 'Please enter a valid amount'});
      return;
    }
    if (selectedMembers.length === 0) {
      showAlert({title: 'Error', message: 'Please select at least one member to split with'});
      return;
    }

    const now = generateHlcTimestamp();
    const totalPaisa = toPaisa(amountNum);

    if (totalPaisa <= 0) {
      showAlert({title: 'Error', message: 'Amount too small'});
      return;
    }

    // -----------------------------------------------------------------------
    // ALL VALIDATION FIRST (before any DB mutations)
    // -----------------------------------------------------------------------

    // Determine paidBy string
    let paidByStr: string;
    if (showMultiPayer) {
      const payerPhones = Object.entries(payers)
        .filter(([_, val]) => parseFloat(val) > 0)
        .map(([phone]) => phone);
      if (payerPhones.length === 0) {
        showAlert({title: 'Error', message: 'Please enter how much each payer paid'});
        return;
      }
      const payerTotal = Object.values(payers).reduce(
        (sum, val) => sum + toPaisa(parseFloat(val) || 0), 0,
      );
      if (Math.abs(payerTotal - totalPaisa) > 1) {
        showAlert({title: 'Error', message: `Payer amounts (${(payerTotal / 100).toFixed(2)}) don't add up to total (${amountNum.toFixed(2)})`});
        return;
      }
      paidByStr = payerPhones.join(',');
    } else {
      paidByStr = singlePayer;
    }

    // Validate percentage split sums to 100%
    if (splitType === 'percentage') {
      const totalPct = selectedMembers.reduce(
        (sum, phone) => sum + (parseFloat(splitValues[phone] || '0') || 0), 0,
      );
      if (Math.abs(totalPct - 100) > 0.01) {
        showAlert({title: 'Error', message: `Percentages add up to ${totalPct.toFixed(1)}%, not 100%`});
        return;
      }
    }

    // Validate exact split sums to total
    if (splitType === 'exact') {
      const exactTotal = selectedMembers.reduce(
        (sum, phone) => sum + toPaisa(parseFloat(splitValues[phone] || '0') || 0), 0,
      );
      if (Math.abs(exactTotal - totalPaisa) > 1) {
        showAlert({title: 'Error', message: `Exact amounts (${(exactTotal / 100).toFixed(2)}) don't add up to total (${amountNum.toFixed(2)})`});
        return;
      }
    }

    // -----------------------------------------------------------------------
    // ALL DB WRITES (validation passed)
    // -----------------------------------------------------------------------

    let expenseId: string;

    const dateStr = expenseDate.toISOString().split('T')[0];

    if (isEditing && editExpenseId) {
      updateExpense(
        editExpenseId, description.trim(), totalPaisa, currency,
        paidByStr, splitType, dateStr, now, category,
      );
      deleteExpenseSplits(editExpenseId, now);
      deleteExpensePayers(editExpenseId, now);
      expenseId = editExpenseId;
    } else {
      const expense = createExpense(
        groupId, description.trim(), totalPaisa, currency,
        paidByStr, splitType, dateStr, now, category,
      );
      expenseId = expense.id;
    }

    // Create payer records
    if (showMultiPayer) {
      for (const [phone, val] of Object.entries(payers)) {
        const payerAmount = toPaisa(parseFloat(val) || 0);
        if (payerAmount > 0) {
          createExpensePayer(expenseId, phone, payerAmount, now);
        }
      }
    } else {
      createExpensePayer(expenseId, singlePayer, totalPaisa, now);
    }

    // Create splits based on split type
    if (splitType === 'equal') {
      const perPerson = Math.floor(totalPaisa / selectedMembers.length);
      const remainder = totalPaisa - perPerson * selectedMembers.length;
      selectedMembers.forEach((phone, index) => {
        createExpenseSplit(expenseId, phone, perPerson + (index === 0 ? remainder : 0), null, now);
      });
    } else if (splitType === 'shares') {
      const totalShares = selectedMembers.reduce(
        (sum, phone) => sum + (parseFloat(splitValues[phone] || '1') || 1), 0,
      );
      let allocated = 0;
      selectedMembers.forEach((phone, index) => {
        const shares = parseFloat(splitValues[phone] || '1') || 1;
        let splitAmount: number;
        if (index === selectedMembers.length - 1) {
          splitAmount = totalPaisa - allocated;
        } else {
          splitAmount = Math.round(totalPaisa * shares / totalShares);
        }
        allocated += splitAmount;
        createExpenseSplit(expenseId, phone, splitAmount, null, now);
      });
    } else if (splitType === 'percentage') {
      let allocated = 0;
      selectedMembers.forEach((phone, index) => {
        const pct = parseFloat(splitValues[phone] || '0');
        let splitAmount: number;
        if (index === selectedMembers.length - 1) {
          splitAmount = totalPaisa - allocated;
        } else {
          splitAmount = Math.round(totalPaisa * pct / 100);
        }
        allocated += splitAmount;
        createExpenseSplit(expenseId, phone, splitAmount, pct, now);
      });
    } else {
      // exact
      for (const phone of selectedMembers) {
        const exact = toPaisa(parseFloat(splitValues[phone] || '0') || 0);
        createExpenseSplit(expenseId, phone, exact, null, now);
      }
    }

    triggerAutoSmsSync(groupId);
    navigation.goBack();
  };

  const toggleMember = (phone: string) => {
    setSelectedMembers(prev =>
      prev.includes(phone) ? prev.filter(p => p !== phone) : [...prev, phone],
    );
  };

  const styles = makeStyles(colors);

  return (
    <KeyboardAvoidingView style={{flex: 1}} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <Text style={styles.screenTitle}>{isEditing ? 'Edit Expense' : 'Add Expense'}</Text>

      {/* Description */}
      <AppInput
        label="Description"
        value={description}
        onChangeText={setDescription}
        placeholder="What was this for?"
        autoFocus
      />

      {/* Category */}
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

      {/* Date */}
      <Text style={styles.label}>Date</Text>
      <TouchableOpacity
        style={styles.dateButton}
        onPress={() => setShowDatePicker(true)}>
        <Icon name="calendar-outline" size={18} color={colors.text} />
        <Text style={styles.dateButtonText}>{expenseDate.toLocaleDateString()}</Text>
      </TouchableOpacity>
      {showDatePicker && (
        <DateTimePicker
          value={expenseDate}
          mode="date"
          display="default"
          maximumDate={new Date()}
          onChange={(_event: any, selectedDate: any) => {
            setShowDatePicker(false);
            if (selectedDate) setExpenseDate(selectedDate);
          }}
        />
      )}

      {/* Amount */}
      <AppInput
        label="Total Amount"
        value={amount}
        onChangeText={setAmount}
        placeholder="0.00"
        keyboardType="decimal-pad"
      />

      {/* Currency */}
      <Text style={styles.label}>Currency</Text>
      <TouchableOpacity
        style={styles.currencyButton}
        onPress={() => setShowCurrencyPicker(true)}>
        <Text style={styles.currencyButtonText}>
          {CURRENCIES.find(c => c.code === currency)?.symbol || currency}{' '}
          {currency}
        </Text>
      </TouchableOpacity>

      <BottomSheet visible={showCurrencyPicker} onClose={() => setShowCurrencyPicker(false)} title="Select Currency">
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

      {/* Paid by */}
      <View style={styles.labelRow}>
        <Text style={styles.label}>Paid by</Text>
        <TouchableOpacity onPress={() => setShowMultiPayer(!showMultiPayer)}>
          <Text style={styles.linkText}>
            {showMultiPayer ? 'Single payer' : 'Multiple payers'}
          </Text>
        </TouchableOpacity>
      </View>

      {!showMultiPayer ? (
        <View style={styles.chipRow}>
          {members.map(m => (
            <Chip
              key={m.phone_number}
              label={m.display_name}
              selected={singlePayer === m.phone_number}
              onPress={() => setSinglePayer(m.phone_number)}
            />
          ))}
        </View>
      ) : (
        <View>
          {members.map(m => (
            <View key={m.phone_number} style={styles.memberRow}>
              <Text style={styles.memberName}>{m.display_name}</Text>
              <TextInput
                style={styles.splitInput}
                value={payers[m.phone_number] || ''}
                onChangeText={val =>
                  setPayers(prev => ({...prev, [m.phone_number]: val}))
                }
                placeholder="0.00"
                placeholderTextColor={colors.placeholder}
                keyboardType="decimal-pad"
              />
            </View>
          ))}
        </View>
      )}

      {/* Split type */}
      <Text style={styles.label}>Split type</Text>
      <View style={styles.chipRow}>
        {([
          {type: 'equal' as SplitType, label: 'Equal'},
          {type: 'exact' as SplitType, label: 'Unequal'},
          {type: 'shares' as SplitType, label: 'By Shares'},
          {type: 'percentage' as SplitType, label: 'By %'},
        ]).map(({type, label}) => (
          <Chip
            key={type}
            label={label}
            selected={splitType === type}
            onPress={() => setSplitType(type)}
          />
        ))}
      </View>

      {/* Split among */}
      <Text style={styles.label}>Split among</Text>
      {members.map(m => {
        const isSelected = selectedMembers.includes(m.phone_number);
        return (
          <View key={m.phone_number} style={styles.memberRow}>
            <TouchableOpacity onPress={() => toggleMember(m.phone_number)}>
              <Icon
                name={isSelected ? 'checkbox-marked' : 'checkbox-blank-outline'}
                size={24}
                color={isSelected ? colors.primary : colors.border}
                style={{marginRight: spacing.md}}
              />
            </TouchableOpacity>
            <Text style={[styles.memberName, !isSelected && styles.memberDisabled]}>
              {m.display_name}
            </Text>
            {splitType !== 'equal' && isSelected && (
              <TextInput
                style={styles.splitInput}
                value={splitValues[m.phone_number] || ''}
                onChangeText={val =>
                  setSplitValues(prev => ({...prev, [m.phone_number]: val}))
                }
                placeholder={
                  splitType === 'shares' ? '1' :
                  splitType === 'percentage' ? '%' : 'Amount'
                }
                placeholderTextColor={colors.placeholder}
                keyboardType="decimal-pad"
              />
            )}
          </View>
        );
      })}

      {/* Summary hint for shares */}
      {splitType === 'shares' && selectedMembers.length > 0 && amount && (
        <Text style={styles.hint}>
          Total shares: {selectedMembers.reduce(
            (sum, phone) => sum + (parseFloat(splitValues[phone] || '1') || 1), 0,
          )}
        </Text>
      )}

      {/* Summary hint for percentage */}
      {splitType === 'percentage' && selectedMembers.length > 0 && (
        <Text style={styles.hint}>
          Total: {selectedMembers.reduce(
            (sum, phone) => sum + (parseFloat(splitValues[phone] || '0') || 0), 0,
          ).toFixed(1)}%
        </Text>
      )}

      {/* Summary hint for exact */}
      {splitType === 'exact' && selectedMembers.length > 0 && (
        <Text style={styles.hint}>
          Total: {selectedMembers.reduce(
            (sum, phone) => sum + (parseFloat(splitValues[phone] || '0') || 0), 0,
          ).toFixed(2)} of {parseFloat(amount || '0').toFixed(2)}
        </Text>
      )}

      <AppButton
        title={isEditing ? 'Update Expense' : 'Add Expense'}
        onPress={handleSave}
        style={{marginTop: spacing['2xl']}}
      />

      <View style={{height: spacing.xl}} />
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
      paddingTop: spacing.sm,
    },
    screenTitle: {
      fontSize: fonts.sizes.xl,
      fontWeight: fonts.weights.bold,
      color: colors.text,
      marginBottom: spacing.base,
    },
    label: {
      fontSize: fonts.sizes.base,
      fontWeight: fonts.weights.medium,
      color: colors.textSecondary,
      marginBottom: spacing.xs,
      marginTop: spacing.base,
    },
    labelRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: spacing.base,
      marginBottom: spacing.xs,
    },
    linkText: {
      fontSize: fonts.sizes.sm,
      color: colors.accent,
      textDecorationLine: 'underline',
    },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    memberRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.sm,
    },
    memberName: {
      flex: 1,
      fontSize: fonts.sizes.base,
      color: colors.text,
    },
    memberDisabled: {
      color: colors.textMuted,
    },
    splitInput: {
      width: 80,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 6,
      padding: spacing.sm,
      fontSize: fonts.sizes.sm,
      color: colors.text,
      textAlign: 'right',
    },
    hint: {
      fontSize: fonts.sizes.sm,
      color: colors.textMuted,
      marginTop: spacing.xs,
    },
    currencyButton: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      padding: spacing.base,
      flexDirection: 'row',
      alignItems: 'center',
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
    dateButton: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      padding: spacing.base,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    dateButtonText: {
      fontSize: fonts.sizes.md,
      color: colors.text,
    },
  });
