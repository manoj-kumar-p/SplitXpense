import React from 'react';
import {View, Text, ScrollView, StyleSheet, Switch} from 'react-native';
import {useTheme} from '../theme';
import {fonts} from '../theme/fonts';
import {spacing} from '../theme/spacing';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

// ---- Tiny mock components for visual demonstration ----

function MockGroupCard({colors}: {colors: any}) {
  return (
    <View style={[mockStyles.card, {backgroundColor: colors.surface, borderColor: colors.border, flexDirection: 'row', alignItems: 'center'}]}>
      <View style={[mockStyles.groupIcon, {backgroundColor: colors.surfaceElevated}]}>
        <Icon name="home-outline" size={18} color={colors.text} />
      </View>
      <View style={{flex: 1}}>
        <Text style={[mockStyles.cardTitle, {color: colors.text}]}>Goa Trip 2026</Text>
        <Text style={[mockStyles.cardSub, {color: colors.textMuted}]}>4 members</Text>
      </View>
      <View style={{alignItems: 'flex-end'}}>
        <Text style={[mockStyles.owedLabel, {color: colors.negative}]}>you owe</Text>
        <Text style={[mockStyles.owedAmount, {color: colors.negative}]}>₹1,250</Text>
      </View>
    </View>
  );
}

function MockExpenseRow({colors, desc, amount, payer}: {colors: any; desc: string; amount: string; payer: string}) {
  return (
    <View style={[mockStyles.expenseRow, {borderBottomColor: colors.border}]}>
      <View style={[mockStyles.expenseIcon, {backgroundColor: colors.surfaceElevated}]}>
        <Icon name="receipt" size={14} color={colors.textMuted} />
      </View>
      <View style={{flex: 1}}>
        <Text style={[mockStyles.expenseDesc, {color: colors.text}]}>{desc}</Text>
        <Text style={[mockStyles.expensePayer, {color: colors.textMuted}]}>{payer} paid</Text>
      </View>
      <Text style={[mockStyles.expenseAmount, {color: colors.text}]}>{amount}</Text>
    </View>
  );
}

function MockBalanceRow({colors, name, amount, owe}: {colors: any; name: string; amount: string; owe: boolean}) {
  return (
    <View style={mockStyles.balanceRow}>
      <View style={[mockStyles.balanceAvatar, {backgroundColor: colors.surfaceElevated}]}>
        <Text style={{color: colors.text, fontWeight: '600', fontSize: 12}}>{name.charAt(0)}</Text>
      </View>
      <Text style={[{flex: 1, fontSize: 13, color: colors.text}]}>{name}</Text>
      <Text style={[{fontSize: 13, fontWeight: '600', color: owe ? colors.negative : colors.positive}]}>
        {owe ? `you owe ${amount}` : `owes you ${amount}`}
      </Text>
    </View>
  );
}

function MockSyncCard({colors, type, icon, desc}: {colors: any; type: string; icon: string; desc: string}) {
  return (
    <View style={[mockStyles.syncCard, {backgroundColor: colors.surface, borderColor: colors.border}]}>
      <View style={[mockStyles.syncIconWrap, {backgroundColor: colors.surfaceElevated}]}>
        <Icon name={icon} size={20} color={colors.text} />
      </View>
      <View style={{flex: 1}}>
        <Text style={[mockStyles.syncType, {color: colors.text}]}>{type}</Text>
        <Text style={[mockStyles.syncDesc, {color: colors.textMuted}]}>{desc}</Text>
      </View>
    </View>
  );
}

// ---- Main Screen ----

