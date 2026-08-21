import { Capacitor } from '@capacitor/core';

// true, если приложение запущено как нативное (Android/iOS через Capacitor).
export const isNativePlatform = () => Capacitor.isNativePlatform();
