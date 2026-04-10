import React, {useCallback, useState} from 'react';
import {View, Text, SectionList, StyleSheet} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useTheme} from '../theme';
import {SectionHeader, AppAvatar} from '../components/ui';
import {fonts} from '../theme/fonts';
import {spacing} from '../theme/spacing';
import {getLocalUser} from '../db/queries/userQueries';
import {getAllGroups, getGroupMembers} from '../db/queries/groupQueries';
import {getGroupExpenses, getExpenseSplits, getExpensePayers} from '../db/queries/expenseQueries';
import {getGroupSettlements} from '../db/queries/settlementQueries';
import {calculateGroupBalances} from '../utils/balance';
import {formatCurrency} from '../utils/currency';
import {getDefaultCurrency} from '../db/queries/settingsQueries';
import type {Debt} from '../utils/balance';

interface DebtWithNames extends Debt {
  fromName: string;
  toName: string;
  groupName: string;
  iOwe: boolean;
}

export default function BalancesScreen() {
  const {colors} = useTheme();
  const [sections, setSections] = useState<Array<{title: string; data: DebtWithNames[]}>>([]);
  const [netBalance, setNetBalance] = useState(0);

  useFocusEffect(
    useCallback(() => {
      const user = getLocalUser();
      if (!user) return;

      const groups = getAllGroups();
      const groupMap: Record<string, DebtWithNames[]> = {};
      let net = 0;

      for (const group of groups) {
        const members = getGroupMembers(group.id);
        const expenses = getGroupExpenses(group.id);
        const splits = expenses.flatMap(e => getExpenseSplits(e.id));
        const settlements = getGroupSettlements(group.id);
        const allPayers = expenses.flatMap(e => getExpensePayers(e.id));
        const simplify = group.simplify_debts !== 0;
        const groupDebts = calculateGroupBalances(expenses, splits, settlements, allPayers, simplify);

        const getName = (phone: string) =>
          members.find(m => m.phone_number === phone)?.display_name || phone;

        for (const d of groupDebts) {
          if (d.from === user.phone_number || d.to === user.phone_number) {
            const iOwe = d.from === user.phone_number;
            if (!groupMap[group.name]) groupMap[group.name] = [];
            groupMap[group.name].push({
              ...d,
              fromName: d.from === user.phone_number ? 'You' : getName(d.from),
              toName: d.to === user.phone_number ? 'You' : getName(d.to),
              groupName: group.name,
              iOwe,
            });
            net += iOwe ? -d.amount : d.amount;
          }
        }
      }

      setNetBalance(net);
      setSections(
        Object.entries(groupMap).map(([title, data]) => ({title, data})),
      );
    }, []),
  );

  const styles = makeStyles(colors);
  const hasDebts = sections.some(s => s.data.length > 0);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>All Balances</Text>

      {!hasDebts ? (
        <View style={styles.emptyState}>
          <Icon name="check-circle-outline" size={64} color={colors.positive} />
          <Text style={styles.emptyText}>All settled up!</Text>
          <Text style={styles.emptyHint}>No outstanding balances</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item, i) => `${item.from}-${item.to}-${i}`}
          ListHeaderComponent={
            netBalance !== 0 ? (
              <View style={[styles.netCard, {backgroundColor: (netBalance > 0 ? colors.positive : colors.negative) + '10', borderColor: (netBalance > 0 ? colors.positive : colors.negative) + '30'}]}>
                <Text style={{fontSize: 13, fontWeight: '600', color: netBalance > 0 ? colors.positive : colors.negative}}>
                  {netBalance > 0 ? `Overall, you are owed ${formatCurrency(netBalance, getDefaultCurrency())}` : `Overall, you owe ${formatCurrency(Math.abs(netBalance), getDefaultCurrency())}`}
                </Text>
              </View>
            ) : null
          }
          renderSectionHeader={({section: {title}}) => (
            <SectionHeader title={title} />
          )}
          renderItem={({item}) => {
            const amtColor = item.iOwe ? colors.negative : colors.positive;
            const otherName = item.iOwe ? item.toName : item.fromName;
            return (
              <View style={styles.debtRow}>
                <View style={{marginRight: spacing.md}}>
                  <AppAvatar name={otherName} size="sm" />
                </View>
                <View style={{flex: 1}}>
                  <Text style={styles.debtText}>
                    {item.iOwe ? `You owe ${otherName}` : `${otherName} owes you`}
                  </Text>
                </View>
                <Icon name="arrow-right" size={14} color={colors.textMuted} style={{marginHorizontal: spacing.sm}} />
                <Text style={[styles.debtAmount, {color: amtColor}]}>
                  {formatCurrency(item.amount, getDefaultCurrency())}
                </Text>
              </View>
            );
          }}
          contentContainerStyle={{paddingBottom: 80}}
          stickySectionHeadersEnabled={false}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
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
    netCard: {
      borderWidth: 1,
      borderRadius: 10,
      padding: spacing.base,
      marginBottom: spacing.md,
      alignItems: 'center',
    },
    debtRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    debtText: {
      fontSize: fonts.sizes.base,
      fontWeight: fonts.weights.medium,
      color: colors.text,
    },
    debtAmount: {
      fontSize: fonts.sizes.md,
      fontWeight: fonts.weights.bold,
    },
    emptyState: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      gap: spacing.sm,
    },
    emptyText: {
      fontSize: fonts.sizes.md,
      color: colors.textMuted,
    },
    emptyHint: {
      fontSize: fonts.sizes.base,
      color: colors.textMuted,
    },
  });
