import React from 'react';
import {View, Text, ScrollView, StyleSheet} from 'react-native';
import {useTheme} from '../theme';
import {fonts} from '../theme/fonts';
import {spacing} from '../theme/spacing';

export default function PolicyScreen() {
  const {colors} = useTheme();
  const styles = makeStyles(colors);

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <Text style={styles.title}>Privacy & Terms</Text>
      <Text style={styles.updated}>Last updated: March 2026</Text>

      <Text style={styles.heading}>1. Data Storage</Text>
      <Text style={styles.body}>
        SplitXpense stores all your data locally on your device. No data is sent to any server or cloud service. Your expenses, groups, settlements, and personal information never leave your phone unless you explicitly sync with another device.
      </Text>

      <Text style={styles.heading}>2. Data Sync</Text>
      <Text style={styles.body}>
        When you sync with another device, data is transferred directly between devices via:{'\n'}
        {'\n'}- WiFi: Data is sent over your local network (LAN) directly to the other device. No internet connection is used.{'\n'}
        {'\n'}- SMS: Data is encoded and sent via SMS messages directly to the other person's phone number. Standard SMS charges from your carrier may apply.
      </Text>

      <Text style={styles.heading}>3. Permissions</Text>
      <Text style={styles.body}>
        The app requires the following permissions:{'\n'}
        {'\n'}- SEND_SMS: To sync data with other users via SMS{'\n'}
        - RECEIVE_SMS: To receive sync data from other users{'\n'}
        - READ_SMS: To process incoming sync messages{'\n'}
        - CONTACTS (optional): To pick phone numbers when adding group members{'\n'}
        - WiFi: To discover and sync with nearby devices on your network
      </Text>

      <Text style={styles.heading}>4. SMS Usage</Text>
      <Text style={styles.body}>
        When auto-SMS sync is enabled, the app will automatically send SMS messages to your group members when you add expenses or settlements. You can disable this in your profile settings at any time. SMS messages used for sync are identified by the "ST1" prefix and contain encoded expense data only.
      </Text>

      <Text style={styles.heading}>5. No Accounts</Text>
      <Text style={styles.body}>
        SplitXpense does not require you to create an account. Your phone number is used solely as an identifier to match you with other users during sync. It is stored locally on your device and shared only with devices you explicitly sync with.
      </Text>

      <Text style={styles.heading}>6. Data Deletion</Text>
      <Text style={styles.body}>
        Since all data is stored locally on your device, you can delete all app data at any time by clearing the app's storage or uninstalling the app. No data remains on any server because no servers are used.
      </Text>

      <Text style={styles.heading}>7. Third Parties</Text>
      <Text style={styles.body}>
        SplitXpense does not share any data with third parties. There are no analytics, no ads, no tracking. The app operates entirely offline and peer-to-peer.
      </Text>

      <Text style={styles.heading}>8. Open Source</Text>
      <Text style={styles.body}>
        SplitXpense is built with transparency in mind. The app's architecture ensures your financial data stays private and under your control at all times.
      </Text>

      <Text style={styles.heading}>Terms of Use</Text>
      <Text style={styles.body}>
        By using SplitXpense, you agree that:{'\n'}
        {'\n'}- You are responsible for the accuracy of expenses you enter{'\n'}
        - SMS charges for sync are your responsibility{'\n'}
        - The app is provided "as is" without warranty{'\n'}
        - The developers are not liable for any financial disputes between users{'\n'}
        - You will not use the SMS sync feature to send unsolicited messages
      </Text>

      <View style={{height: spacing.xl}} />
    </ScrollView>
  );
}

const makeStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.xl,
    },
    title: {
      fontSize: fonts.sizes.xl,
      fontWeight: fonts.weights.bold,
      color: colors.text,
      marginBottom: spacing.xs,
    },
    updated: {
      fontSize: fonts.sizes.sm,
      color: colors.textMuted,
      marginBottom: spacing.xl,
    },
    heading: {
      fontSize: fonts.sizes.md,
      fontWeight: fonts.weights.semibold,
      color: colors.text,
      marginTop: spacing.xl,
      marginBottom: spacing.sm,
    },
    body: {
      fontSize: fonts.sizes.base,
      color: colors.text,
      lineHeight: 22,
      opacity: 0.8,
    },
  });
