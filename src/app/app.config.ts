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

const firebaseConfig = {
 apiKey: "AIzaSyAHNDN4eoJuWuXk3UegX9PoSWcZQj6yFz4",
  authDomain: "algoworks-dev.firebaseapp.com",
  projectId: "algoworks-dev",
  storageBucket: "algoworks-dev.firebasestorage.app",
  messagingSenderId: "668256868217",
  appId: "1:668256868217:web:b1028aa041a6cb8cb141a8",
  measurementId: "G-QGY276YZCR"
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
