import React, {useState, useCallback} from 'react';
import {View, Text, ScrollView, TouchableOpacity, FlatList, StyleSheet} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import {useTheme} from '../theme';
import {fonts} from '../theme/fonts';
import {spacing} from '../theme/spacing';
import {radii} from '../theme/radii';
import {AppCard, AppButton, AppInput, Chip, BottomSheet, SectionHeader, EmptyState} from '../components/ui';
import {getAllMappings, upsertMapping, deleteMapping} from '../db/queries/accountGroupMapQueries';
import {getAllGroups} from '../db/queries/groupQueries';
import {useAlert} from '../components/ThemedAlert';
import type {InstrumentType, AccountGroupMap} from '../models/PendingTransaction';
import type {Group} from '../models/Group';

const INSTRUMENT_TYPES: {value: InstrumentType; label: string}[] = [
  {value: 'account', label: 'Account'},
  {value: 'debit_card', label: 'Debit Card'},
  {value: 'credit_card', label: 'Credit Card'},
  {value: 'upi', label: 'UPI'},
  {value: 'wallet', label: 'Wallet'},
];

const INSTRUMENT_ICONS: Record<InstrumentType, string> = {
  account: 'bank-outline',
  debit_card: 'credit-card-outline',
  credit_card: 'credit-card',
  upi: 'cellphone-arrow-down',
  wallet: 'wallet-outline',
};

function getPlaceholder(type: InstrumentType): string {
  switch (type) {
    case 'upi':
      return 'UPI ID (e.g. name@upi)';
    case 'account':
    case 'debit_card':
    case 'credit_card':
      return 'Last 4 digits';
    case 'wallet':
      return 'Wallet name or ID';
    default:
      return 'Identifier';
  }
}

function getInstrumentLabel(type: InstrumentType): string {
  const found = INSTRUMENT_TYPES.find(t => t.value === type);
  return found ? found.label : type;
}

