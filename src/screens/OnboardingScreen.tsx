import React, {useState, useRef} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Dimensions,
  type ViewToken,
} from 'react-native';
import {useTheme} from '../theme';
import {fonts} from '../theme/fonts';
import {spacing} from '../theme/spacing';

const {width} = Dimensions.get('window');

interface Props {
  onFinish: () => void;
}

// ── Mini preview components rendered inline ──

function GroupPreview({colors}: {colors: any}) {
  const groups = [
    {name: 'Weekend Trip', members: 4, balance: '+ 1,250.00'},
    {name: 'Flat Expenses', members: 3, balance: '- 480.00'},
    {name: 'Office Lunch', members: 6, balance: '0.00'},
  ];

  return (
    <View style={previewStyles.card}>
      {groups.map((g, i) => (
        <View
          key={i}
          style={[
            previewStyles.row,
            {borderBottomColor: colors.border},
            i === groups.length - 1 && {borderBottomWidth: 0},
          ]}>
          <View style={[previewStyles.avatar, {backgroundColor: colors.surfaceElevated}]}>
            <Text style={[previewStyles.avatarText, {color: colors.text}]}>
              {g.name.charAt(0)}
            </Text>
          </View>
          <View style={previewStyles.rowInfo}>
            <Text style={[previewStyles.rowTitle, {color: colors.text}]}>{g.name}</Text>
            <Text style={[previewStyles.rowSub, {color: colors.textMuted}]}>
              {g.members} members
            </Text>
          </View>
          <Text
            style={[
              previewStyles.rowAmount,
              {color: g.balance.startsWith('+') ? colors.positive : g.balance.startsWith('-') ? colors.negative : colors.textMuted},
            ]}>
            {g.balance}
          </Text>
        </View>
      ))}
    </View>
  );
}

function ExpensePreview({colors}: {colors: any}) {
  return (
    <View style={previewStyles.card}>
      <View style={[previewStyles.expenseHeader, {borderBottomColor: colors.border}]}>
        <Text style={[previewStyles.expenseTitle, {color: colors.text}]}>Dinner at Olive Garden</Text>
        <Text style={[previewStyles.expenseAmount, {color: colors.text}]}>2,400.00</Text>
      </View>

      <Text style={[previewStyles.splitLabel, {color: colors.textSecondary}]}>Split equally among:</Text>
      {['You', 'Alex', 'Priya', 'Sam'].map((name, i) => (
        <View key={i} style={[previewStyles.splitRow, {borderBottomColor: colors.border}]}>
          <View style={previewStyles.checkRow}>
            <View style={[previewStyles.checkbox, {backgroundColor: colors.primary}]} />
            <Text style={[previewStyles.splitName, {color: colors.text}]}>{name}</Text>
          </View>
          <Text style={[previewStyles.splitAmount, {color: colors.textSecondary}]}>600.00</Text>
        </View>
      ))}
    </View>
  );
}

