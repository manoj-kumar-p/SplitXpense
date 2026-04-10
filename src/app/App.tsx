import React, {useState, useEffect} from 'react';
import {StatusBar, Platform} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import {getLocalUser} from '../db/queries/userQueries';
import {getSetting, setSetting, getThemePreference} from '../db/queries/settingsQueries';
import {getDatabase} from '../db/database';
import {ThemeProvider, useThemeContext} from '../theme';
import {AlertProvider} from '../components/ThemedAlert';
import {getNotificationService} from '../notifications/NotificationService';
import {scheduleWeeklyReminder} from '../notifications/WeeklyReminderScheduler';
import {getTransactionDetector} from '../transaction/TransactionDetector';
import {setupTransactionNotificationHandlers, navigateToQuickAdd} from '../transaction/TransactionNotificationHandler';
import {navigationRef} from './NavigationRef';
import NavigationRoot from './NavigationRoot';
import SplashScreen from '../screens/SplashScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import ProfileScreen from '../screens/ProfileScreen';
import {ErrorBoundary} from '../components/ErrorBoundary';

type AppState = 'splash' | 'onboarding' | 'setup' | 'ready';

function AppContent() {
  const {isDark} = useThemeContext();
  const [appState, setAppState] = useState<AppState>('splash');

  useEffect(() => {
    if (appState !== 'ready') return;
    let deepLinkTimer: ReturnType<typeof setTimeout> | null = null;
    const isValidUuid = (s: string) => /^[a-f0-9-]{36}$/.test(s);

    const initNotifications = async () => {
      const svc = getNotificationService();
      await svc.initialize();
      setupTransactionNotificationHandlers();
      await scheduleWeeklyReminder();

      // Start transaction detector if enabled
      if (getSetting('txn_detection_enabled') === 'true') {
        getTransactionDetector().start();
      }

      // Check for pending deep link from background notification press
      if (global.__pendingQuickAddTxnId && isValidUuid(global.__pendingQuickAddTxnId)) {
        const id = global.__pendingQuickAddTxnId;
        global.__pendingQuickAddTxnId = undefined;
        deepLinkTimer = setTimeout(() => navigateToQuickAdd(id), 500);
      } else {
        global.__pendingQuickAddTxnId = undefined;
      }
    };
    initNotifications().catch(() => {});

    return () => {
      if (deepLinkTimer) clearTimeout(deepLinkTimer);
      getTransactionDetector().stop();
    };
  }, [appState]);

  const handleSplashFinish = () => {
    const hasOnboarded = getSetting('has_onboarded');
    if (hasOnboarded === 'true') {
      const user = getLocalUser();
      setAppState(user ? 'ready' : 'setup');
    } else {
      setAppState('onboarding');
    }
  };

  const handleOnboardingFinish = () => {
    setSetting('has_onboarded', 'true');
    const user = getLocalUser();
    setAppState(user ? 'ready' : 'setup');
  };

  const handleSetupComplete = () => {
    setAppState('ready');
  };

  if (appState === 'splash') {
    return (
      <>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} translucent backgroundColor="transparent" />
        <SplashScreen onFinish={handleSplashFinish} />
      </>
    );
  }

  if (appState === 'onboarding') {
    return (
      <>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} translucent backgroundColor="transparent" />
        <OnboardingScreen onFinish={handleOnboardingFinish} />
      </>
    );
  }

  if (appState === 'setup') {
    return (
      <>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} translucent backgroundColor="transparent" />
        <ProfileScreen onSetupComplete={handleSetupComplete} />
      </>
    );
  }

  return (
    <NavigationContainer ref={navigationRef}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} translucent backgroundColor="transparent" />
      <ErrorBoundary>
        <NavigationRoot />
      </ErrorBoundary>
    </NavigationContainer>
  );
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [themePref, setThemePref] = useState<'system' | 'light' | 'dark'>('system');

  useEffect(() => {
    getDatabase();
    setThemePref(getThemePreference());
    setReady(true);
  }, []);

  if (!ready) return null;

  return (
    <ThemeProvider initialPreference={themePref}>
      <AlertProvider>
        <AppContent />
      </AlertProvider>
    </ThemeProvider>
  );
}
