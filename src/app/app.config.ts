import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideFirebaseApp, initializeApp } from '@angular/fire/app';
import { provideStorage, getStorage } from '@angular/fire/storage';
import { getFirestore, provideFirestore } from '@angular/fire/firestore';
import { provideAuth, getAuth } from '@angular/fire/auth';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { provideFunctions, getFunctions } from '@angular/fire/functions';

// const firebaseConfig = {
//   apiKey: 'AIzaSyAHNDN4eoJuWuXk3UegX9PoSWcZQj6yFz4',
//   authDomain: 'algoworks-dev.firebaseapp.com',
//   projectId: 'algoworks-dev',
//   storageBucket: 'algoworks-dev.firebasestorage.app',
//   messagingSenderId: '668256868217',
//   appId: '1:668256868217:web:b1028aa041a6cb8cb141a8',
//   measurementId: 'G-QGY276YZCR',
// };
const firebaseConfig = {
  piKey: 'AIzaSyDwbq6TlPBGP_OjvQ6zdtiVthuN8Wwlk00',
  authDomain: 'dev-wu-agenticai-app-proj.firebaseapp.com',
  projectId: 'dev-wu-agenticai-app-proj',
  storageBucket: 'dev-wu-agenticai-app-proj.firebasestorage.app',
  messagingSenderId: '1033582308599',
  appId: '1:1033582308599:web:c463ef3cb68b5e30c1f7f2',
  measurementId: 'G-TQH9XRL30H',
};

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideAnimations(),
    provideAnimationsAsync(),
    provideFirebaseApp(() => initializeApp(firebaseConfig)),
    provideStorage(() => getStorage()),
    provideFirestore(() => getFirestore()),
    provideFunctions(() => getFunctions()),
    provideAuth(() => getAuth()),
    provideHttpClient(),
  ],
};
