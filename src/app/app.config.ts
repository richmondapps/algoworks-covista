import { ApplicationConfig, provideZoneChangeDetection, isDevMode } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideFirebaseApp, initializeApp } from '@angular/fire/app';
import { provideStorage, getStorage } from '@angular/fire/storage';
import { getFirestore, provideFirestore } from '@angular/fire/firestore';
import { provideAuth, getAuth } from '@angular/fire/auth';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { provideFunctions, getFunctions, connectFunctionsEmulator } from '@angular/fire/functions';

const firebaseConfig = {
  apiKey: 'AIzaSyAHNDN4eoJuWuXk3UegX9PoSWcZQj6yFz4',
  authDomain: 'algoworks-dev.firebaseapp.com',
  projectId: 'algoworks-dev',
  storageBucket: 'algoworks-dev.firebasestorage.app',
  messagingSenderId: '668256868217',
  appId: '1:668256868217:web:b1028aa041a6cb8cb141a8',
  measurementId: 'G-QGY276YZCR',
};

const DevConfig = {
  apiKey: 'AIzaSyDwbq6TlPBGP_OjvQ6zdtiVthuN8Wwlk00',
  authDomain: 'dev-wu-agenticai-app-proj.firebaseapp.com',
  projectId: 'dev-wu-agenticai-app-proj',
  storageBucket: 'dev-wu-agenticai-app-proj.firebasestorage.app',
  messagingSenderId: '1033582308599',
  appId: '1:1033582308599:web:c463ef3cb68b5e30c1f7f2',
  measurementId: 'G-TQH9XRL30H',
};

export const QAConfig = {
  apiKey: "AIzaSyDj8K2-0oX3BI920vI6Swek74ouj0Uooc4",
  authDomain: "qa-wu-agenticai-app-proj.firebaseapp.com",
  projectId: "qa-wu-agenticai-app-proj",
  storageBucket: "qa-wu-agenticai-app-proj.firebasestorage.app",
  messagingSenderId: "738161391370",
  appId: "1:738161391370:web:d69c9335cc1f15fbc4ecf3",
  measurementId: "G-3K5F7VEZP4"
};

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideAnimations(),
    provideAnimationsAsync(),
    provideFirebaseApp(() => {
      const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
      const isQA = hostname.includes('qa-wu') || hostname.includes('qa-studentsuccessplan');
      return initializeApp(isQA ? QAConfig : DevConfig);
    }),
    provideStorage(() => getStorage()),
    provideFirestore(() => getFirestore()),
    provideFunctions(() => {
      const functions = getFunctions();
      if (isDevMode()) {
        connectFunctionsEmulator(functions, 'localhost', 5003);
      }
      return functions;
    }),
    provideAuth(() => getAuth()),
    provideHttpClient(),
  ],
};
