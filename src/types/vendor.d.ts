declare module 'react-native-vector-icons/MaterialCommunityIcons';
declare module '@react-native-community/datetimepicker';
declare module 'react-native-ble-plx';

declare module 'react-native-zeroconf' {
  export default class Zeroconf {
    scan(type: string, protocol?: string, domain?: string): void;
    stop(): void;
    publishService(
      protocol: string,
      type: string,
      name: string,
      port: number,
      txt?: Record<string, string>,
    ): void;
    unpublishService(name: string): void;
    on(event: string, callback: (...args: any[]) => void): void;
    removeAllListeners(): void;
  }
}

declare module 'react-native-contacts' {
  interface PhoneNumber {
    label: string;
    number: string;
  }

  interface Contact {
    recordID: string;
    givenName: string;
    familyName: string;
    displayName: string;
    phoneNumbers: PhoneNumber[];
  }

  export function getAll(): Promise<Contact[]>;
  export function getContactById(id: string): Promise<Contact>;
  export function checkPermission(): Promise<string>;
  export function requestPermission(): Promise<string>;
}

declare module 'react-native-send-direct-sms' {
  export function sendDirectSms(
    phoneNumber: string,
    message: string,
  ): Promise<string>;
}

declare module '@ernestbies/react-native-android-sms-listener' {
  interface SmsMessage {
    originatingAddress: string;
    body: string;
    timestamp: number;
  }

  interface Subscription {
    remove(): void;
  }

  const SmsListener: {
    addListener(callback: (message: SmsMessage) => void): Subscription;
  };

  export default SmsListener;
}
