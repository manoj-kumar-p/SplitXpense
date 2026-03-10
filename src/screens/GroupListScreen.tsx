import React, {useCallback, useState} from 'react';
import {View, Text, FlatList, TouchableOpacity, StyleSheet, Platform, StatusBar, RefreshControl} from 'react-native';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useTheme} from '../theme';
import {EmptyState, FadeInView} from '../components/ui';
import {fonts} from '../theme/fonts';
import {spacing} from '../theme/spacing';
import {getAllGroups, getGroupMembers} from '../db/queries/groupQueries';
import {getGroupExpenses, getExpenseSplits, getExpensePayers} from '../db/queries/expenseQueries';
import {getGroupSettlements} from '../db/queries/settlementQueries';
import {calculateGroupBalances, getNetBalance} from '../utils/balance';
import {getLocalUser} from '../db/queries/userQueries';
import {formatCurrency} from '../utils/currency';
import type {Group} from '../models/Group';
import type {GroupsStackParamList} from '../types/navigation';

type Nav = NativeStackNavigationProp<GroupsStackParamList, 'GroupList'>;

export default function GroupListScreen() {
  const {colors} = useTheme();
  const navigation = useNavigation<Nav>();
  const [groups, setGroups] = useState<Array<Group & {memberCount: number; netBalance: number}>>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useFocusEffect(
    useCallback(() => {
      const user = getLocalUser();
      const all = getAllGroups();
      const withData = all.map(g => {
        const members = getGroupMembers(g.id);
        const expenses = getGroupExpenses(g.id);
        const splits = expenses.flatMap(e => getExpenseSplits(e.id));
        const settlements = getGroupSettlements(g.id);
        const allPayers = expenses.flatMap(e => getExpensePayers(e.id));
        const debts = calculateGroupBalances(expenses, splits, settlements, allPayers, g.simplify_debts !== 0);
        const net = user ? getNetBalance(user.phone_number, debts) : 0;
        return {...g, memberCount: members.length, netBalance: net};
      });
      setGroups(withData);
      setRefreshing(false);
    }, [refreshKey]),
  );

  const styles = makeStyles(colors);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Groups</Text>
      <FlatList
        data={groups}
        keyExtractor={item => item.id}
        contentContainerStyle={groups.length === 0 ? styles.emptyContainer : {paddingBottom: spacing['3xl']}}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); setRefreshKey(k => k + 1); }} tintColor={colors.text} />}
        ListEmptyComponent={
          <EmptyState
            icon="account-group-outline"
            title="No groups yet"
            subtitle="Create a group to start splitting expenses"
            ctaLabel="Create Group"
            onCtaPress={() => navigation.navigate('AddGroup')}
          />
        }
        renderItem={({item, index}) => (
          <FadeInView index={index}>
            <TouchableOpacity
              style={styles.groupCard}
              activeOpacity={0.7}
              onPress={() => navigation.navigate('GroupDetail', {groupId: item.id})}>
              <View style={styles.cardRow}>
                <View style={[styles.groupIconWrap, {backgroundColor: colors.surfaceElevated}]}>
                  {item.icon ? (
                    <Text style={{fontSize: 20}}>{item.icon}</Text>
                  ) : (
                    <Icon name="account-group-outline" size={20} color={colors.text} />
                  )}
                </View>
                <View style={{flex: 1}}>
                  <Text style={styles.groupName}>{item.name}</Text>
                  <Text style={styles.groupMeta}>
                    {item.memberCount} member{item.memberCount !== 1 ? 's' : ''}
                  </Text>
                </View>
                <View style={{alignItems: 'flex-end'}}>
                  {item.netBalance !== 0 ? (
                    <>
                      <Text style={{fontSize: 10, color: item.netBalance > 0 ? colors.positive : colors.negative, fontWeight: '500'}}>
                        {item.netBalance > 0 ? 'owed' : 'you owe'}
                      </Text>
                      <Text style={{fontSize: 14, fontWeight: '700', color: item.netBalance > 0 ? colors.positive : colors.negative}}>
                        {formatCurrency(Math.abs(item.netBalance))}
                      </Text>
                    </>
                  ) : (
                    <Text style={{fontSize: 11, color: colors.textMuted}}>settled</Text>
                  )}
                </View>
              </View>
              {item.description ? (
                <Text style={styles.groupDesc} numberOfLines={1}>{item.description}</Text>
              ) : null}
            </TouchableOpacity>
          </FadeInView>
        )}
      />

      <TouchableOpacity
        style={styles.fab}
        activeOpacity={0.8}
        onPress={() => navigation.navigate('AddGroup')}>
        <Icon name="plus" size={28} color={colors.background} />
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + spacing.sm : spacing.sm,
    },
    title: {
      fontSize: fonts.sizes.xl,
      fontWeight: fonts.weights.bold,
      color: colors.text,
      marginBottom: spacing.sm,
      marginTop: spacing.sm,
      paddingHorizontal: spacing.base,
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
    },
    cardRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    groupIconWrap: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: spacing.md,
    },
    groupCard: {
      backgroundColor: colors.surface,
      marginHorizontal: spacing.base,
      marginTop: spacing.md,
      padding: spacing.base,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },
    groupName: {
      fontSize: fonts.sizes.md,
      fontWeight: fonts.weights.semibold,
      color: colors.text,
    },
    groupMeta: {
      fontSize: fonts.sizes.sm,
      color: colors.textMuted,
      marginTop: 2,
    },
    groupDesc: {
      fontSize: fonts.sizes.sm,
      color: colors.textSecondary,
      marginTop: spacing.sm,
      marginLeft: 40 + spacing.md,
    },
    fab: {
      position: 'absolute',
      bottom: spacing.base,
      right: spacing.base,
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
  });
