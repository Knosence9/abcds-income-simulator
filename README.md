# ABCDs Income Simulator

A one-page Astro site that explains the ABCDs income-investing framework and includes an interactive dividend income simulator.

## Local development

```bash
npm install
cp .env.example .env
npm run dev
```

## Build

```bash
npm run build
```

The site is ready to deploy on Vercel using the default Astro settings.

## Google sign-in visitor logging

The page includes optional Google sign-in through Firebase. Visitor logging only happens after a person clicks Google sign-in.

Set these Vercel environment variables from your Firebase web app config:

- `PUBLIC_FIREBASE_API_KEY`
- `PUBLIC_FIREBASE_AUTH_DOMAIN`
- `PUBLIC_FIREBASE_PROJECT_ID`
- `PUBLIC_FIREBASE_STORAGE_BUCKET`
- `PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `PUBLIC_FIREBASE_APP_ID`

Firebase setup checklist:

1. Create or open a Firebase project.
2. Add a Web App and copy the config values into Vercel env vars.
3. Enable Authentication → Sign-in method → Google.
4. Add your Vercel domain to Firebase Auth authorized domains.
5. Create Firestore Database.
6. Add rules for the `visitorLog` collection. A simple starter rule is:

```txt
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /visitorLog/{docId} {
      allow create: if request.auth != null
        && request.resource.data.uid == request.auth.uid;
      allow read, update, delete: if false;
    }
  }
}
```

Logged fields: Firebase UID, display name, email, photo URL, path, referrer, user agent, and server timestamp.
