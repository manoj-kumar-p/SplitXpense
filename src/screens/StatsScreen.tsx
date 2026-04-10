import React, {useCallback, useState} from 'react';
import {View, Text, ScrollView, TouchableOpacity, StyleSheet, Modal} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import DateTimePicker from '@react-native-community/datetimepicker';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useTheme} from '../theme';
import {Chip, AppCard, SectionHeader, EmptyState} from '../components/ui';
import {fonts} from '../theme/fonts';
import {spacing} from '../theme/spacing';
import {getLocalUser} from '../db/queries/userQueries';
import {getAllGroups} from '../db/queries/groupQueries';
import {getGroupExpenses, getExpenseSplits, getExpensePayers} from '../db/queries/expenseQueries';
import {formatCurrency} from '../utils/currency';
import {getDefaultCurrency} from '../db/queries/settingsQueries';
import {getCategoryByKey} from '../utils/expenseCategories';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';

dayjs.extend(isoWeek);

type Period = 'day' | 'week' | 'month' | 'year' | 'custom';

interface CategoryStat {
  key: string;
  label: string;
  icon: string;
  total: number;
  count: number;
}

interface GroupStat {
  id: string;
  name: string;
  total: number;
  count: number;
}

function getDateRange(period: Period, anchor: dayjs.Dayjs): {start: dayjs.Dayjs; end: dayjs.Dayjs} {
  switch (period) {
    case 'day':
      return {start: anchor.startOf('day'), end: anchor.endOf('day')};
    case 'week':
      return {start: anchor.startOf('isoWeek'), end: anchor.endOf('isoWeek')};
    case 'month':
      return {start: anchor.startOf('month'), end: anchor.endOf('month')};
    case 'year':
      return {start: anchor.startOf('year'), end: anchor.endOf('year')};
    default:
      return {start: anchor.startOf('day'), end: anchor.endOf('day')};
  }
}

function formatPeriodLabel(period: Period, anchor: dayjs.Dayjs): string {
  const now = dayjs();
  switch (period) {
    case 'day': {
      if (anchor.isSame(now, 'day')) return 'Today';
      if (anchor.isSame(now.subtract(1, 'day'), 'day')) return 'Yesterday';
      return anchor.format('D MMM YYYY');
    }
    case 'week': {
      const start = anchor.startOf('isoWeek');
      const end = anchor.endOf('isoWeek');
      if (start.isSame(now.startOf('isoWeek'))) return 'This Week';
      return `${start.format('D MMM')} - ${end.format('D MMM')}`;
    }
    case 'month': {
      if (anchor.isSame(now, 'month')) return 'This Month';
      if (anchor.isSame(now.subtract(1, 'month'), 'month')) return 'Last Month';
      return anchor.format('MMM YYYY');
    }
    case 'year': {
      if (anchor.isSame(now, 'year')) return 'This Year';
      return anchor.format('YYYY');
    }
    default:
      return '';
  }
}

function shiftAnchor(period: Period, anchor: dayjs.Dayjs, direction: number): dayjs.Dayjs {
  switch (period) {
    case 'day': return anchor.add(direction, 'day');
    case 'week': return anchor.add(direction, 'week');
    case 'month': return anchor.add(direction, 'month');
    case 'year': return anchor.add(direction, 'year');
    default: return anchor;
  }
}

