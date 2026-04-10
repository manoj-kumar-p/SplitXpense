import React, {useCallback, useState} from 'react';
import {View, Text, FlatList, TouchableOpacity, StyleSheet, Platform, StatusBar, LayoutAnimation, RefreshControl} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useTheme} from '../theme';
import {useAlert} from '../components/ThemedAlert';
import {EmptyState, FadeInView, AppAvatar} from '../components/ui';
import {fonts} from '../theme/fonts';
import {spacing} from '../theme/spacing';
import {getLocalUser} from '../db/queries/userQueries';
import {getAllGroups, getGroupMembers} from '../db/queries/groupQueries';
import {getGroupExpenses, getExpenseSplits, getExpensePayers} from '../db/queries/expenseQueries';
import {getGroupSettlements, createSettlement} from '../db/queries/settlementQueries';
import {getDefaultCurrency} from '../db/queries/settingsQueries';
import {calculateGroupBalances} from '../utils/balance';
import {formatCurrency, toPaisa} from '../utils/currency';
import {triggerAutoSmsSync} from '../sync/AutoSmsSync';
import {generateHlcTimestamp} from '../sync/syncLogger';
import type {Debt} from '../utils/balance';

interface GroupDebt {
  groupId: string;
  groupName: string;
  amount: number; // positive = they owe you, negative = you owe them
}

interface FriendBalance {
  phone: string;
  name: string;
  totalAmount: number; // positive = they owe you, negative = you owe them
  groups: GroupDebt[];
}