export default function AboutScreen() {
  const {colors} = useTheme();
  const s = makeStyles(colors);

  return (
    <ScrollView style={s.container} showsVerticalScrollIndicator={false}>
      <Text style={s.screenTitle}>About SplitXpense</Text>

      {/* Logo */}
      <View style={s.logoSection}>
        <View style={[s.logoCircle, {backgroundColor: colors.text}]}>
          <Text style={[s.logoDollar, {color: colors.background}]}>$</Text>
        </View>
        <Text style={s.appName}>SplitXpense</Text>
        <Text style={s.tagline}>Local-first expense splitting</Text>
        <Text style={s.version}>Version 1.0.0</Text>
      </View>

      {/* Intro */}
      <View style={[s.infoCard, {backgroundColor: colors.surface, borderColor: colors.border}]}>
        <Icon name="shield-lock-outline" size={20} color={colors.text} style={{marginRight: spacing.md}} />
        <Text style={[s.infoText, {color: colors.textSecondary}]}>
          All data stays on your device. No accounts, no servers, no internet required.
        </Text>
      </View>

      {/* Step 1 — Groups */}
      <View style={s.section}>
        <View style={s.stepHeader}>
          <View style={[s.stepBadge, {backgroundColor: colors.text}]}>
            <Text style={[s.stepNum, {color: colors.background}]}>1</Text>
          </View>
          <View style={{flex: 1}}>
            <Text style={s.stepTitle}>Create Groups</Text>
            <Text style={s.stepSub}>Trips, flats, events — add members by phone</Text>
          </View>
        </View>
        <MockGroupCard colors={colors} />
      </View>

      {/* Step 2 — Expenses */}
      <View style={s.section}>
        <View style={s.stepHeader}>
          <View style={[s.stepBadge, {backgroundColor: colors.text}]}>
            <Text style={[s.stepNum, {color: colors.background}]}>2</Text>
          </View>
          <View style={{flex: 1}}>
            <Text style={s.stepTitle}>Add Expenses</Text>
            <Text style={s.stepSub}>Split equally, by shares, or custom amounts</Text>
          </View>
        </View>
        <View style={[mockStyles.card, {backgroundColor: colors.surface, borderColor: colors.border}]}>
          <View style={{flex: 1}}>
            <MockExpenseRow colors={colors} desc="Dinner at Beach Shack" amount="₹2,400" payer="Rahul" />
            <MockExpenseRow colors={colors} desc="Cab to Airport" amount="₹850" payer="You" />
            <MockExpenseRow colors={colors} desc="Hotel booking" amount="₹8,000" payer="Priya" />
          </View>
        </View>
      </View>

      {/* Step 3 — Balances */}
      <View style={s.section}>
        <View style={s.stepHeader}>
          <View style={[s.stepBadge, {backgroundColor: colors.text}]}>
            <Text style={[s.stepNum, {color: colors.background}]}>3</Text>
          </View>
          <View style={{flex: 1}}>
            <Text style={s.stepTitle}>Track Balances</Text>
            <Text style={s.stepSub}>See who owes whom across all groups</Text>
          </View>
        </View>
        <View style={[mockStyles.card, {backgroundColor: colors.surface, borderColor: colors.border, paddingVertical: spacing.sm}]}>
          <MockBalanceRow colors={colors} name="Rahul" amount="₹650" owe={true} />
          <MockBalanceRow colors={colors} name="Priya" amount="₹1,200" owe={false} />
          <MockBalanceRow colors={colors} name="Amit" amount="₹400" owe={true} />
        </View>
      </View>

      {/* Step 4 — Sync */}
      <View style={s.section}>
        <View style={s.stepHeader}>
          <View style={[s.stepBadge, {backgroundColor: colors.text}]}>
            <Text style={[s.stepNum, {color: colors.background}]}>4</Text>
          </View>
          <View style={{flex: 1}}>
            <Text style={s.stepTitle}>Sync Peer-to-Peer</Text>
            <Text style={s.stepSub}>No cloud needed — sync directly with friends</Text>
          </View>
        </View>
        <MockSyncCard
          colors={colors}
          type="WiFi Sync"
          icon="wifi"
          desc="Auto-discovers friends on the same network. Fast and free."
        />
        <MockSyncCard
          colors={colors}
          type="SMS Sync"
          icon="message-text-outline"
          desc="Syncs anywhere via compact SMS messages. Standard charges apply."
        />
      </View>

      {/* SMS Sync info */}
      <View style={[s.tipCard, {backgroundColor: colors.surface, borderColor: colors.border}]}>
        <View style={s.tipHeader}>
          <Icon name="information-outline" size={18} color={colors.text} />
          <Text style={[s.tipTitle, {color: colors.text}]}>About SMS Sync</Text>
        </View>
        <Text style={[s.tipText, {color: colors.textSecondary}]}>
          SMS sync is enabled by default so your expenses stay in sync with group members automatically. You can disable it anytime in Profile → Auto SMS Sync.
        </Text>
        <View style={s.tipToggleRow}>
          <Icon name="message-text-outline" size={16} color={colors.textMuted} />
          <Text style={[s.tipToggleLabel, {color: colors.textMuted}]}>Auto SMS Sync</Text>
          <Switch
            value={true}
            disabled
            trackColor={{false: colors.border, true: colors.accent}}
            thumbColor={colors.text}
          />
        </View>
      </View>

      {/* Step 5 — Settle */}
      <View style={s.section}>
        <View style={s.stepHeader}>
          <View style={[s.stepBadge, {backgroundColor: colors.text}]}>
            <Text style={[s.stepNum, {color: colors.background}]}>5</Text>
          </View>
          <View style={{flex: 1}}>
            <Text style={s.stepTitle}>Settle Up</Text>
            <Text style={s.stepSub}>Record payments and clear debts</Text>
          </View>
        </View>
        <View style={[mockStyles.card, {backgroundColor: colors.surface, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: spacing.md, overflow: 'visible'}]}>
          <View style={[mockStyles.settleIcon, {backgroundColor: colors.positive + '18'}]}>
            <Icon name="check-circle-outline" size={22} color={colors.positive} />
          </View>
          <View style={{flex: 1}}>
            <Text style={{color: colors.text, fontSize: 14, fontWeight: '500'}}>You paid Rahul</Text>
            <Text style={{color: colors.textMuted, fontSize: 12, marginTop: 2}}>Settled via UPI</Text>
          </View>
          <Text style={{color: colors.positive, fontSize: 15, fontWeight: '600'}}>₹650</Text>
        </View>
      </View>

      {/* Privacy */}
      <View style={[s.privacyCard, {backgroundColor: colors.surface, borderColor: colors.border}]}>
        <Icon name="shield-check-outline" size={24} color={colors.text} />
        <Text style={[s.privacyTitle, {color: colors.text}]}>Your Privacy</Text>
        <Text style={[s.privacyDesc, {color: colors.textSecondary}]}>
          Your data never leaves your device except to sync directly with your friends. No servers, no analytics, no tracking. You own your data completely.
        </Text>
      </View>

      <View style={{height: spacing.xl}} />
    </ScrollView>
  );
}

