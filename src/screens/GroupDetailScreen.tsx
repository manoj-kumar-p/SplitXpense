import React, {useCallback, useState, useEffect, useRef} from 'react';
import {View, Text, FlatList, TouchableOpacity, StyleSheet, Linking} from 'react-native';
import {useFocusEffect, useNavigation, useRoute} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import type {RouteProp} from '@react-navigation/native';
import {useTheme} from '../theme';
import {useAlert} from '../components/ThemedAlert';
import {fonts} from '../theme/fonts';
import {spacing} from '../theme/spacing';
import {getGroup, getGroupMembers, removeGroupMember, updateGroupSimplifyDebts, deleteGroup, voteDeleteGroup, clearDeleteVotes} from '../db/queries/groupQueries';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {getGroupExpenses, getExpenseSplits, getExpensePayers} from '../db/queries/expenseQueries';
import {getGroupSettlements, deleteSettlement} from '../db/queries/settlementQueries';
import {calculateGroupBalances, getNetBalance} from '../utils/balance';
import {formatCurrency} from '../utils/currency';
import dayjs from 'dayjs';
import type {Group, GroupMember} from '../models/Group';
import type {Expense} from '../models/Expense';
import type {Settlement} from '../models/Settlement';
import type {Debt} from '../utils/balance';
import {getLocalUser} from '../db/queries/userQueries';
import {getCategoryByKey} from '../utils/expenseCategories';
import {triggerAutoSmsSync} from '../sync/AutoSmsSync';
import {EmptyState, AppButton} from '../components/ui';
import type {GroupsStackParamList} from '../types/navigation';

interface ActivityItem {
  id: string;
  type: 'expense' | 'settlement';
  date: string;
  data: Expense | Settlement;
}

type Nav = NativeStackNavigationProp<GroupsStackParamList, 'GroupDetail'>;
type Route = RouteProp<GroupsStackParamList, 'GroupDetail'>;