export default function AccountMappingsScreen() {
  const {colors} = useTheme();
  const {showAlert} = useAlert();

  const [mappings, setMappings] = useState<AccountGroupMap[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [showAddSheet, setShowAddSheet] = useState(false);

  // Form state
  const [newInstrumentId, setNewInstrumentId] = useState('');
  const [newInstrumentType, setNewInstrumentType] = useState<InstrumentType>('account');
  const [newLabel, setNewLabel] = useState('');
  const [newGroupId, setNewGroupId] = useState('');

  const loadData = useCallback(() => {
    setMappings(getAllMappings());
    setGroups(getAllGroups());
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  const resetForm = () => {
    setNewInstrumentId('');
    setNewInstrumentType('account');
    setNewLabel('');
    setNewGroupId('');
  };

  const handleSave = () => {
    if (!newInstrumentId.trim()) {
      showAlert({title: 'Error', message: 'Please enter an identifier'});
      return;
    }
    if (!newGroupId) {
      showAlert({title: 'Error', message: 'Please select a group'});
      return;
    }
    upsertMapping(newInstrumentId.trim(), newInstrumentType, newGroupId, newLabel.trim());
    loadData();
    setShowAddSheet(false);
    resetForm();
  };

  const handleDelete = (instrumentId: string) => {
    showAlert({
      title: 'Delete Mapping',
      message: 'Are you sure you want to remove this mapping?',
      icon: 'delete-outline',
      buttons: [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteMapping(instrumentId);
            loadData();
          },
        },
      ],
    });
  };

  const getGroupName = (groupId: string): string => {
    const group = groups.find(g => g.id === groupId);
    return group ? group.name : 'Unknown Group';
  };

  const styles = makeStyles(colors);

  return (
    <ScrollView
      style={[styles.container, {backgroundColor: colors.background, paddingTop: spacing.base}]}
      showsVerticalScrollIndicator={false}>
      <Text style={[styles.screenTitle, {color: colors.text}]}>Account Mappings</Text>

      {mappings.length === 0 ? (
        <EmptyState
          icon="link-variant"
          title="No mappings yet"
          subtitle="Map a bank account or card to a group for auto-routing"
        />
      ) : (
        mappings.map((mapping, index) => (
          <React.Fragment key={mapping.instrument_id}>
            {index > 0 && <View style={{height: spacing.sm}} />}
            <AppCard>
              <View style={styles.mappingRow}>
                <View style={[styles.instrumentBadge, {backgroundColor: colors.surfaceElevated}]}>
                  <Icon
                    name={INSTRUMENT_ICONS[mapping.instrument_type] || 'help-circle-outline'}
                    size={20}
                    color={colors.text}
                  />
                </View>
                <View style={styles.mappingInfo}>
                  <Text style={[styles.mappingLabel, {color: colors.text}]}>
                    {mapping.label || getInstrumentLabel(mapping.instrument_type)}
                  </Text>
                  <Text style={[styles.mappingId, {color: colors.textMuted}]}>
                    {mapping.instrument_id}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => handleDelete(mapping.instrument_id)}
                  hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
                  <Icon name="delete-outline" size={20} color={colors.negative} />
                </TouchableOpacity>
              </View>
              <View style={styles.arrowRow}>
                <Icon name="arrow-right" size={16} color={colors.textMuted} />
                <Text style={[styles.groupName, {color: colors.textSecondary}]}>
                  {getGroupName(mapping.group_id)}
                </Text>
              </View>
            </AppCard>
          </React.Fragment>
        ))
      )}

      <View style={{marginTop: spacing.lg, marginBottom: spacing.xl}}>
        <AppButton
          title="Add Mapping"
          icon="plus"
          onPress={() => {
            resetForm();
            setShowAddSheet(true);
          }}
        />
      </View>

      {/* Add Mapping BottomSheet */}
      <BottomSheet
        visible={showAddSheet}
        onClose={() => {
          setShowAddSheet(false);
          resetForm();
        }}
        title="Add Mapping">
        <SectionHeader title="INSTRUMENT TYPE" />
        <View style={styles.chipRow}>
          {INSTRUMENT_TYPES.map(type => (
            <Chip
              key={type.value}
              label={type.label}
              selected={newInstrumentType === type.value}
              onPress={() => setNewInstrumentType(type.value)}
            />
          ))}
        </View>

        <AppInput
          label="Identifier"
          value={newInstrumentId}
          onChangeText={setNewInstrumentId}
          placeholder={getPlaceholder(newInstrumentType)}
        />

        <AppInput
          label="Label (optional)"
          value={newLabel}
          onChangeText={setNewLabel}
          placeholder="e.g., HDFC Savings"
        />

        <SectionHeader title="SELECT GROUP" />
        <FlatList
          data={groups}
          keyExtractor={item => item.id}
          scrollEnabled={false}
          renderItem={({item}) => {
            const selected = newGroupId === item.id;
            return (
              <TouchableOpacity
                style={[
                  styles.groupRow,
                  selected && {backgroundColor: colors.surfaceElevated},
                ]}
                onPress={() => setNewGroupId(item.id)}
                activeOpacity={0.7}>
                <View style={[styles.radio, {borderColor: selected ? colors.text : colors.border}]}>
                  {selected && <View style={[styles.radioDot, {backgroundColor: colors.text}]} />}
                </View>
                <Text style={[styles.groupRowLabel, {color: colors.text}]}>{item.name}</Text>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <Text style={[styles.noGroups, {color: colors.textMuted}]}>
              No groups yet. Create a group first.
            </Text>
          }
        />

        <View style={{marginTop: spacing.base}}>
          <AppButton title="Save Mapping" onPress={handleSave} />
        </View>
      </BottomSheet>
    </ScrollView>
  );
}

const makeStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      paddingHorizontal: spacing.base,
    },
    screenTitle: {
      fontSize: fonts.sizes.xl,
      fontWeight: fonts.weights.bold,
      marginBottom: spacing.lg,
    },
    mappingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    instrumentBadge: {
      width: 40,
      height: 40,
      borderRadius: radii.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    mappingInfo: {
      flex: 1,
    },
    mappingLabel: {
      fontSize: fonts.sizes.base,
      fontWeight: fonts.weights.semibold,
    },
    mappingId: {
      fontSize: fonts.sizes.sm,
      marginTop: 2,
    },
    deleteBtn: {
      padding: spacing.xs,
    },
    arrowRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: spacing.sm,
      marginLeft: 40 + spacing.md,
    },
    groupName: {
      fontSize: fonts.sizes.sm,
      fontWeight: fonts.weights.medium,
    },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginBottom: spacing.sm,
    },
    groupRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.sm,
      borderRadius: radii.sm,
      gap: spacing.md,
    },
    groupRowLabel: {
      fontSize: fonts.sizes.base,
      fontWeight: fonts.weights.medium,
    },
    radio: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
    },
    noGroups: {
      fontSize: fonts.sizes.base,
      textAlign: 'center',
      paddingVertical: spacing.lg,
    },
  });
