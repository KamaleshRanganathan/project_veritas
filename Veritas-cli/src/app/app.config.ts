import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { getAuth, provideAuth } from '@angular/fire/auth';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideFirebaseApp(() => initializeApp({
      apiKey: "AIzaSyBpewgnGu2ptB8Dl7cbUS-4Lf_wDtJE7AU",
      authDomain: "project-veritas-45a63.firebaseapp.com",
      projectId: "project-veritas-45a63",
      storageBucket: "project-veritas-45a63.firebasestorage.app",
      messagingSenderId: "224717493539",
      appId: "1:224717493539:web:48e3951f971dd4bdd3a896",
      measurementId: "G-RPW7JFTN70"
    })),
    provideAuth(() => getAuth())
  ]
};
