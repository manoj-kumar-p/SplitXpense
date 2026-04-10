import React, {useCallback, useState} from 'react';
import {View, Text, SectionList, TouchableOpacity, StyleSheet, Platform, StatusBar, RefreshControl} from 'react-native';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useTheme} from '../theme';
import {EmptyState, FadeInView, SectionHeader} from '../components/ui';
import {fonts} from '../theme/fonts';
import {spacing} from '../theme/spacing';
import {getLocalUser} from '../db/queries/userQueries';
import {getAllGroups, getGroupMembers} from '../db/queries/groupQueries';
import {getGroupExpenses, getExpenseSplits} from '../db/queries/expenseQueries';
import {getGroupSettlements} from '../db/queries/settlementQueries';
import {formatCurrency} from '../utils/currency';
import {getCategoryByKey} from '../utils/expenseCategories';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

interface ActivityItem {
  id: string;
  type: 'expense' | 'settlement';
  description: string;
  amount: number;
  currency: string;
  groupId: string;
  groupName: string;
  paidBy: string;
  paidByName: string;
  paidToName?: string;
  date: string;
  createdAt: string;
  category?: string;
  myShare: number;
  icon: string;
  iconColor: string;
  iconBg: string;
}

export default function ActivityScreen() {
  const {colors} = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  useFocusEffect(
    useCallback(() => {
      const user = getLocalUser();
      if (!user) return;

      const groups = getAllGroups();
      const items: ActivityItem[] = [];

      for (const group of groups) {
        const members = getGroupMembers(group.id);
        const getName = (phone: string) =>
          phone === user.phone_number
            ? 'You'
            : members.find(m => m.phone_number === phone)?.display_name || phone;

        const expenses = getGroupExpenses(group.id);
        for (const exp of expenses) {
          const cat = getCategoryByKey(exp.category || 'general');
          const expSplits = getExpenseSplits(exp.id);
          const mySplit = expSplits.find(s => s.phone_number === user.phone_number);
          items.push({
            id: exp.id,
            type: 'expense',
            description: exp.description,
            amount: exp.amount,
            currency: exp.currency,
            groupId: group.id,
            groupName: group.name,
            paidBy: exp.paid_by,
            paidByName: getName(exp.paid_by),
            date: exp.expense_date,
            createdAt: exp.created_at,
            category: exp.category,
            myShare: mySplit ? mySplit.amount : 0,
            icon: cat.icon,
            iconColor: '',
            iconBg: '',
          });
        }

        const settlements = getGroupSettlements(group.id);
        for (const sett of settlements) {
          items.push({
            id: sett.id,
            type: 'settlement',
            description: `${getName(sett.paid_by)} paid ${getName(sett.paid_to)}`,
            amount: sett.amount,
            currency: sett.currency,
            groupId: group.id,
            groupName: group.name,
            paidBy: sett.paid_by,
            paidByName: getName(sett.paid_by),
            paidToName: getName(sett.paid_to),
            date: sett.settled_at,
            createdAt: sett.created_at,
            myShare: 0,
            icon: 'handshake-outline',
            iconColor: '',
            iconBg: '',
          });
        }
      }

      items.sort((a, b) => (b.date || b.createdAt).localeCompare(a.date || a.createdAt));
      setActivities(items);
    }, [refreshKey]),
  );

  // Group activities into sections by date
  const sections = React.useMemo(() => {
    const now = dayjs();
    const sectionMap: Record<string, ActivityItem[]> = {};
    for (const item of activities) {
      const d = dayjs(item.date || item.createdAt);
      let label: string;
      if (d.isSame(now, 'day')) label = 'Today';
      else if (d.isSame(now.subtract(1, 'day'), 'day')) label = 'Yesterday';
      else label = d.format('D MMMM YYYY');
      if (!sectionMap[label]) sectionMap[label] = [];
      sectionMap[label].push(item);
    }
    return Object.entries(sectionMap).map(([title, data]) => ({title, data}));
  }, [activities]);

  const styles = makeStyles(colors);

  const renderItem = ({item, index}: {item: ActivityItem; index: number}) => {
    const isSettlement = item.type === 'settlement';
    const iconBg = isSettlement ? colors.positive + '15' : colors.surfaceElevated;
    const iconColor = isSettlement ? colors.positive : colors.text;
    const content = (
      <View style={styles.activityRow}>
        <View style={[styles.iconContainer, {backgroundColor: iconBg}]}>
          <Icon name={item.icon} size={18} color={iconColor} />
        </View>
        <View style={styles.activityInfo}>
          <Text style={styles.activityDesc} numberOfLines={1}>
            {item.description}
          </Text>
          <Text style={styles.activityMeta} numberOfLines={1}>
            {isSettlement
              ? `Settlement in ${item.groupName}`
              : `${item.paidByName} paid \u00b7 ${item.groupName}`}
          </Text>
          <Text style={styles.activityDate}>
            {dayjs(item.createdAt).fromNow()}
          </Text>
        </View>
        <View style={{alignItems: 'flex-end'}}>
          <Text style={[
            styles.activityAmount,
            isSettlement && {color: colors.positive},
          ]}>
            {formatCurrency(item.amount, item.currency)}
          </Text>
          {!isSettlement && item.myShare > 0 && (
            <Text style={{fontSize: 11, color: colors.textMuted, marginTop: 1}}>
              yours: {formatCurrency(item.myShare, item.currency)}
            </Text>
          )}
        </View>
      </View>
    );
    return (
      <FadeInView index={index}>
        {isSettlement ? content : (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => navigation.navigate('Groups', {screen: 'ExpenseDetail', params: {expenseId: item.id, groupId: item.groupId}})}>
            {content}
          </TouchableOpacity>
        )}
      </FadeInView>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Activity</Text>

      {activities.length === 0 ? (
        <EmptyState icon="history" title="No activity yet" subtitle="Expenses and settlements will show here" />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          renderSectionHeader={({section: {title}}) => (
            <SectionHeader title={title} />
          )}
          contentContainerStyle={{paddingBottom: 80}}
          refreshControl={<RefreshControl refreshing={false} onRefresh={() => setRefreshKey(k => k + 1)} tintColor={colors.text} />}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
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
    activityRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    iconContainer: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: spacing.md,
    },
    activityInfo: {
      flex: 1,
    },
    activityDesc: {
      fontSize: fonts.sizes.base,
      fontWeight: fonts.weights.medium,
      color: colors.text,
    },
    activityMeta: {
      fontSize: fonts.sizes.sm,
      color: colors.textSecondary,
      marginTop: 2,
    },
    activityDate: {
      fontSize: fonts.sizes.xs,
      color: colors.textMuted,
      marginTop: 2,
    },
    activityAmount: {
      fontSize: fonts.sizes.base,
      fontWeight: fonts.weights.semibold,
      color: colors.text,
      marginLeft: spacing.sm,
    },
  });