export default function StatsScreen() {
  const {colors} = useTheme();
  const [period, setPeriod] = useState<Period>('month');
  const [anchor, setAnchor] = useState(dayjs());
  const [customStart, setCustomStart] = useState(dayjs().subtract(30, 'day').toDate());
  const [customEnd, setCustomEnd] = useState(new Date());
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [pickingField, setPickingField] = useState<'start' | 'end'>('start');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [totalSpent, setTotalSpent] = useState(0);
  const [expenseCount, setExpenseCount] = useState(0);
  const [categoryStats, setCategoryStats] = useState<CategoryStat[]>([]);
  const [groupStats, setGroupStats] = useState<GroupStat[]>([]);

  useFocusEffect(
    useCallback(() => {
      const user = getLocalUser();
      if (!user) return;

      let startStr: string;
      let endStr: string;

      if (period === 'custom') {
        startStr = dayjs(customStart).format('YYYY-MM-DD');
        endStr = dayjs(customEnd).format('YYYY-MM-DD');
      } else {
        const range = getDateRange(period, anchor);
        startStr = range.start.format('YYYY-MM-DD');
        endStr = range.end.format('YYYY-MM-DD');
      }

      const groups = getAllGroups();
      const catMap: Record<string, CategoryStat> = {};
      const grpMap: Record<string, GroupStat> = {};
      let spent = 0;
      let count = 0;

      for (const group of groups) {
        const expenses = getGroupExpenses(group.id);
        let groupTotal = 0;
        let groupCount = 0;

        for (const exp of expenses) {
          if (!exp.expense_date) continue;
          if (exp.expense_date < startStr || exp.expense_date > endStr) continue;

          // Calculate your share of the expense
          const splits = getExpenseSplits(exp.id);
          const mySplit = splits.find(s => s.phone_number === user.phone_number);
          const myShare = mySplit ? mySplit.amount : 0;
          if (myShare <= 0) continue;

          count++;
          groupCount++;
          spent += myShare;
          groupTotal += myShare;

          const catKey = exp.category || 'general';
          if (!catMap[catKey]) {
            const cat = getCategoryByKey(catKey);
            catMap[catKey] = {key: catKey, label: cat.label, icon: cat.icon, total: 0, count: 0};
          }
          catMap[catKey].total += myShare;
          catMap[catKey].count++;
        }

        if (groupCount > 0) {
          grpMap[group.id] = {id: group.id, name: group.name, total: groupTotal, count: groupCount};
        }
      }

      setTotalSpent(spent);
      setExpenseCount(count);
      setCategoryStats(Object.values(catMap).sort((a, b) => b.total - a.total));
      setGroupStats(Object.values(grpMap).sort((a, b) => b.total - a.total));
    }, [period, anchor, customStart, customEnd]),
  );

  const handlePeriodChange = (p: Period) => {
    if (p === 'custom') {
      setPeriod('custom');
      setShowCustomPicker(true);
    } else {
      setPeriod(p);
      setAnchor(dayjs());
    }
  };

  const handleNavigate = (dir: number) => {
    setAnchor(prev => shiftAnchor(period, prev, dir));
  };

  const canGoForward = period !== 'custom' && shiftAnchor(period, anchor, 1).startOf('day').isBefore(dayjs().add(1, 'day'));

  const openDatePicker = (field: 'start' | 'end') => {
    setPickingField(field);
    setShowDatePicker(true);
  };

  const styles = makeStyles(colors);
  const maxCatTotal = categoryStats.length > 0 ? categoryStats[0].total : 1;

  const periodLabel = period === 'custom'
    ? `${dayjs(customStart).format('D MMM')} - ${dayjs(customEnd).format('D MMM YYYY')}`
    : formatPeriodLabel(period, anchor);

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <Text style={styles.title}>Statistics</Text>

      {/* Period selector */}
      <View style={styles.periodRow}>
        {(['day', 'week', 'month', 'year', 'custom'] as Period[]).map(p => (
          <View key={p} style={{flex: 1}}>
            <Chip
              label={p === 'day' ? 'Day' : p === 'week' ? 'Week' : p === 'month' ? 'Month' : p === 'year' ? 'Year' : 'Custom'}
              selected={period === p}
              onPress={() => handlePeriodChange(p)}
            />
          </View>
        ))}
      </View>

      {/* Navigation arrows + label */}
      <View style={styles.navRow}>
        {period !== 'custom' ? (
          <>
            <TouchableOpacity style={styles.navArrow} activeOpacity={0.7} onPress={() => handleNavigate(-1)}>
              <Icon name="chevron-left" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.navLabel, {color: colors.text}]}>{periodLabel}</Text>
            <TouchableOpacity
              style={[styles.navArrow, !canGoForward && {opacity: 0.3}]}
              activeOpacity={0.7}
              onPress={() => canGoForward && handleNavigate(1)}
              disabled={!canGoForward}>
              <Icon name="chevron-right" size={24} color={colors.text} />
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity style={styles.customRangeBtn} activeOpacity={0.7} onPress={() => setShowCustomPicker(true)}>
            <Icon name="calendar-range" size={18} color={colors.text} />
            <Text style={[styles.navLabel, {color: colors.text}]}>{periodLabel}</Text>
            <Icon name="pencil-outline" size={14} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Custom date range modal */}
      <Modal visible={showCustomPicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, {backgroundColor: colors.surface}]}>
            <Text style={[styles.modalTitle, {color: colors.text}]}>Custom Date Range</Text>

            <Text style={[styles.dateLabel, {color: colors.textMuted}]}>From</Text>
            <TouchableOpacity
              style={[styles.datePickerBtn, {borderColor: colors.border}]}
              activeOpacity={0.7}
              onPress={() => openDatePicker('start')}>
              <Icon name="calendar-outline" size={18} color={colors.text} />
              <Text style={[styles.datePickerText, {color: colors.text}]}>
                {dayjs(customStart).format('D MMM YYYY')}
              </Text>
            </TouchableOpacity>

            <Text style={[styles.dateLabel, {color: colors.textMuted}]}>To</Text>
            <TouchableOpacity
              style={[styles.datePickerBtn, {borderColor: colors.border}]}
              activeOpacity={0.7}
              onPress={() => openDatePicker('end')}>
              <Icon name="calendar-outline" size={18} color={colors.text} />
              <Text style={[styles.datePickerText, {color: colors.text}]}>
                {dayjs(customEnd).format('D MMM YYYY')}
              </Text>
            </TouchableOpacity>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, {borderColor: colors.border}]}
                activeOpacity={0.7}
                onPress={() => setShowCustomPicker(false)}>
                <Text style={{color: colors.text, fontWeight: '600'}}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, {backgroundColor: colors.primary}]}
                activeOpacity={0.7}
                onPress={() => setShowCustomPicker(false)}>
                <Text style={{color: colors.textInverse, fontWeight: '600'}}>Apply</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {showDatePicker && (
        <DateTimePicker
          value={pickingField === 'start' ? customStart : customEnd}
          mode="date"
          display="default"
          maximumDate={new Date()}
          onChange={(_event: any, selectedDate: any) => {
            setShowDatePicker(false);
            if (selectedDate) {
              if (pickingField === 'start') {
                setCustomStart(selectedDate);
                if (selectedDate > customEnd) setCustomEnd(selectedDate);
              } else {
                setCustomEnd(selectedDate);
                if (selectedDate < customStart) setCustomStart(selectedDate);
              }
            }
          }}
        />
      )}

      {/* Total spent card */}
      <AppCard style={styles.totalCard}>
        <Text style={[styles.totalLabel, {color: colors.textMuted}]}>Your Spend</Text>
        <Text style={[styles.totalValue, {color: colors.text}]}>{formatCurrency(totalSpent, getDefaultCurrency())}</Text>
        <Text style={[styles.totalCount, {color: colors.textMuted}]}>{expenseCount} expense{expenseCount !== 1 ? 's' : ''}</Text>
      </AppCard>

      {/* Category breakdown */}
      {categoryStats.length > 0 && (
        <>
          <SectionHeader title="BY CATEGORY" />
          <AppCard noPadding>
            {categoryStats.map((cat, i) => (
              <View key={cat.key}>
                {i > 0 && <View style={[styles.divider, {backgroundColor: colors.border}]} />}
                <View style={styles.catRow}>
                  <Icon name={cat.icon} size={18} color={colors.text} style={{width: 28}} />
                  <View style={{flex: 1}}>
                    <View style={styles.catHeader}>
                      <Text style={[styles.catLabel, {color: colors.text}]}>{cat.label}</Text>
                      <Text style={[styles.catAmount, {color: colors.text}]}>{formatCurrency(cat.total, getDefaultCurrency())}</Text>
                    </View>
                    <View style={styles.barBg}>
                      <View
                        style={[styles.barFill, {
                          width: `${Math.max(3, (cat.total / maxCatTotal) * 100)}%`,
                          backgroundColor: colors.primary,
                        }]}
                      />
                    </View>
                    <Text style={{fontSize: 11, color: colors.textMuted, marginTop: 2}}>
                      {totalSpent > 0 ? Math.round((cat.total / totalSpent) * 100) : 0}% of total
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </AppCard>
        </>
      )}

      {/* Group breakdown */}
      {groupStats.length > 0 && (
        <>
          <SectionHeader title="BY GROUP" />
          <AppCard noPadding>
            {groupStats.map((grp, i) => {
              const maxGrpTotal = groupStats.length > 0 ? groupStats[0].total : 1;
              return (
                <View key={grp.id}>
                  {i > 0 && <View style={[styles.divider, {backgroundColor: colors.border}]} />}
                  <View style={styles.groupRow}>
                    <View style={{flex: 1}}>
                      <View style={{flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4}}>
                        <Text style={[styles.catLabel, {color: colors.text}]}>{grp.name}</Text>
                        <Text style={[styles.catAmount, {color: colors.text}]}>{formatCurrency(grp.total, getDefaultCurrency())}</Text>
                      </View>
                      <View style={styles.barBg}>
                        <View style={[styles.barFill, {width: `${Math.max(3, (grp.total / maxGrpTotal) * 100)}%`, backgroundColor: colors.primary}]} />
                      </View>
                      <Text style={[styles.groupCount, {color: colors.textMuted, marginTop: 2}]}>
                        {grp.count} expense{grp.count !== 1 ? 's' : ''} · {totalSpent > 0 ? Math.round((grp.total / totalSpent) * 100) : 0}%
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </AppCard>
        </>
      )}

      {expenseCount === 0 && (
        <EmptyState
          icon="chart-bar"
          title={`No expenses ${period === 'custom' ? 'in this range' : period === 'day' ? 'today' : `this ${period}`}`}
        />
      )}

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
    title: {
      fontSize: fonts.sizes.xl,
      fontWeight: fonts.weights.bold,
      color: colors.text,
      marginBottom: spacing.base,
      marginTop: spacing.sm,
    },
    periodRow: {
      flexDirection: 'row',
      gap: spacing.xs,
      marginBottom: spacing.md,
    },
    navRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.base,
      gap: spacing.md,
    },
    navArrow: {
      padding: spacing.md,
    },
    navLabel: {
      fontSize: fonts.sizes.base,
      fontWeight: fonts.weights.semibold,
      textAlign: 'center',
    },
    customRangeBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.base,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: colors.modalOverlay,
      justifyContent: 'center',
      padding: spacing.xl,
    },
    modalContent: {
      borderRadius: 16,
      padding: spacing.xl,
    },
    modalTitle: {
      fontSize: fonts.sizes.lg,
      fontWeight: fonts.weights.bold,
      marginBottom: spacing.base,
      textAlign: 'center',
    },
    dateLabel: {
      fontSize: fonts.sizes.sm,
      marginBottom: spacing.xs,
      marginTop: spacing.sm,
    },
    datePickerBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      borderWidth: 1,
      borderRadius: 8,
      padding: spacing.base,
    },
    datePickerText: {
      fontSize: fonts.sizes.base,
    },
    modalActions: {
      flexDirection: 'row',
      gap: spacing.md,
      marginTop: spacing.xl,
    },
    modalBtn: {
      flex: 1,
      borderRadius: 8,
      paddingVertical: spacing.md,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: 'transparent',
    },
    totalCard: {
      padding: spacing.base,
      alignItems: 'center' as const,
    },
    totalLabel: {
      fontSize: fonts.sizes.sm,
      marginBottom: spacing.xs,
    },
    totalValue: {
      fontSize: fonts.sizes['2xl'],
      fontWeight: fonts.weights.bold,
    },
    totalCount: {
      fontSize: fonts.sizes.xs,
      marginTop: spacing.xs,
    },
    catRow: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: spacing.base,
      gap: spacing.sm,
    },
    catHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.xs,
    },
    catLabel: {
      fontSize: fonts.sizes.base,
      fontWeight: fonts.weights.medium,
    },
    catAmount: {
      fontSize: fonts.sizes.base,
      fontWeight: fonts.weights.semibold,
    },
    barBg: {
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.border,
      overflow: 'hidden',
    },
    barFill: {
      height: 8,
      borderRadius: 4,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      marginLeft: spacing.base,
    },
    groupRow: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: spacing.base,
    },
    groupCount: {
      fontSize: fonts.sizes.xs,
      marginTop: 2,
    },
  });