export default function GroupDetailScreen() {
  const {colors} = useTheme();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const {showAlert} = useAlert();
  const {groupId} = route.params;

  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [activityItems, setActivityItems] = useState<ActivityItem[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [tab, setTab] = useState<'expenses' | 'balances' | 'members'>('expenses');
  const [showOlderExpenses, setShowOlderExpenses] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useFocusEffect(
    useCallback(() => {
      const g = getGroup(groupId);
      setGroup(g);
      if (!g) return;

      const m = getGroupMembers(groupId);
      setMembers(m);

      const exp = getGroupExpenses(groupId);
      setExpenses(exp);

      const sett = getGroupSettlements(groupId);
      setSettlements(sett);

      // Combine expenses and settlements into activity feed
      const items: ActivityItem[] = [
        ...exp.map(e => ({
          id: e.id,
          type: 'expense' as const,
          date: e.expense_date || e.created_at,
          data: e,
        })),
        ...sett.map(s => ({
          id: s.id,
          type: 'settlement' as const,
          date: s.settled_at || s.created_at,
          data: s,
        })),
      ];
      items.sort((a, b) => b.date.localeCompare(a.date));
      setActivityItems(items);

      const splits = exp.flatMap(e => getExpenseSplits(e.id));
      const allPayers = exp.flatMap(e => getExpensePayers(e.id));
      const simplify = g.simplify_debts !== 0;
      setDebts(calculateGroupBalances(exp, splits, sett, allPayers, simplify));
    }, [groupId, refreshKey]),
  );

  const styles = makeStyles(colors);

  if (!group) {
    return (
      <View style={styles.container}>
        <Text style={styles.emptyText}>Group not found</Text>
      </View>
    );
  }

  const getMemberName = (phone: string) =>
    members.find(m => m.phone_number === phone)?.display_name || phone;

  const handleDeleteMember = (member: GroupMember) => {
    const user = getLocalUser();
    if (member.phone_number === user?.phone_number) {
      showAlert({title: 'Cannot Remove', message: 'You cannot remove yourself from the group.'});
      return;
    }
    showAlert({
      title: 'Remove Member',
      message: `Remove ${member.display_name} from this group?`,
      buttons: [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            const now = Date.now().toString();
            removeGroupMember(groupId, member.phone_number, now);
            setMembers(prev => prev.filter(m => m.phone_number !== member.phone_number));
          },
        },
      ],
    });
  };

  const handleLeaveGroup = () => {
    const user = getLocalUser();
    if (!user) return;
    showAlert({
      title: 'Leave Group',
      message: `Are you sure you want to leave "${group.name}"? You won't be able to see this group's expenses anymore.`,
      icon: 'exit-run',
      buttons: [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Leave',
          style: 'destructive',
          onPress: () => {
            const now = Date.now().toString();
            removeGroupMember(groupId, user.phone_number, now);
            navigation.goBack();
          },
        },
      ],
    });
  };

  const handleDeleteGroup = () => {
    const user = getLocalUser();
    if (!user || !group) return;
    const activeMembers = members.filter(m => m.is_deleted === 0);
    const currentVotes = (group.delete_votes || '').split(',').filter((v: string) => v);
    const alreadyVoted = currentVotes.includes(user.phone_number);
    const votesNeeded = activeMembers.length;
    const votesAfter = alreadyVoted ? currentVotes.length : currentVotes.length + 1;

    if (activeMembers.length <= 1) {
      // Solo group - can delete directly
      showAlert({
        title: 'Delete Group',
        message: `Are you sure you want to delete "${group.name}"? All expenses and settlements will be removed.`,
        icon: 'trash-can-outline',
        buttons: [
          {text: 'Cancel', style: 'cancel'},
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => {
              const now = Date.now().toString();
              deleteGroup(groupId, now);
              triggerAutoSmsSync(groupId);
              navigation.goBack();
            },
          },
        ],
      });
    } else if (votesAfter >= votesNeeded) {
      // This vote completes consensus
      showAlert({
        title: 'Delete Group',
        message: `All ${votesNeeded} members have agreed to delete "${group.name}". This will permanently remove the group and all its data.`,
        icon: 'trash-can-outline',
        buttons: [
          {text: 'Cancel', style: 'cancel'},
          {
            text: 'Delete Now',
            style: 'destructive',
            onPress: () => {
              const now = Date.now().toString();
              if (!alreadyVoted) voteDeleteGroup(groupId, user.phone_number, now);
              deleteGroup(groupId, now);
              triggerAutoSmsSync(groupId);
              navigation.goBack();
            },
          },
        ],
      });
    } else {
      // Need more votes
      const othersVoted = currentVotes.filter(v => v !== user.phone_number);
      const othersVotedNames = othersVoted.map(phone => {
        const m = members.find(mem => mem.phone_number === phone);
        return m ? m.display_name : phone;
      });
      const remaining = votesNeeded - votesAfter;

      if (alreadyVoted) {
        showAlert({
          title: 'Waiting for Others',
          message: `You've already voted to delete this group. ${remaining} more member${remaining > 1 ? 's' : ''} need${remaining === 1 ? 's' : ''} to agree before it can be deleted.${othersVotedNames.length > 0 ? `\n\nAlso voted: ${othersVotedNames.join(', ')}` : ''}`,
          icon: 'clock-outline',
          buttons: [
            {text: 'OK'},
            {
              text: 'Cancel Vote',
              style: 'destructive',
              onPress: () => {
                const now = Date.now().toString();
                clearDeleteVotes(groupId, now);
                triggerAutoSmsSync(groupId);
                // Refresh
                const g = getGroup(groupId);
                if (g) setGroup(g);
              },
            },
          ],
        });
      } else {
        showAlert({
          title: 'Vote to Delete',
          message: `Deleting "${group.name}" requires all ${votesNeeded} members to agree. ${currentVotes.length} of ${votesNeeded} have voted so far.\n\nVote to delete this group?`,
          icon: 'vote-outline',
          buttons: [
            {text: 'Cancel', style: 'cancel'},
            {
              text: 'Vote to Delete',
              style: 'destructive',
              onPress: () => {
                const now = Date.now().toString();
                voteDeleteGroup(groupId, user.phone_number, now);
                triggerAutoSmsSync(groupId);
                // Refresh
                const g = getGroup(groupId);
                if (g) setGroup(g);
                showAlert({
                  title: 'Vote Recorded',
                  message: `Your vote has been recorded. ${remaining} more member${remaining > 1 ? 's' : ''} need${remaining === 1 ? 's' : ''} to agree before the group can be deleted.`,
                  icon: 'check-circle-outline',
                });
              },
            },
          ],
        });
      }
    }
  };

  const handleDeleteSettlement = (settlement: Settlement) => {
    showAlert({
      title: 'Delete Settlement',
      message: `Delete this settlement of ${formatCurrency(settlement.amount, settlement.currency)} between ${getMemberName(settlement.paid_by)} and ${getMemberName(settlement.paid_to)}?`,
      icon: 'trash-can-outline',
      buttons: [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            const now = Date.now().toString();
            deleteSettlement(settlement.id, now);
            triggerAutoSmsSync(groupId);
            setRefreshKey(k => k + 1);
          },
        },
      ],
    });
  };

  const user = getLocalUser();
  const netBal = user ? getNetBalance(user.phone_number, debts) : 0;
  const totalSpent = expenses.reduce((sum, e) => sum + e.amount, 0);

  return (
    <View style={styles.container}>
      {/* Rich header */}
      <View style={styles.headerCard}>
        <View style={styles.headerRow}>
          <View style={[styles.headerIcon, {backgroundColor: colors.surfaceElevated}]}>
            {group.icon ? (
              <Text style={{fontSize: 24}}>{group.icon}</Text>
            ) : (
              <Icon name="account-group-outline" size={24} color={colors.text} />
            )}
          </View>
          <View style={{flex: 1}}>
            <Text style={styles.groupName}>{group.name}</Text>
            <Text style={styles.headerMeta}>
              {members.filter(m => m.is_deleted === 0).length} members · Total {formatCurrency(totalSpent)}
            </Text>
          </View>
        </View>
        {netBal !== 0 && (
          <View style={[styles.headerBadge, {backgroundColor: (netBal > 0 ? colors.positive : colors.negative) + '12'}]}>
            <Text style={{fontSize: 13, fontWeight: '600', color: netBal > 0 ? colors.positive : colors.negative}}>
              {netBal > 0 ? `You're owed ${formatCurrency(netBal)}` : `You owe ${formatCurrency(Math.abs(netBal))}`}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.tabBar}>
        {(['expenses', 'balances', 'members'] as const).map(t => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, tab === t && styles.tabActive]}
            onPress={() => setTab(t)}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'expenses' && (
        <View style={{flex: 1}}>
          {debts.length === 0 && activityItems.length > 0 && (
            <View style={[styles.settledBanner, {backgroundColor: colors.positive + '10', borderColor: colors.positive + '30'}]}>
              <Icon name="check-circle-outline" size={24} color={colors.positive} />
              <Text style={[styles.settledText, {color: colors.positive}]}>All settled up!</Text>
              <TouchableOpacity onPress={() => setShowOlderExpenses(!showOlderExpenses)}>
                <Text style={[styles.settledLink, {color: colors.textMuted}]}>
                  {showOlderExpenses ? 'Hide expenses' : 'View expenses'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
          {(debts.length > 0 || showOlderExpenses || activityItems.length === 0) && (
            <FlatList
              style={{flex: 1}}
              contentContainerStyle={{paddingBottom: spacing['3xl']}}
              data={activityItems}
              keyExtractor={item => item.id}
              ListEmptyComponent={
                <EmptyState icon="receipt" title="No expenses yet" subtitle="Tap + to add your first expense" />
              }
              renderItem={({item}) => {
                if (item.type === 'settlement') {
                  const s = item.data as Settlement;
                  return (
                    <TouchableOpacity
                      style={styles.row}
                      activeOpacity={0.7}
                      onLongPress={() => handleDeleteSettlement(s)}>
                      <View style={[styles.activityIcon, {backgroundColor: colors.positive + '15'}]}>
                        <Icon name="handshake-outline" size={16} color={colors.positive} />
                      </View>
                      <View style={styles.rowLeft}>
                        <Text style={styles.rowTitle}>{getMemberName(s.paid_by)} paid {getMemberName(s.paid_to)}</Text>
                        <Text style={styles.rowSub}>Settlement · {dayjs(s.settled_at || s.created_at).format('D MMM YYYY')}</Text>
                      </View>
                      <Text style={[styles.rowAmount, {color: colors.positive}]}>
                        {formatCurrency(s.amount, s.currency)}
                      </Text>
                    </TouchableOpacity>
                  );
                }
                const e = item.data as Expense;
                return (
                  <TouchableOpacity
                    style={styles.row}
                    onPress={() => navigation.navigate('ExpenseDetail', {expenseId: e.id, groupId})}>
                    <View style={[styles.activityIcon, {backgroundColor: colors.surfaceElevated}]}>
                      <Icon name={getCategoryByKey(e.category || 'general').icon} size={16} color={colors.text} />
                    </View>
                    <View style={styles.rowLeft}>
                      <Text style={styles.rowTitle}>{e.description}</Text>
                      <Text style={styles.rowSub}>Paid by {getMemberName(e.paid_by)} · {dayjs(e.expense_date || e.created_at).format('D MMM YYYY')}</Text>
                    </View>
                    <Text style={styles.rowAmount}>{formatCurrency(e.amount, e.currency)}</Text>
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </View>
      )}

      {tab === 'balances' && (
        <View style={styles.balancesContainer}>
          {/* Simplify debts toggle */}
          <TouchableOpacity
            style={styles.simplifyRow}
            onPress={() => {
              const newVal = group.simplify_debts === 0;
              const now = Date.now().toString();
              updateGroupSimplifyDebts(groupId, newVal, now);
              setGroup(prev => prev ? {...prev, simplify_debts: newVal ? 1 : 0} : prev);
              // Recalculate
              const splits = expenses.flatMap(e => getExpenseSplits(e.id));
              const allPayers = expenses.flatMap(e => getExpensePayers(e.id));
              setDebts(calculateGroupBalances(expenses, splits, settlements, allPayers, newVal));
            }}>
            <Icon
              name={group.simplify_debts !== 0 ? 'checkbox-marked' : 'checkbox-blank-outline'}
              size={22}
              color={group.simplify_debts !== 0 ? colors.primary : colors.textMuted}
            />
            <View style={{flex: 1, marginLeft: spacing.sm}}>
              <Text style={[styles.rowTitle, {fontSize: fonts.sizes.base}]}>Simplify debts</Text>
              <Text style={[styles.rowSub, {marginTop: 2}]}>
                {group.simplify_debts !== 0
                  ? 'Combines debts to reduce repayments'
                  : 'Showing individual debts'}
              </Text>
            </View>
          </TouchableOpacity>

          {debts.length === 0 ? (
            <Text style={styles.emptyText}>All settled up!</Text>
          ) : (
            debts.map((debt, i) => (
              <View key={i} style={styles.row}>
                <Text style={styles.rowTitle}>
                  {getMemberName(debt.from)} owes {getMemberName(debt.to)}
                </Text>
                <Text style={styles.rowAmount}>{formatCurrency(debt.amount)}</Text>
              </View>
            ))
          )}
          <TouchableOpacity
            style={styles.settleButton}
            onPress={() => navigation.navigate('SettleUp', {groupId})}>
            <Text style={styles.settleButtonText}>Settle Up</Text>
          </TouchableOpacity>
        </View>
      )}

      {tab === 'members' && (
        <View style={{flex: 1}}>
          <FlatList
            style={{flex: 1}}
            contentContainerStyle={{paddingBottom: spacing['3xl']}}
            data={members}
            keyExtractor={item => item.id}
            ListFooterComponent={
              <View>
                <TouchableOpacity
                  style={styles.inviteButton}
                  onPress={() => {
                    const user = getLocalUser();
                    const msg = `Hey! I added you to "${group.name}" on SplitXpense. Download the app to track shared expenses locally — no internet needed! - ${user?.display_name}`;
                    const phones = members
                      .filter(m => m.phone_number !== user?.phone_number)
                      .map(m => m.phone_number)
                      .join(',');
                    if (phones) {
                      Linking.openURL(`sms:${phones}?body=${encodeURIComponent(msg)}`);
                    }
                  }}>
                  <Text style={styles.inviteButtonText}>Invite members via SMS</Text>
                </TouchableOpacity>

                {/* Pending deletion banner */}
                {group.delete_votes && group.delete_votes.length > 0 && (() => {
                  const votes = group.delete_votes.split(',').filter((v: string) => v);
                  const activeCount = members.filter(m => m.is_deleted === 0).length;
                  const user = getLocalUser();
                  const myVoted = user ? votes.includes(user.phone_number) : false;
                  const voterNames = votes.map(phone => {
                    const m = members.find(mem => mem.phone_number === phone);
                    return m ? m.display_name : phone;
                  }).join(', ');
                  return (
                    <View style={[styles.deleteBanner, {backgroundColor: colors.negative + '12', borderColor: colors.negative + '30'}]}>
                      <Icon name="alert-circle-outline" size={18} color={colors.negative} />
                      <View style={{flex: 1, marginLeft: spacing.sm}}>
                        <Text style={[styles.deleteBannerTitle, {color: colors.negative}]}>
                          Deletion Requested
                        </Text>
                        <Text style={[styles.deleteBannerText, {color: colors.text}]}>
                          {votes.length} of {activeCount} members voted: {voterNames}
                        </Text>
                        {!myVoted && (
                          <TouchableOpacity
                            style={[styles.voteBtn, {borderColor: colors.negative}]}
                            onPress={handleDeleteGroup}>
                            <Text style={{color: colors.negative, fontSize: 12, fontWeight: '600'}}>
                              Vote to Delete
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  );
                })()}

                <AppButton title="Leave Group" onPress={handleLeaveGroup} variant="danger" icon="exit-run" style={{marginHorizontal: spacing.base, marginTop: spacing.sm}} />

                <AppButton title="Delete Group" onPress={handleDeleteGroup} variant="danger" icon="trash-can-outline" style={{marginHorizontal: spacing.base, marginTop: spacing.sm}} />

                <View style={{height: spacing['2xl']}} />
              </View>
            }
            renderItem={({item}) => {
              const isMe = item.phone_number === getLocalUser()?.phone_number;
              return (
                <View style={styles.row}>
                  <View style={{flex: 1}}>
                    <Text style={styles.rowTitle}>
                      {item.display_name}{isMe ? ' (You)' : ''}
                    </Text>
                    <Text style={styles.rowSub}>{item.phone_number}</Text>
                  </View>
                  {!isMe && (
                    <TouchableOpacity
                      onPress={() => handleDeleteMember(item)}
                      hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
                      <Text style={styles.removeText}>Remove</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            }}
          />
        </View>
      )}

      {/* FAB - fixed at bottom-right, outside tab content */}
      {tab === 'expenses' && (
        <View style={styles.fabRow}>
          <TouchableOpacity
            style={styles.fab}
            onPress={() => navigation.navigate('AddExpense', {groupId})}>
            <Icon name="plus" size={28} color={colors.background} />
          </TouchableOpacity>
        </View>
      )}
      {tab === 'members' && (
        <View style={styles.fabRow}>
          <TouchableOpacity
            style={styles.fab}
            onPress={() => navigation.navigate('AddMember', {groupId})}>
            <Icon name="plus" size={28} color={colors.background} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const makeStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    headerCard: {
      padding: spacing.base,
      paddingBottom: spacing.sm,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    headerIcon: {
      width: 48,
      height: 48,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: spacing.md,
    },
    headerMeta: {
      fontSize: fonts.sizes.sm,
      color: colors.textMuted,
      marginTop: 2,
    },
    headerBadge: {
      alignSelf: 'flex-start',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: 16,
      marginTop: spacing.sm,
      marginLeft: 48 + spacing.md,
    },
    groupName: {
      fontSize: fonts.sizes.xl,
      fontWeight: fonts.weights.bold,
      color: colors.text,
    },
    tabBar: {
      flexDirection: 'row',
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      marginTop: spacing.md,
    },
    tab: {
      flex: 1,
      paddingVertical: spacing.md,
      alignItems: 'center',
    },
    tabActive: {
      borderBottomWidth: 2,
      borderBottomColor: colors.primary,
    },
    tabText: {
      fontSize: fonts.sizes.base,
      color: colors.textMuted,
      fontWeight: fonts.weights.medium,
    },
    tabTextActive: {
      color: colors.text,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.base,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    rowLeft: {
      flex: 1,
    },
    rowTitle: {
      fontSize: fonts.sizes.base,
      fontWeight: fonts.weights.medium,
      color: colors.text,
    },
    rowSub: {
      fontSize: fonts.sizes.sm,
      color: colors.textMuted,
      marginTop: 2,
    },
    rowAmount: {
      fontSize: fonts.sizes.base,
      fontWeight: fonts.weights.semibold,
      color: colors.text,
    },
    emptyText: {
      fontSize: fonts.sizes.base,
      color: colors.textMuted,
      textAlign: 'center',
    },
    balancesContainer: {
      flex: 1,
    },
    inviteButton: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      padding: spacing.base,
      margin: spacing.base,
      alignItems: 'center',
    },
    inviteButtonText: {
      fontSize: fonts.sizes.base,
      fontWeight: fonts.weights.medium,
      color: colors.text,
    },
    deleteBanner: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      borderWidth: 1,
      borderRadius: 10,
      padding: spacing.base,
      marginHorizontal: spacing.base,
      marginTop: spacing.md,
    },
    deleteBannerTitle: {
      fontSize: fonts.sizes.sm,
      fontWeight: fonts.weights.semibold,
      marginBottom: 2,
    },
    deleteBannerText: {
      fontSize: fonts.sizes.xs,
      opacity: 0.7,
    },
    voteBtn: {
      borderWidth: 1,
      borderRadius: 6,
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.md,
      marginTop: spacing.sm,
      alignSelf: 'flex-start',
    },
    simplifyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.base,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    settleButton: {
      backgroundColor: colors.primary,
      borderRadius: 8,
      padding: spacing.base,
      margin: spacing.base,
      alignItems: 'center',
    },
    settleButtonText: {
      fontSize: fonts.sizes.md,
      fontWeight: fonts.weights.semibold,
      color: colors.textInverse,
    },
    settledBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.md,
      gap: spacing.sm,
      borderWidth: 1,
      borderRadius: 10,
      marginHorizontal: spacing.base,
      marginVertical: spacing.sm,
    },
    settledText: {
      fontSize: fonts.sizes.base,
      fontWeight: '600',
    },
    settledLink: {
      fontSize: fonts.sizes.sm,
      textDecorationLine: 'underline',
      marginTop: spacing.xs,
    },
    activityIcon: {
      width: 32,
      height: 32,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: spacing.md,
    },
    removeText: {
      fontSize: fonts.sizes.sm,
      color: colors.negative,
      fontWeight: '500',
    },
    fabRow: {
      position: 'absolute',
      bottom: spacing.base,
      right: spacing.base,
    },
    fab: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.text,
      alignItems: 'center',
      justifyContent: 'center',
      elevation: 6,
      shadowColor: '#000',
      shadowOffset: {width: 0, height: 3},
      shadowOpacity: 0.2,
      shadowRadius: 4,
    },
    fabText: {
      fontSize: fonts.sizes['2xl'],
      color: colors.textInverse,
      fontWeight: fonts.weights.light,
    },
  });
