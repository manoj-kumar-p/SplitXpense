import React, {useCallback, useState} from 'react';
import {View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useTheme} from '../theme';
import {useAlert} from '../components/ThemedAlert';
import {AppCard, SectionHeader, EmptyState, Divider} from '../components/ui';
import {fonts} from '../theme/fonts';
import {spacing} from '../theme/spacing';
import {getAllPeers} from '../db/queries/syncQueries';
import {getSyncOrchestrator} from '../sync/SyncOrchestrator';
import type {Peer} from '../models/SyncOperation';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

export default function SyncScreen() {
  const {colors} = useTheme();
  const {showAlert} = useAlert();
  const [peers, setPeers] = useState<Peer[]>([]);
  const [bleScanning, setBleScanning] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);

  const orchestrator = getSyncOrchestrator();
  const registry = orchestrator.getPeerRegistry();

  useFocusEffect(
    useCallback(() => {
      setPeers(getAllPeers());
    }, []),
  );

  const refresh = () => setPeers(getAllPeers());

  const handleBleToggle = async () => {
    if (bleScanning) {
      orchestrator.stopBleScanning();
      setBleScanning(false);
    } else {
      try {
        await orchestrator.startBleScanning();
        setBleScanning(true);
        showAlert({
          title: 'Scanning',
          message: 'Looking for nearby SplitXpense users via Bluetooth...',
          icon: 'bluetooth-connect',
        });
      } catch (err: any) {
        showAlert({
          title: 'Bluetooth Error',
          message: err.message || 'Could not start Bluetooth scanning. Make sure Bluetooth is enabled and permissions are granted.',
          icon: 'bluetooth-off',
        });
      }
    }
  };

  const handleSync = async (peer: Peer, method: 'wifi' | 'ble' | 'sms') => {
    setSyncing(peer.phone_number);
    try {
      const result = await orchestrator.syncWithPeer(
        peer.phone_number,
        method === 'sms',
        method === 'ble',
      );
      refresh();
      showAlert({
        title: result.success ? 'Sync Complete' : 'Sync Failed',
        message: result.success
          ? `Synced via ${result.method.toUpperCase()} successfully.`
          : `Sync failed via ${result.method}.`,
        icon: result.success ? 'check-circle-outline' : 'alert-circle-outline',
      });
    } catch {
      showAlert({title: 'Error', message: 'Sync failed', icon: 'alert-circle-outline'});
    }
    setSyncing(null);
  };

  const styles = makeStyles(colors);
  const wifiPeerPhones = new Set(registry.getWifiPeers().map(p => p.phone));
  const blePeerPhones = new Set(registry.getBlePeers().map(p => p.phone));

  const getLastSync = (peer: Peer): string => {
    const times = [
      peer.last_wifi_sync ? dayjs(peer.last_wifi_sync) : null,
      peer.last_sms_sync ? dayjs(peer.last_sms_sync) : null,
      peer.last_ble_sync ? dayjs(peer.last_ble_sync) : null,
    ].filter(Boolean) as dayjs.Dayjs[];

    if (times.length === 0) return 'Never synced';
    const latest = times.reduce((a, b) => (a.isAfter(b) ? a : b));
    return `Last synced ${latest.fromNow()}`;
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Sync</Text>

      {/* Nearby / BLE section */}
      <AppCard style={{padding: spacing.base, marginBottom: spacing.xl}}>
        <View style={styles.nearbyHeader}>
          <Icon name="bluetooth-connect" size={22} color={colors.text} />
          <View style={{flex: 1, marginLeft: spacing.md}}>
            <Text style={[styles.nearbyTitle, {color: colors.text}]}>Nearby Sync</Text>
            <Text style={[styles.nearbyDesc, {color: colors.textMuted}]}>
              Find SplitXpense users nearby via Bluetooth
            </Text>
          </View>
          <TouchableOpacity
            style={[
              styles.scanBtn,
              bleScanning
                ? {backgroundColor: colors.text}
                : {borderWidth: 1, borderColor: colors.border},
            ]}
            onPress={handleBleToggle}>
            {bleScanning && <ActivityIndicator size="small" color={colors.background} style={{marginRight: 4}} />}
            <Text style={[styles.scanBtnText, {color: bleScanning ? colors.background : colors.text}]}>
              {bleScanning ? 'Scanning...' : 'Scan'}
            </Text>
          </TouchableOpacity>
        </View>

        {bleScanning && blePeerPhones.size === 0 && (
          <Text style={[styles.scanHint, {color: colors.textMuted}]}>
            Make sure both devices have the app open and Bluetooth enabled...
          </Text>
        )}

        {blePeerPhones.size > 0 && (
          <View style={styles.nearbyPeers}>
            {registry.getBlePeers().map(bp => (
              <React.Fragment key={bp.id}>
                <Divider />
                <TouchableOpacity
                  style={styles.nearbyPeerRow}
                  onPress={() => {
                    const peer = peers.find(p => p.phone_number === bp.phone);
                    if (peer) handleSync(peer, 'ble');
                  }}>
                  <Icon name="account-circle-outline" size={20} color={colors.text} />
                  <Text style={[styles.nearbyPeerName, {color: colors.text}]}>{bp.name}</Text>
                  {syncing === bp.phone ? (
                    <ActivityIndicator size="small" color={colors.text} />
                  ) : (
                    <Icon name="sync" size={18} color={colors.textMuted} />
                  )}
                </TouchableOpacity>
              </React.Fragment>
            ))}
          </View>
        )}
      </AppCard>

      {/* All Peers */}
      <SectionHeader title="All Peers" />
      {peers.length === 0 ? (
        <EmptyState
          icon="account-group-outline"
          title="No peers yet"
          subtitle="Add members to a group to see them here."
        />
      ) : (
        <FlatList
          data={peers}
          keyExtractor={item => item.phone_number}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{paddingBottom: spacing.base}}
          renderItem={({item}) => {
            const isOnWifi = wifiPeerPhones.has(item.phone_number);
            const isOnBle = blePeerPhones.has(item.phone_number);
            const isSyncing = syncing === item.phone_number;

            return (
              <>
                <View style={styles.peerRow}>
                  <View style={styles.peerInfo}>
                    <View style={styles.peerNameRow}>
                      <Text style={[styles.peerName, {color: colors.text}]}>
                        {item.display_name || item.phone_number}
                      </Text>
                      {isOnWifi && (
                        <View style={[styles.badge, {backgroundColor: colors.surfaceElevated}]}>
                          <Icon name="wifi" size={10} color={colors.text} />
                          <Text style={[styles.badgeText, {color: colors.text}]}>WiFi</Text>
                        </View>
                      )}
                      {isOnBle && (
                        <View style={[styles.badge, {backgroundColor: colors.surfaceElevated}]}>
                          <Icon name="bluetooth" size={10} color={colors.text} />
                          <Text style={[styles.badgeText, {color: colors.text}]}>Nearby</Text>
                        </View>
                      )}
                    </View>
                    <Text style={[styles.peerMeta, {color: colors.textMuted}]}>{getLastSync(item)}</Text>
                  </View>

                  {isSyncing ? (
                    <ActivityIndicator size="small" color={colors.text} />
                  ) : (
                    <View style={styles.syncButtons}>
                      {isOnWifi && (
                        <TouchableOpacity
                          style={[styles.syncBtn, {borderColor: colors.border}]}
                          onPress={() => handleSync(item, 'wifi')}>
                          <Icon name="wifi" size={14} color={colors.text} />
                        </TouchableOpacity>
                      )}
                      {isOnBle && (
                        <TouchableOpacity
                          style={[styles.syncBtn, {borderColor: colors.border}]}
                          onPress={() => handleSync(item, 'ble')}>
                          <Icon name="bluetooth" size={14} color={colors.text} />
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        style={[styles.syncBtn, {borderColor: colors.border}]}
                        onPress={() => handleSync(item, 'sms')}>
                        <Icon name="message-text-outline" size={14} color={colors.text} />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
                <Divider />
              </>
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
      paddingTop: spacing.base,
    },
    title: {
      fontSize: fonts.sizes.xl,
      fontWeight: fonts.weights.bold,
      color: colors.text,
      marginBottom: spacing.base,
      marginTop: spacing.sm,
    },
    nearbyHeader: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    nearbyTitle: {
      fontSize: fonts.sizes.base,
      fontWeight: fonts.weights.semibold,
    },
    nearbyDesc: {
      fontSize: fonts.sizes.xs,
      marginTop: 1,
    },
    scanBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: 20,
    },
    scanBtnText: {
      fontSize: fonts.sizes.sm,
      fontWeight: fonts.weights.semibold,
    },
    scanHint: {
      fontSize: fonts.sizes.xs,
      marginTop: spacing.md,
      textAlign: 'center',
      fontStyle: 'italic',
    },
    nearbyPeers: {
      marginTop: spacing.sm,
    },
    nearbyPeerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.md,
    },
    nearbyPeerName: {
      flex: 1,
      fontSize: fonts.sizes.base,
      fontWeight: fonts.weights.medium,
    },
    peerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: spacing.md,
    },
    peerInfo: {
      flex: 1,
    },
    peerNameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      flexWrap: 'wrap',
    },
    peerName: {
      fontSize: fonts.sizes.base,
      fontWeight: fonts.weights.medium,
    },
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
    },
    badgeText: {
      fontSize: 9,
      fontWeight: '600',
    },
    peerMeta: {
      fontSize: fonts.sizes.xs,
      marginTop: 2,
    },
    syncButtons: {
      flexDirection: 'row',
      gap: spacing.xs,
    },
    syncBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
