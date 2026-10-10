# Student ID Hub — UI Prototype

A React + Vite prototype for a personalized student identity dashboard.

## Requirements
- Node.js 18+ (Node.js 20 LTS recommended)
- npm

## Run locally
1. Extract this ZIP.
2. Open a terminal in the `student-id-hub` folder.
3. Run `npm install`
4. Run `npm run dev`
5. Open the local address printed by Vite (usually `http://localhost:5173`).

## Included
- Welcome page with barcode scanner and manual ID entry
- Registration flow for unknown IDs
- Personal dashboard
- Digital student card preview
- Profile photo upload and profile settings
- Dark/light theme, accent colors, background choices
- Responsive desktop/mobile layout
- Browser-local persistence via localStorage

## Demo
- Demo ID: `0103012156`
- The demo ID is pre-registered and opens the dashboard.
- Use a different ID to try the registration flow.

## Important prototype limitations
- This is a frontend prototype only. Data is saved in the current browser/device and is not shared with classmates.
- The first registration flow does not verify that an ID belongs to the person entering it. Do not use real student personal data until secure verification is implemented.
- Scanning requires camera permission and a secure context (HTTPS or localhost). Manual ID entry is available as a fallback.
- The QR shown on the card is a decorative preview, not a working identity QR.
- Supabase is not configured yet. Add a backend/auth/database before deploying for real users.

## Build
`npm run build`