function SyncPreview({colors}: {colors: any}) {
  return (
    <View style={previewStyles.card}>
      <View style={[previewStyles.syncRow, {borderBottomColor: colors.border}]}>
        <View style={[previewStyles.statusDot, {backgroundColor: colors.positive}]} />
        <View style={previewStyles.rowInfo}>
          <Text style={[previewStyles.rowTitle, {color: colors.text}]}>Alex</Text>
          <Text style={[previewStyles.rowSub, {color: colors.textMuted}]}>WiFi: just now</Text>
        </View>
        <Text style={[previewStyles.syncBadge, {color: colors.positive}]}>Synced</Text>
      </View>
      <View style={[previewStyles.syncRow, {borderBottomColor: colors.border}]}>
        <View style={[previewStyles.statusDot, {backgroundColor: colors.textMuted}]} />
        <View style={previewStyles.rowInfo}>
          <Text style={[previewStyles.rowTitle, {color: colors.text}]}>Priya</Text>
          <Text style={[previewStyles.rowSub, {color: colors.textMuted}]}>SMS: 2 min ago</Text>
        </View>
        <Text style={[previewStyles.syncBadge, {color: colors.positive}]}>Synced</Text>
      </View>
      <View style={previewStyles.syncRow}>
        <View style={[previewStyles.statusDot, {backgroundColor: colors.negative}]} />
        <View style={previewStyles.rowInfo}>
          <Text style={[previewStyles.rowTitle, {color: colors.text}]}>Sam</Text>
          <Text style={[previewStyles.rowSub, {color: colors.textMuted}]}>Not synced yet</Text>
        </View>
        <TouchableOpacity style={[previewStyles.syncBtn, {borderColor: colors.border}]}>
          <Text style={[previewStyles.syncBtnText, {color: colors.text}]}>Sync via SMS</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function FriendsPreview({colors}: {colors: any}) {
  const friends = [
    {name: 'Alex', amount: '+ 1,200.00', groups: ['Weekend Trip', 'Office Lunch']},
    {name: 'Priya', amount: '- 350.00', groups: ['Flat Expenses']},
    {name: 'Sam', amount: '+ 600.00', groups: ['Weekend Trip']},
  ];

  return (
    <View style={previewStyles.card}>
      {friends.map((f, i) => (
        <View
          key={i}
          style={[
            previewStyles.friendRow,
            {borderBottomColor: colors.border},
            i === friends.length - 1 && {borderBottomWidth: 0},
          ]}>
          <View style={[previewStyles.avatar, {backgroundColor: colors.surfaceElevated}]}>
            <Text style={[previewStyles.avatarText, {color: colors.text}]}>{f.name.charAt(0)}</Text>
          </View>
          <View style={previewStyles.rowInfo}>
            <Text style={[previewStyles.rowTitle, {color: colors.text}]}>{f.name}</Text>
            <Text style={[previewStyles.rowSub, {color: colors.textMuted}]}>
              {f.groups.join(', ')}
            </Text>
          </View>
          <Text
            style={[
              previewStyles.rowAmount,
              {color: f.amount.startsWith('+') ? colors.positive : colors.negative},
            ]}>
            {f.amount}
          </Text>
        </View>
      ))}
    </View>
  );
}

// ── Main Onboarding ──

const PAGES = [
  {
    key: 'groups',
    title: 'Create Groups',
    subtitle: 'Organize expenses by trip, household, event, or anything else. Add friends by phone number or from your contacts.',
    Preview: GroupPreview,
  },
  {
    key: 'expenses',
    title: 'Split Expenses',
    subtitle: 'Split equally, by shares, percentages, or custom amounts. Support multiple payers per expense.',
    Preview: ExpensePreview,
  },
  {
    key: 'friends',
    title: 'Track Balances',
    subtitle: 'See who owes whom across all groups. View per-friend totals with group breakdowns.',
    Preview: FriendsPreview,
  },
  {
    key: 'sync',
    title: 'Sync Without Internet',
    subtitle: 'Sync via WiFi when on the same network, or via SMS when apart. No servers, no cloud — your data stays on your device.',
    Preview: SyncPreview,
  },
];

export default function OnboardingScreen({onFinish}: Props) {
  const {colors} = useTheme();
  const [currentPage, setCurrentPage] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  const onViewableItemsChanged = useRef(
    ({viewableItems}: {viewableItems: ViewToken[]}) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setCurrentPage(viewableItems[0].index);
      }
    },
  ).current;

  const viewabilityConfig = useRef({viewAreaCoveragePercentThreshold: 50}).current;

  const handleNext = () => {
    if (currentPage < PAGES.length - 1) {
      flatListRef.current?.scrollToIndex({index: currentPage + 1, animated: true});
    } else {
      onFinish();
    }
  };

  const styles = makeStyles(colors);

  return (
    <View style={styles.container}>
      <FlatList
        ref={flatListRef}
        data={PAGES}
        keyExtractor={item => item.key}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        renderItem={({item}) => (
          <View style={styles.page}>
            <Text style={styles.pageTitle}>{item.title}</Text>
            <Text style={styles.pageSubtitle}>{item.subtitle}</Text>
            <View style={styles.previewContainer}>
              <item.Preview colors={colors} />
            </View>
          </View>
        )}
      />

      {/* Dots */}
      <View style={styles.dotsRow}>
        {PAGES.map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              {backgroundColor: i === currentPage ? colors.primary : colors.border},
            ]}
          />
        ))}
      </View>

      {/* Buttons */}
      <View style={styles.footer}>
        <TouchableOpacity onPress={onFinish}>
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.nextButton} onPress={handleNext}>
          <Text style={styles.nextText}>
            {currentPage === PAGES.length - 1 ? 'Get Started' : 'Next'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const makeStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    page: {
      width,
      paddingHorizontal: spacing.xl,
      paddingTop: spacing['4xl'],
    },
    pageTitle: {
      fontSize: fonts.sizes['2xl'],
      fontWeight: fonts.weights.bold,
      color: colors.text,
      marginBottom: spacing.sm,
    },
    pageSubtitle: {
      fontSize: fonts.sizes.base,
      color: colors.textSecondary,
      lineHeight: 22,
      marginBottom: spacing.xl,
    },
    previewContainer: {
      flex: 1,
    },
    dotsRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      paddingVertical: spacing.md,
      gap: spacing.sm,
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    footer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: spacing.xl,
      paddingBottom: spacing['2xl'],
    },
    skipText: {
      fontSize: fonts.sizes.base,
      color: colors.textMuted,
    },
    nextButton: {
      backgroundColor: colors.primary,
      paddingHorizontal: spacing['2xl'],
      paddingVertical: spacing.md,
      borderRadius: 8,
    },
    nextText: {
      fontSize: fonts.sizes.base,
      fontWeight: fonts.weights.semibold,
      color: colors.textInverse,
    },
  });

// ── Preview styles (shared) ──

const previewStyles = StyleSheet.create({
  card: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  avatarText: {
    fontSize: fonts.sizes.md,
    fontWeight: fonts.weights.bold,
  },
  rowInfo: {
    flex: 1,
  },
  rowTitle: {
    fontSize: fonts.sizes.base,
    fontWeight: fonts.weights.medium,
  },
  rowSub: {
    fontSize: fonts.sizes.sm,
    marginTop: 1,
  },
  rowAmount: {
    fontSize: fonts.sizes.base,
    fontWeight: fonts.weights.semibold,
  },
  expenseHeader: {
    paddingBottom: spacing.md,
    marginBottom: spacing.md,
    borderBottomWidth: 1,
  },
  expenseTitle: {
    fontSize: fonts.sizes.md,
    fontWeight: fonts.weights.bold,
  },
  expenseAmount: {
    fontSize: fonts.sizes['2xl'],
    fontWeight: fonts.weights.bold,
    marginTop: spacing.xs,
  },
  splitLabel: {
    fontSize: fonts.sizes.sm,
    marginBottom: spacing.sm,
  },
  splitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 16,
    height: 16,
    borderRadius: 3,
    marginRight: spacing.sm,
  },
  splitName: {
    fontSize: fonts.sizes.base,
  },
  splitAmount: {
    fontSize: fonts.sizes.base,
  },
  syncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: spacing.md,
  },
  syncBadge: {
    fontSize: fonts.sizes.sm,
    fontWeight: fonts.weights.medium,
  },
  syncBtn: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  syncBtnText: {
    fontSize: fonts.sizes.sm,
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
});
