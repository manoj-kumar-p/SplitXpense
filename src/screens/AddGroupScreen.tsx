import React, {useState} from 'react';
import {View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, FlatList} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useTheme} from '../theme';
import {useAlert} from '../components/ThemedAlert';
import {AppInput, AppButton, BottomSheet} from '../components/ui';
import {fonts} from '../theme/fonts';
import {spacing} from '../theme/spacing';
import {createGroup, addGroupMember} from '../db/queries/groupQueries';
import {getLocalUser} from '../db/queries/userQueries';
import {GROUP_ICON_EMOJIS} from '../utils/groupIcons';
import type {GroupsStackParamList} from '../types/navigation';

type Nav = NativeStackNavigationProp<GroupsStackParamList, 'AddGroup'>;

export default function AddGroupScreen() {
  const {colors} = useTheme();
  const navigation = useNavigation<Nav>();
  const {showAlert} = useAlert();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedEmoji, setSelectedEmoji] = useState(GROUP_ICON_EMOJIS[0]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [customEmoji, setCustomEmoji] = useState('');

  const handleCreate = () => {
    if (!name.trim()) {
      showAlert({title: 'Error', message: 'Please enter a group name'});
      return;
    }

    const user = getLocalUser();
    if (!user) return;

    const now = Date.now().toString();
    const group = createGroup(name.trim(), description.trim(), user.phone_number, now, selectedEmoji);

    // Add self as first member
    addGroupMember(group.id, user.phone_number, user.display_name, user.phone_number, now);

    navigation.replace('GroupDetail', {groupId: group.id});
  };

  const handleCustomEmoji = () => {
    if (customEmoji.trim()) {
      setSelectedEmoji(customEmoji.trim());
      setCustomEmoji('');
      setShowEmojiPicker(false);
    }
  };

  const styles = makeStyles(colors);

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      {/* Icon Picker */}
      <TouchableOpacity
        style={styles.emojiPickerBtn}
        activeOpacity={0.7}
        onPress={() => setShowEmojiPicker(true)}>
        <Text style={styles.selectedEmoji}>{selectedEmoji}</Text>
        <Text style={[styles.changeText, {color: colors.textMuted}]}>Tap to change icon</Text>
      </TouchableOpacity>

      {/* Name */}
      <AppInput
        label="Group Name"
        value={name}
        onChangeText={setName}
        placeholder="e.g., Goa Trip 2026"
        autoFocus
        leftElement={<Text style={{fontSize: 20, marginRight: spacing.sm}}>{selectedEmoji}</Text>}
      />

      {/* Description */}
      <AppInput
        label="Description (optional)"
        value={description}
        onChangeText={setDescription}
        placeholder="What's this group for?"
        multiline
        numberOfLines={3}
      />

      {/* Tips card */}
      <View style={[styles.tipCard, {backgroundColor: colors.surface, borderColor: colors.border}]}>
        <Icon name="lightbulb-outline" size={18} color={colors.textMuted} />
        <Text style={[styles.tipText, {color: colors.textMuted}]}>
          After creating the group, you can add members and start tracking expenses right away.
        </Text>
      </View>

      <AppButton title="Create Group" onPress={handleCreate} icon="plus" style={{marginTop: spacing.xl}} />

      <View style={{height: spacing.xl}} />

      {/* Emoji Picker */}
      <BottomSheet visible={showEmojiPicker} onClose={() => setShowEmojiPicker(false)} title="Choose Group Icon">
        {/* Custom emoji input */}
        <View style={styles.customRow}>
          <TextInput
            style={[styles.customInput, {backgroundColor: colors.surfaceElevated, color: colors.text}]}
            value={customEmoji}
            onChangeText={setCustomEmoji}
            placeholder="Type custom emoji..."
            placeholderTextColor={colors.textMuted}
          />
          <TouchableOpacity
            style={[styles.customBtn, {backgroundColor: colors.text}]}
            onPress={handleCustomEmoji}>
            <Text style={{color: colors.background, fontWeight: '600'}}>Use</Text>
          </TouchableOpacity>
        </View>

        {/* Emoji grid */}
        <FlatList
          data={GROUP_ICON_EMOJIS}
          numColumns={6}
          keyExtractor={(item, idx) => `${item}-${idx}`}
          contentContainerStyle={styles.emojiGrid}
          renderItem={({item}) => (
            <TouchableOpacity
              style={[
                styles.emojiCell,
                item === selectedEmoji && {backgroundColor: colors.text + '15', borderColor: colors.text},
              ]}
              onPress={() => {
                setSelectedEmoji(item);
                setShowEmojiPicker(false);
              }}>
              <Text style={styles.emojiText}>{item}</Text>
            </TouchableOpacity>
          )}
        />
      </BottomSheet>
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
    emojiPickerBtn: {
      alignItems: 'center',
      paddingVertical: spacing.lg,
      marginBottom: spacing.md,
    },
    selectedEmoji: {
      fontSize: 48,
    },
    changeText: {
      fontSize: fonts.sizes.sm,
      marginTop: spacing.xs,
    },
    tipCard: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderRadius: 12,
      padding: spacing.base,
      marginTop: spacing.xl,
      gap: spacing.sm,
    },
    tipText: {
      flex: 1,
      fontSize: fonts.sizes.sm,
      lineHeight: 19,
    },
    customRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    customInput: {
      flex: 1,
      borderRadius: 10,
      paddingHorizontal: spacing.base,
      paddingVertical: 10,
      fontSize: fonts.sizes.md,
    },
    customBtn: {
      borderRadius: 10,
      paddingHorizontal: spacing.lg,
      justifyContent: 'center',
    },
    emojiGrid: {
      paddingVertical: spacing.sm,
    },
    emojiCell: {
      flex: 1,
      aspectRatio: 1,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 12,
      borderWidth: 2,
      borderColor: 'transparent',
      margin: 3,
    },
    emojiText: {
      fontSize: 28,
    },
  });
