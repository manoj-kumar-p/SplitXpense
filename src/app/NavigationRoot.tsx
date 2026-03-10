import React from 'react';
import {StyleSheet} from 'react-native';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {useTheme} from '../theme';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import GroupListScreen from '../screens/GroupListScreen';
import AddGroupScreen from '../screens/AddGroupScreen';
import GroupDetailScreen from '../screens/GroupDetailScreen';
import AddMemberScreen from '../screens/AddMemberScreen';
import AddExpenseScreen from '../screens/AddExpenseScreen';
import ExpenseDetailScreen from '../screens/ExpenseDetailScreen';
import SettleUpScreen from '../screens/SettleUpScreen';
import BalancesScreen from '../screens/BalancesScreen';
import FriendsScreen from '../screens/FriendsScreen';
import ActivityScreen from '../screens/ActivityScreen';
import ProfileScreen from '../screens/ProfileScreen';
import SyncScreen from '../screens/SyncScreen';
import StatsScreen from '../screens/StatsScreen';
import PolicyScreen from '../screens/PolicyScreen';
import AboutScreen from '../screens/AboutScreen';

import type {RootTabParamList, GroupsStackParamList, ProfileStackParamList} from '../types/navigation';

const Tab = createBottomTabNavigator<RootTabParamList>();
const GroupsStack = createNativeStackNavigator<GroupsStackParamList>();
const ProfileStack = createNativeStackNavigator<ProfileStackParamList>();
const FriendsStack = createNativeStackNavigator();
const ActivityStack = createNativeStackNavigator();

function GroupsNavigator() {
  const {colors} = useTheme();

  return (
    <GroupsStack.Navigator
      screenOptions={{
        headerStyle: {backgroundColor: colors.background},
        headerTintColor: colors.text,
        headerShadowVisible: false,
        contentStyle: {backgroundColor: colors.background},
        headerTitleStyle: {fontWeight: '600'},
      }}>
      <GroupsStack.Screen name="GroupList" component={GroupListScreen} options={{headerShown: false}} />
      <GroupsStack.Screen name="AddGroup" component={AddGroupScreen} options={{title: 'New Group'}} />
      <GroupsStack.Screen name="GroupDetail" component={GroupDetailScreen} options={{title: ''}} />
      <GroupsStack.Screen name="AddMember" component={AddMemberScreen} options={{title: 'Add Member'}} />
      <GroupsStack.Screen
        name="AddExpense"
        component={AddExpenseScreen}
        options={{title: ''}}
      />
      <GroupsStack.Screen name="ExpenseDetail" component={ExpenseDetailScreen} options={{title: 'Expense'}} />
      <GroupsStack.Screen name="SettleUp" component={SettleUpScreen} options={{title: 'Settle Up'}} />
      <GroupsStack.Screen name="GroupBalances" component={BalancesScreen} options={{title: 'Balances'}} />
    </GroupsStack.Navigator>
  );
}

function FriendsNavigator() {
  const {colors} = useTheme();
  return (
    <FriendsStack.Navigator
      screenOptions={{
        headerStyle: {backgroundColor: colors.background},
        headerTintColor: colors.text,
        headerShadowVisible: false,
        contentStyle: {backgroundColor: colors.background},
        headerTitleStyle: {fontWeight: '600'},
      }}>
      <FriendsStack.Screen name="FriendsList" component={FriendsScreen} options={{headerShown: false}} />
    </FriendsStack.Navigator>
  );
}

function ActivityNavigator() {
  const {colors} = useTheme();
  return (
    <ActivityStack.Navigator
      screenOptions={{
        headerStyle: {backgroundColor: colors.background},
        headerTintColor: colors.text,
        headerShadowVisible: false,
        contentStyle: {backgroundColor: colors.background},
        headerTitleStyle: {fontWeight: '600'},
      }}>
      <ActivityStack.Screen name="ActivityList" component={ActivityScreen} options={{headerShown: false}} />
    </ActivityStack.Navigator>
  );
}

function ProfileNavigator() {
  const {colors} = useTheme();

  return (
    <ProfileStack.Navigator
      screenOptions={{
        headerStyle: {backgroundColor: colors.background},
        headerTintColor: colors.text,
        headerShadowVisible: false,
        contentStyle: {backgroundColor: colors.background},
        headerTitleStyle: {fontWeight: '600'},
      }}>
      <ProfileStack.Screen name="Profile" component={ProfileScreen} options={{headerShown: false}} />
      <ProfileStack.Screen name="Sync" component={SyncScreen} options={{title: ''}} />
      <ProfileStack.Screen name="Stats" component={StatsScreen} options={{title: ''}} />
      <ProfileStack.Screen name="Policy" component={PolicyScreen} options={{title: ''}} />
      <ProfileStack.Screen name="About" component={AboutScreen} options={{title: ''}} />
    </ProfileStack.Navigator>
  );
}

const TAB_ICONS: Record<string, {active: string; inactive: string}> = {
  Groups: {active: 'account-group', inactive: 'account-group-outline'},
  Friends: {active: 'account-multiple', inactive: 'account-multiple-outline'},
  Activity: {active: 'history', inactive: 'history'},
  ProfileTab: {active: 'account-circle', inactive: 'account-circle-outline'},
};

export default function NavigationRoot() {
  const {colors} = useTheme();

  return (
    <Tab.Navigator
      screenOptions={({route}) => ({
        tabBarIcon: ({focused, color}) => {
          const icons = TAB_ICONS[route.name];
          const iconName = focused ? icons.active : icons.inactive;
          return <Icon name={iconName} size={26} color={color} />;
        },
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
          elevation: 8,
          shadowColor: '#000',
          shadowOffset: {width: 0, height: -2},
          shadowOpacity: 0.06,
          shadowRadius: 4,
          height: 60,
          paddingBottom: 8,
          paddingTop: 4,
        },
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
        },
        headerShown: false,
        sceneStyle: {backgroundColor: colors.background},
      })}>
      <Tab.Screen
        name="Groups"
        component={GroupsNavigator}
        options={{tabBarLabel: 'Groups'}}
      />
      <Tab.Screen
        name="Friends"
        component={FriendsNavigator}
        options={{tabBarLabel: 'Friends'}}
      />
      <Tab.Screen
        name="Activity"
        component={ActivityNavigator}
        options={{tabBarLabel: 'Activity'}}
      />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileNavigator}
        options={{tabBarLabel: 'Profile'}}
      />
    </Tab.Navigator>
  );
}