// ---- Mock component styles ----
const mockStyles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: spacing.base,
    overflow: 'hidden',
  },
  groupIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  cardTitle: {fontSize: 14, fontWeight: '600'},
  cardSub: {fontSize: 12, marginTop: 1},
  owedLabel: {fontSize: 10, fontWeight: '500'},
  owedAmount: {fontSize: 15, fontWeight: '700'},

  expenseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  expenseIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  expenseDesc: {fontSize: 13, fontWeight: '500'},
  expensePayer: {fontSize: 11, marginTop: 1},
  expenseAmount: {fontSize: 13, fontWeight: '600'},

  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: spacing.base,
  },
  balanceAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },

  syncCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: spacing.base,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  syncIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  syncType: {fontSize: 14, fontWeight: '600'},
  syncDesc: {fontSize: 12, marginTop: 2, lineHeight: 17},

  settleIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

// ---- Screen styles ----
const makeStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      paddingHorizontal: spacing.base,
      paddingTop: spacing.base,
    },
    screenTitle: {
      fontSize: fonts.sizes.xl,
      fontWeight: fonts.weights.bold,
      color: colors.text,
      marginBottom: spacing.base,
      marginTop: spacing.sm,
    },
    logoSection: {
      alignItems: 'center',
      paddingVertical: spacing.xl,
    },
    logoCircle: {
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.md,
    },
    logoDollar: {
      fontSize: 28,
      fontWeight: '400',
      fontFamily: 'serif',
    },
    appName: {
      fontSize: fonts.sizes['2xl'],
      fontWeight: fonts.weights.bold,
      color: colors.text,
    },
    tagline: {
      fontSize: fonts.sizes.sm,
      color: colors.textMuted,
      marginTop: 2,
    },
    version: {
      fontSize: fonts.sizes.xs,
      color: colors.textMuted,
      marginTop: spacing.xs,
    },

    infoCard: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderRadius: 12,
      padding: spacing.base,
      marginBottom: spacing.xl,
    },
    infoText: {
      flex: 1,
      fontSize: fonts.sizes.sm,
      lineHeight: 20,
    },

    section: {
      marginBottom: spacing.xl,
    },
    stepHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: spacing.md,
      gap: spacing.md,
    },
    stepBadge: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepNum: {
      fontSize: 13,
      fontWeight: '700',
    },
    stepTitle: {
      fontSize: fonts.sizes.md,
      fontWeight: fonts.weights.semibold,
      color: colors.text,
    },
    stepSub: {
      fontSize: fonts.sizes.sm,
      color: colors.textMuted,
      marginTop: 1,
    },

    tipCard: {
      borderWidth: 1,
      borderRadius: 12,
      padding: spacing.base,
      marginBottom: spacing.xl,
    },
    tipHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.sm,
    },
    tipTitle: {
      fontSize: fonts.sizes.base,
      fontWeight: fonts.weights.semibold,
    },
    tipText: {
      fontSize: fonts.sizes.sm,
      lineHeight: 20,
      marginBottom: spacing.md,
    },
    tipToggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingTop: spacing.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    tipToggleLabel: {
      flex: 1,
      fontSize: fonts.sizes.sm,
    },

    privacyCard: {
      borderWidth: 1,
      borderRadius: 12,
      padding: spacing.xl,
      alignItems: 'center',
    },
    privacyTitle: {
      fontSize: fonts.sizes.md,
      fontWeight: fonts.weights.semibold,
      marginTop: spacing.sm,
      marginBottom: spacing.sm,
    },
    privacyDesc: {
      fontSize: fonts.sizes.sm,
      lineHeight: 20,
      textAlign: 'center',
    },
  });
