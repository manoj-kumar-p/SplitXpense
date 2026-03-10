import React, {useState} from 'react';
import {View, Text, TouchableOpacity, StyleSheet, FlatList, Modal, PermissionsAndroid, Platform} from 'react-native';
import {useNavigation, useRoute} from '@react-navigation/native';
import type {RouteProp} from '@react-navigation/native';
import Contacts from 'react-native-contacts';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useTheme} from '../theme';
import {useAlert} from '../components/ThemedAlert';
import {AppInput, AppButton, AppAvatar} from '../components/ui';
import {fonts} from '../theme/fonts';
import {spacing} from '../theme/spacing';
import {addGroupMember} from '../db/queries/groupQueries';
import {upsertKnownUser, getLocalUser} from '../db/queries/userQueries';
import {isValidPhone} from '../utils/phone';
import {COUNTRY_CODES, type CountryCode} from '../utils/countryCodes';
import type {GroupsStackParamList} from '../types/navigation';

type Route = RouteProp<GroupsStackParamList, 'AddMember'>;

interface ContactItem {
  id: string;
  name: string;
  phone: string;
}

export default function AddMemberScreen() {
  const {colors} = useTheme();
  const navigation = useNavigation();
  const route = useRoute<Route>();
  const {showAlert} = useAlert();
  const {groupId} = route.params;

  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [showContacts, setShowContacts] = useState(false);
  const [contacts, setContacts] = useState<ContactItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<CountryCode>(COUNTRY_CODES[0]);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');

  const requestContactsPermission = async () => {
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.READ_CONTACTS,
        {
          title: 'Contacts Access',
          message: 'SplitXpense needs access to your contacts to add group members.',
          buttonPositive: 'Allow',
          buttonNegative: 'Deny',
        },
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    }
    return true;
  };

  const handlePickContact = async () => {
    const hasPermission = await requestContactsPermission();
    if (!hasPermission) {
      showAlert({title: 'Permission Denied', message: 'Cannot access contacts without permission.'});
      return;
    }

    try {
      const allContacts = await Contacts.getAll();
      const mapped: ContactItem[] = [];

      for (const c of allContacts) {
        const contactName = [c.givenName, c.familyName].filter(Boolean).join(' ') || c.displayName || '';
        for (const p of c.phoneNumbers) {
          if (p.number) {
            mapped.push({
              id: `${c.recordID}-${p.number}`,
              name: contactName,
              phone: p.number.replace(/[\s\-()]/g, ''),
            });
          }
        }
      }

      mapped.sort((a, b) => a.name.localeCompare(b.name));
      setContacts(mapped);
      setSearchQuery('');
      setShowContacts(true);
    } catch (err) {
      showAlert({title: 'Error', message: 'Could not load contacts.'});
    }
  };

  const handleSelectContact = (contact: ContactItem) => {
    setName(contact.name);
    setPhone(contact.phone);
    setShowContacts(false);
  };

  const handleAdd = () => {
    if (!name.trim()) {
      showAlert({title: 'Error', message: 'Please enter a name'});
      return;
    }
    const digits = phone.replace(/[^0-9]/g, '');
    if (!digits || digits.length < 4 || digits.length > 15) {
      showAlert({title: 'Error', message: 'Please enter a valid phone number'});
      return;
    }
    // If phone already has a +, use as-is; otherwise prepend country code
    const normalized = phone.startsWith('+') ? phone.replace(/[^+0-9]/g, '') : selectedCountry.code + digits;
    if (!isValidPhone(normalized)) {
      showAlert({title: 'Error', message: 'Please enter a valid phone number'});
      return;
    }

    const user = getLocalUser();
    if (!user) return;

    const now = Date.now().toString();

    upsertKnownUser(normalized, name.trim(), now);
    addGroupMember(groupId, normalized, name.trim(), user.phone_number, now);

    navigation.goBack();
  };

  const filteredContacts = searchQuery
    ? contacts.filter(
        c =>
          c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.phone.includes(searchQuery),
      )
    : contacts;

  const styles = makeStyles(colors);

  return (
    <View style={styles.container}>
      {/* Pick from Contacts */}
      <TouchableOpacity style={styles.contactButton} onPress={handlePickContact} activeOpacity={0.7}>
        <Icon name="contacts" size={22} color={colors.text} />
        <Text style={styles.contactButtonText}>Pick from Contacts</Text>
        <Icon name="chevron-right" size={20} color={colors.textMuted} />
      </TouchableOpacity>

      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>or enter manually</Text>
        <View style={styles.dividerLine} />
      </View>

      <AppInput
        label="Phone Number"
        value={phone}
        onChangeText={setPhone}
        placeholder="98765 43210"
        keyboardType="phone-pad"
        leftElement={
          <TouchableOpacity
            style={styles.countryBtn}
            onPress={() => setShowCountryPicker(true)}>
            <Text style={{fontSize: 18}}>{selectedCountry.flag}</Text>
            <Text style={[styles.countryCode, {color: colors.text}]}>{selectedCountry.code}</Text>
            <Icon name="chevron-down" size={14} color={colors.textMuted} />
          </TouchableOpacity>
        }
      />

      <AppInput
        label="Display Name"
        value={name}
        onChangeText={setName}
        placeholder="Their name"
      />

      <AppButton
        title="Add Member"
        onPress={handleAdd}
        icon="account-plus"
        style={{marginTop: spacing['2xl']}}
      />

      {/* Country Code Picker Modal */}
      <Modal visible={showCountryPicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, {backgroundColor: colors.surface}]}>
            <View style={styles.modalHandle} />
            <Text style={[styles.modalTitle, {color: colors.text}]}>Select Country</Text>
            <AppInput
              value={countrySearch}
              onChangeText={setCountrySearch}
              placeholder="Search..."
              autoFocus
            />
            <FlatList
              data={COUNTRY_CODES.filter(c =>
                countrySearch
                  ? c.name.toLowerCase().includes(countrySearch.toLowerCase()) ||
                    c.code.includes(countrySearch) ||
                    c.iso.toLowerCase().includes(countrySearch.toLowerCase())
                  : true,
              )}
              keyExtractor={item => item.iso}
              renderItem={({item}) => (
                <TouchableOpacity
                  style={[
                    styles.countryRow,
                    item.iso === selectedCountry.iso && {backgroundColor: colors.surfaceElevated},
                  ]}
                  onPress={() => {
                    setSelectedCountry(item);
                    setShowCountryPicker(false);
                    setCountrySearch('');
                  }}>
                  <Text style={{fontSize: 20, marginRight: spacing.md}}>{item.flag}</Text>
                  <Text style={{flex: 1, fontSize: fonts.sizes.base, color: colors.text}}>{item.name}</Text>
                  <Text style={{fontSize: fonts.sizes.sm, color: colors.textMuted}}>{item.code}</Text>
                </TouchableOpacity>
              )}
            />
            <AppButton
              title="Cancel"
              variant="outline"
              onPress={() => { setShowCountryPicker(false); setCountrySearch(''); }}
              style={styles.modalClose}
            />
          </View>
        </View>
      </Modal>

      {/* Contact Picker Modal */}
      <Modal visible={showContacts} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, {backgroundColor: colors.surface}]}>
            <Text style={[styles.modalTitle, {color: colors.text}]}>Select Contact</Text>

            <AppInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search contacts..."
            />

            <FlatList
              data={filteredContacts}
              keyExtractor={item => item.id}
              renderItem={({item}) => (
                <TouchableOpacity
                  style={[styles.contactRow, {borderBottomColor: colors.border}]}
                  onPress={() => handleSelectContact(item)}>
                  <AppAvatar name={item.name} size="md" />
                  <View style={styles.contactInfo}>
                    <Text style={[styles.contactName, {color: colors.text}]}>{item.name}</Text>
                    <Text style={[styles.contactPhone, {color: colors.textMuted}]}>{item.phone}</Text>
                  </View>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={[styles.emptyText, {color: colors.textMuted}]}>No contacts found</Text>
              }
            />

            <AppButton
              title="Cancel"
              onPress={() => setShowContacts(false)}
              style={styles.modalClose}
            />
          </View>
        </View>
      </Modal>
    </View>
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
    contactButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      padding: spacing.base,
      marginTop: spacing.sm,
      gap: spacing.md,
    },
    contactButtonText: {
      flex: 1,
      fontSize: fonts.sizes.md,
      fontWeight: fonts.weights.semibold,
      color: colors.text,
    },
    divider: {
      flexDirection: 'row',
      alignItems: 'center',
      marginVertical: spacing.xl,
    },
    dividerLine: {
      flex: 1,
      height: 1,
      backgroundColor: colors.border,
    },
    dividerText: {
      marginHorizontal: spacing.md,
      fontSize: fonts.sizes.sm,
      color: colors.textMuted,
    },
    countryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingRight: spacing.sm,
      marginRight: spacing.xs,
      gap: 6,
    },
    countryCode: {
      fontSize: fonts.sizes.md,
      fontWeight: fonts.weights.medium,
    },
    countryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: spacing.sm,
      borderRadius: 8,
    },
    modalHandle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: '#CCC',
      alignSelf: 'center',
      marginBottom: spacing.md,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    modalContent: {
      maxHeight: '80%',
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      padding: spacing.base,
    },
    modalTitle: {
      fontSize: fonts.sizes.lg,
      fontWeight: fonts.weights.bold,
      marginBottom: spacing.md,
      textAlign: 'center',
    },
    contactRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      gap: spacing.md,
    },
    contactInfo: {
      flex: 1,
    },
    contactName: {
      fontSize: fonts.sizes.base,
      fontWeight: fonts.weights.medium,
    },
    contactPhone: {
      fontSize: fonts.sizes.sm,
      marginTop: 1,
    },
    emptyText: {
      textAlign: 'center',
      paddingVertical: spacing.xl,
      fontSize: fonts.sizes.base,
    },
    modalClose: {
      borderRadius: 8,
      padding: spacing.base,
      alignItems: 'center',
      marginTop: spacing.md,
    },
  });