export default function FriendsScreen() {
  const {colors} = useTheme();
  const {showAlert} = useAlert();
  const [friends, setFriends] = useState<FriendBalance[]>([]);
  const [expandedFriend, setExpandedFriend] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useFocusEffect(
    useCallback(() => {
      const user = getLocalUser();
      if (!user) return;

      const myPhone = user.phone_number;
      const groups = getAllGroups();
      const friendMap: Record<string, FriendBalance> = {};

      for (const group of groups) {
        const members = getGroupMembers(group.id);
        const expenses = getGroupExpenses(group.id);
        const splits = expenses.flatMap(e => getExpenseSplits(e.id));
        const settlements = getGroupSettlements(group.id);
        const allPayers = expenses.flatMap(e => getExpensePayers(e.id));
        const debts = calculateGroupBalances(expenses, splits, settlements, allPayers);

        const getName = (phone: string) =>
          members.find(m => m.phone_number === phone)?.display_name || phone;

        for (const debt of debts) {
          let friendPhone: string;
          let amount: number;

          if (debt.from === myPhone) {
            // I owe them
            friendPhone = debt.to;
            amount = -debt.amount;
          } else if (debt.to === myPhone) {
            // They owe me
            friendPhone = debt.from;
            amount = debt.amount;
          } else {
            continue;
          }

          if (!friendMap[friendPhone]) {
            friendMap[friendPhone] = {
              phone: friendPhone,
              name: getName(friendPhone),
              totalAmount: 0,
              groups: [],
            };
          }

          friendMap[friendPhone].totalAmount += amount;
          friendMap[friendPhone].groups.push({
            groupId: group.id,
            groupName: group.name,
            amount,
          });
        }
      }

      // Sort: largest amounts first
      const sorted = Object.values(friendMap).sort(
        (a, b) => Math.abs(b.totalAmount) - Math.abs(a.totalAmount),
      );
      setFriends(sorted);
    }, [refreshKey]),
  );

  const toggleExpand = (phone: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedFriend(prev => (prev === phone ? null : phone));
  };

  const handleSettleGroup = (friendPhone: string, friendName: string, groupId: string, groupName: string, amount: number) => {
    const user = getLocalUser();
    if (!user) return;
    const absAmount = Math.abs(amount);

    const paidBy = amount < 0 ? user.phone_number : friendPhone;
    const paidTo = amount < 0 ? friendPhone : user.phone_number;
    const displayPayer = amount < 0 ? 'You' : friendName;
    const displayPayee = amount < 0 ? friendName : 'You';

    showAlert({
      title: 'Settle Up',
      message: `Record ${displayPayer} paying ${formatCurrency(absAmount, getDefaultCurrency())} to ${displayPayee} in "${groupName}"?`,
      buttons: [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Settle',
          onPress: () => {
            const now = generateHlcTimestamp();
            createSettlement(groupId, paidBy, paidTo, absAmount, getDefaultCurrency(), new Date().toISOString(), now);
            triggerAutoSmsSync(groupId);
            setRefreshKey(k => k + 1);
          },
        },
      ],
    });
  };

  const styles = makeStyles(colors);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Friends</Text>

      {friends.length === 0 ? (
        <EmptyState icon="account-multiple-outline" title="No balances with friends" subtitle="Add expenses in a group to see balances here" />
      ) : (
        <FlatList
          data={friends}
          keyExtractor={item => item.phone}
          contentContainerStyle={{paddingBottom: 80}}
          refreshControl={<RefreshControl refreshing={false} onRefresh={() => setRefreshKey(k => k + 1)} tintColor={colors.text} />}
          ListHeaderComponent={(() => {
            const overallNet = friends.reduce((sum, f) => sum + f.totalAmount, 0);
            if (overallNet === 0) return null;
            const isPositive = overallNet > 0;
            const tintColor = isPositive ? colors.positive : colors.negative;
            return (
              <View style={[styles.netBanner, {backgroundColor: tintColor + '10', borderColor: tintColor + '30'}]}>
                <Text style={{fontSize: 13, color: tintColor, fontWeight: '600'}}>
                  {isPositive ? `Overall, you are owed ${formatCurrency(overallNet, getDefaultCurrency())}` : `Overall, you owe ${formatCurrency(Math.abs(overallNet), getDefaultCurrency())}`}
                </Text>
              </View>
            );
          })()}
          renderItem={({item, index}) => {
            const isExpanded = expandedFriend === item.phone;
            const owesYou = item.totalAmount > 0;

            return (
              <FadeInView index={index}>
              <TouchableOpacity
                style={styles.friendCard}
                onPress={() => toggleExpand(item.phone)}
                activeOpacity={0.7}>
                <View style={styles.friendHeader}>
                  <View style={{marginRight: spacing.md}}>
                    <AppAvatar name={item.name} size="md" />
                  </View>
                  <View style={styles.friendInfo}>
                    <Text style={styles.friendName}>{item.name}</Text>
                    <Text
                      style={[
                        styles.friendAmount,
                        owesYou ? styles.positive : styles.negative,
                      ]}>
                      {owesYou
                        ? `owes you ${formatCurrency(item.totalAmount, getDefaultCurrency())}`
                        : `you owe ${formatCurrency(Math.abs(item.totalAmount), getDefaultCurrency())}`}
                    </Text>
                  </View>
                  <Icon name={isExpanded ? 'chevron-up' : 'chevron-down'} size={22} color={colors.textMuted} />
                </View>

                {isExpanded && (
                  <View style={styles.groupBreakdown}>
                    {item.groups.map(g => (
                      <View key={g.groupId} style={styles.groupRow}>
                        <View style={{flex: 1}}>
                          <Text style={styles.groupName}>{g.groupName}</Text>
                          <Text
                            style={[
                              styles.groupAmount,
                              g.amount > 0 ? styles.positive : styles.negative,
                            ]}>
                            {g.amount > 0
                              ? `owes you ${formatCurrency(g.amount, getDefaultCurrency())}`
                              : `you owe ${formatCurrency(Math.abs(g.amount), getDefaultCurrency())}`}
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={styles.settleBtn}
                          onPress={() => handleSettleGroup(item.phone, item.name, g.groupId, g.groupName, g.amount)}>
                          <Icon name="handshake-outline" size={14} color={colors.primary} />
                          <Text style={[styles.settleBtnText, {color: colors.primary}]}>Settle</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}
              </TouchableOpacity>
              </FadeInView>
            );
          }}
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
      paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + spacing.sm : spacing.sm,
    },
    title: {
      fontSize: fonts.sizes.xl,
      fontWeight: fonts.weights.bold,
      color: colors.text,
      marginBottom: spacing.base,
      marginTop: spacing.sm,
    },
    netBanner: {
      borderWidth: 1,
      borderRadius: 10,
      padding: spacing.base,
      marginBottom: spacing.md,
      alignItems: 'center',
    },
    friendCard: {
      backgroundColor: colors.card,
      borderRadius: 10,
      marginBottom: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    friendHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: spacing.base,
    },
    friendInfo: {
      flex: 1,
    },
    friendName: {
      fontSize: fonts.sizes.md,
      fontWeight: fonts.weights.semibold,
      color: colors.text,
    },
    friendAmount: {
      fontSize: fonts.sizes.base,
      marginTop: 2,
    },
    positive: {
      color: colors.positive,
    },
    negative: {
      color: colors.negative,
    },
    expandIcon: {
      fontSize: fonts.sizes.xl,
      color: colors.textMuted,
      paddingHorizontal: spacing.sm,
    },
    groupBreakdown: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingHorizontal: spacing.base,
      paddingVertical: spacing.sm,
    },
    groupRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: spacing.xs,
    },
    groupName: {
      fontSize: fonts.sizes.sm,
      color: colors.textSecondary,
    },
    groupAmount: {
      fontSize: fonts.sizes.sm,
      fontWeight: fonts.weights.medium,
    },
    settleBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.primary,
    },
    settleBtnText: {
      fontSize: fonts.sizes.xs,
      fontWeight: fonts.weights.semibold,
    },
  });
