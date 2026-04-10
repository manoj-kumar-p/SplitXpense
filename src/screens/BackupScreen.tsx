import React, {useCallback, useState} from 'react';
import {View, Text, ScrollView, StyleSheet, ActivityIndicator} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

import {useTheme} from '../theme';
import {fonts} from '../theme/fonts';
import {spacing} from '../theme/spacing';
import {AppCard, AppButton, AppInput, SectionHeader, Divider} from '../components/ui';
import {useAlert} from '../components/ThemedAlert';
import {exportBackup, serializeBackup} from '../backup/exporter';
import {parseBackup, importBackup} from '../backup/importer';
import {encryptWithPassphrase, decryptWithPassphrase} from '../backup/encryption';
import {uploadBackup, getBackupInfo, downloadBackup, deleteBackup, BackupInfo} from '../backup/BackupClient';
import {isServerConfigured} from '../transaction/api/ServerSync';

dayjs.extend(relativeTime);

type BusyKind = null | 'info' | 'backup' | 'restore' | 'delete';

export default function BackupScreen() {
  const {colors} = useTheme();
  const {showAlert} = useAlert();
  const [info, setInfo] = useState<BackupInfo>({exists: false});
  const [busy, setBusy] = useState<BusyKind>(null);
  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [serverReady, setServerReady] = useState(false);

  const refreshInfo = useCallback(async () => {
    if (!isServerConfigured()) {
      setServerReady(false);
      return;
    }
    setServerReady(true);
    setBusy('info');
    try {
      const i = await getBackupInfo();
      setInfo(i);
    } catch (err: any) {
      setInfo({exists: false});
    } finally {
      setBusy(null);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshInfo();
    }, [refreshInfo]),
  );

  const handleBackup = async () => {
    if (passphrase.length < 8) {
      showAlert({title: 'Passphrase too short', message: 'Use at least 8 characters.', icon: 'lock-alert-outline'});
      return;
    }
    if (passphrase !== confirmPassphrase) {
      showAlert({title: 'Passphrases do not match', message: 'Re-enter your passphrase.', icon: 'alert-circle-outline'});
      return;
    }

    setBusy('backup');
    try {
      const doc = exportBackup();
      const json = serializeBackup(doc);
      const blob = await encryptWithPassphrase(json, passphrase);
      const result = await uploadBackup(blob);
      setPassphrase('');
      setConfirmPassphrase('');
      await refreshInfo();
      showAlert({
        title: 'Backup uploaded',
        message: `Encrypted ${(result.sizeBytes / 1024).toFixed(1)} KB stored on server.`,
        icon: 'cloud-check-outline',
      });
    } catch (err: any) {
      showAlert({title: 'Backup failed', message: err.message || 'Unknown error', icon: 'cloud-alert'});
    } finally {
      setBusy(null);
    }
  };

  const handleRestore = async () => {
    if (passphrase.length < 8) {
      showAlert({title: 'Passphrase required', message: 'Enter your backup passphrase.', icon: 'lock-alert-outline'});
      return;
    }
    showAlert({
      title: 'Restore from backup?',
      message: 'This will REPLACE all current local data with the backup. This cannot be undone.',
      icon: 'cloud-download-outline',
      buttons: [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Restore',
          style: 'destructive',
          onPress: async () => {
            setBusy('restore');
            try {
              const blob = await downloadBackup();
              const json = await decryptWithPassphrase(blob, passphrase);
              const doc = parseBackup(json);
              const result = importBackup(doc);
              setPassphrase('');
              setConfirmPassphrase('');
              showAlert({
                title: 'Restore complete',
                message: `Restored ${result.rowsRestored} rows across ${result.tablesRestored} tables. Restart the app to refresh all screens.`,
                icon: 'check-circle-outline',
              });
            } catch (err: any) {
              showAlert({title: 'Restore failed', message: err.message || 'Unknown error', icon: 'alert-circle-outline'});
            } finally {
              setBusy(null);
            }
          },
        },
      ],
    });
  };

  const handleDelete = () => {
    showAlert({
      title: 'Delete server backup?',
      message: 'Your local data is unaffected. The encrypted blob will be removed from the server.',
      icon: 'trash-can-outline',
      buttons: [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setBusy('delete');
            try {
              await deleteBackup();
              await refreshInfo();
              showAlert({title: 'Deleted', message: 'Server backup removed.', icon: 'check-circle-outline'});
            } catch (err: any) {
              showAlert({title: 'Delete failed', message: err.message || 'Unknown error', icon: 'alert-circle-outline'});
            } finally {
              setBusy(null);
            }
          },
        },
      ],
    });
  };

  return (
    <ScrollView style={[styles.container, {backgroundColor: colors.background}]} contentContainerStyle={styles.content}>
      <Text style={[styles.title, {color: colors.text}]}>Backup &amp; Restore</Text>
      <Text style={[styles.subtitle, {color: colors.textMuted}]}>
        Encrypted on this device, then uploaded. The server cannot read your data without your passphrase.
      </Text>

      {!serverReady ? (
        <AppCard>
          <View style={styles.warningRow}>
            <Icon name="server-network-off" size={20} color={colors.textMuted} />
            <Text style={[styles.warningText, {color: colors.textMuted}]}>
              Server URL not configured. Set it in Profile → Server URL first.
            </Text>
          </View>
        </AppCard>
      ) : (
        <>
          <SectionHeader title="SERVER STATUS" />
          <AppCard>
            {busy === 'info' ? (
              <ActivityIndicator color={colors.text} />
            ) : info.exists ? (
              <View>
                <View style={styles.infoRow}>
                  <Icon name="cloud-check-outline" size={20} color={colors.positive} />
                  <Text style={[styles.infoText, {color: colors.text}]}>
                    Backup exists ({((info.sizeBytes || 0) / 1024).toFixed(1)} KB)
                  </Text>
                </View>
                <Text style={[styles.infoMuted, {color: colors.textMuted}]}>
                  Updated {info.updatedAt ? dayjs(info.updatedAt).fromNow() : 'unknown'}
                </Text>
              </View>
            ) : (
              <View style={styles.infoRow}>
                <Icon name="cloud-off-outline" size={20} color={colors.textMuted} />
                <Text style={[styles.infoText, {color: colors.textMuted}]}>No backup on server</Text>
              </View>
            )}
          </AppCard>

          <SectionHeader title="PASSPHRASE" />
          <AppInput
            label="Passphrase"
            value={passphrase}
            onChangeText={setPassphrase}
            placeholder="At least 8 characters"
            secureTextEntry
          />
          <AppInput
            label="Confirm passphrase (for backup only)"
            value={confirmPassphrase}
            onChangeText={setConfirmPassphrase}
            placeholder="Re-enter passphrase"
            secureTextEntry
          />
          <Text style={[styles.helpText, {color: colors.textMuted}]}>
            Memorize this. There is no recovery — losing the passphrase means losing the backup.
          </Text>

          <View style={styles.actions}>
            <AppButton
              title={busy === 'backup' ? 'Uploading...' : 'Backup Now'}
              onPress={handleBackup}
              disabled={busy !== null}
              icon="cloud-upload-outline"
            />
            <View style={{height: spacing.sm}} />
            <AppButton
              title={busy === 'restore' ? 'Restoring...' : 'Restore from Server'}
              onPress={handleRestore}
              disabled={busy !== null || !info.exists}
              variant="outline"
              icon="cloud-download-outline"
            />
            {info.exists && (
              <>
                <Divider />
                <AppButton
                  title="Delete Server Backup"
                  onPress={handleDelete}
                  disabled={busy !== null}
                  variant="danger"
                  icon="trash-can-outline"
                />
              </>
            )}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1},
  content: {padding: spacing.base, paddingBottom: spacing.xl},
  title: {fontSize: 28, fontWeight: fonts.weights.bold, marginBottom: spacing.xs},
  subtitle: {fontSize: fonts.sizes.sm, fontWeight: fonts.weights.regular, marginBottom: spacing.lg},
  infoRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  infoText: {fontSize: fonts.sizes.md, fontWeight: fonts.weights.medium},
  infoMuted: {fontSize: fonts.sizes.sm, fontWeight: fonts.weights.regular, marginTop: spacing.xs, marginLeft: 28},
  warningRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  warningText: {fontSize: fonts.sizes.sm, fontWeight: fonts.weights.regular, flex: 1},
  helpText: {fontSize: fonts.sizes.xs, fontWeight: fonts.weights.regular, marginTop: spacing.sm, marginBottom: spacing.md},
  actions: {marginTop: spacing.lg},
});
