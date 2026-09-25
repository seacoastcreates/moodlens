# MoodLens — App Store submission kit (v1.0.0)

Everything App Store Connect asks for, ready to paste. Character counts are
checked against Apple's limits.

## App information

| Field | Value |
|---|---|
| Name (30) | MoodLens: Mood Journal |
| Subtitle (30) | Read the mood in your words |
| Bundle ID | com.36dunes.moodlens |
| SKU | moodlens-ios-001 |
| Primary category | Health & Fitness |
| Secondary category | Lifestyle |
| Price | Free |
| Copyright | 2026 36 Dunes |
| Privacy policy URL | https://moodlens-api-536953926843.us-east1.run.app/privacy |
| Support URL | https://moodlens-api-536953926843.us-east1.run.app/support |
| Marketing URL | (leave blank) |

If "MoodLens: Mood Journal" is taken, fall back to "MoodLens – Emotion Journal"
or "MoodLens Journal". Only the name has to be unique.

## Promotional text (170)

```
Write or speak how you feel, and MoodLens reads the emotion behind it — then shows the patterns in your moods over days, weeks, and months.
```

## Keywords (100, comma-separated, no spaces)

```
journal,diary,emotion,feelings,tracker,reflection,voice,wellbeing,mindfulness,self care,check in
```

## Description (4000)

```
MoodLens is a quiet place to check in with yourself. Write a few lines or record a short voice note, and MoodLens reads the emotion behind it — joy, sadness, gratitude, nervousness, and more — then keeps a private history so you can see how your moods move over time.

WRITE OR SPEAK
• Type whatever's on your mind, or switch to voice and speak for a few seconds.
• Each entry gets a reading: the strongest emotion, plus the others underneath it.

SEE YOUR PATTERNS
• A daily reading summarizes where you've been lately.
• Trends show which days, months, and even moon phases tend to lean lighter or heavier for you.
• When several entries in a row feel heavy, MoodLens offers a gentle check-in and a few ideas that might help.

PRIVATE BY DESIGN
• No account, no email, no name. Your history is tied to an anonymous ID on your device.
• Voice clips are analyzed and not stored on our server.
• No ads, no third-party analytics, no tracking.
• Delete everything — on your phone and on our server — any time, with one tap.

A NOTE ON WHAT MOODLENS IS
MoodLens is a reflection tool, not a medical device. It doesn't diagnose or treat anything, and its readings can be wrong. If you're in crisis or thinking about self-harm, in the US you can call or text 988 at any time; MoodLens links to it right in the app.
```

## What's New (version 1.0.0)

```
First release.
```

## App Review information

- **Sign-in required:** No (there are no accounts).
- **Contact:** Kirby, kirby@36dunes.com, plus a phone number (App Store Connect requires one).
- **Notes** (paste this):

```
MoodLens has no accounts or sign-in; everything works on first launch.

To test:
1. Type a sentence describing a feeling (e.g. "I finally finished my project and I feel great") and tap Reveal My Mood.
2. Switch to Voice, allow the microphone, record 2–6 seconds of clear speech, then tap Reveal My Mood.
3. Tap Readings to see history. "Delete All" there permanently deletes the user's data from the device and our server.

Notes:
- Mood analysis runs on our own server (Google Cloud) using open-source emotion models. If the server has been idle, the first reading can take up to a minute while it wakes; the app shows a message while it waits.
- MoodLens is a reflection tool, not a medical device. It shows a disclaimer and a link to the 988 Suicide & Crisis Lifeline on the home screen and on any heavy-mood alert.
- Privacy policy: https://moodlens-api-536953926843.us-east1.run.app/privacy
```

## App Privacy ("nutrition label") answers

Apple counts data as **collected** only if it leaves the device and is kept
longer than needed to handle the request in real time. So:

| Data type | Collected? | Linked to user? | Tracking? | Purpose |
|---|---|---|---|---|
| Health & Fitness → **Health** (mood readings) | Yes | Yes | No | App Functionality |
| User Content → **Other User Content** (written entries) | Yes | Yes | No | App Functionality |
| Identifiers → **User ID** (anonymous install ID) | Yes | Yes | No | App Functionality |
| User Content → Audio Data (voice clips) | **No**: analyzed in real time, not stored | | | |

Everything else (contact info, location, contacts, browsing, purchases,
diagnostics, advertising data, and so on): **not collected**.
"Do you or your third-party partners use data for tracking?": **No**.

"Linked to user" is answered Yes as the conservative reading: entries are
tied to a persistent (though anonymous) ID, which Apple's definitions treat
as linkable.

## Age rating

Answer the questionnaire honestly; the likely relevant items:

- Violence, sexual content, profanity, gambling, drugs/alcohol, horror: **None**.
- Medical or treatment-focused / health and wellness content: MoodLens discusses
  emotions and wellbeing and links to a crisis line, but gives no medical
  advice. Answer the wellness question **yes** if asked; answer **none**
  for medical treatment information.
- Suicide/self-harm references: only as a crisis-resource link, not as
  content. If a question covers this, describe it as infrequent/mild.
- User-generated content shared with others, messaging, web browsing: **No**.

Expect a teen-level rating. The exact questions changed with Apple's 2025
age-rating update, so go by what the form shows.

## Screenshots

iPhone only (the app is iPhone-only, so no iPad set is needed). Upload the
**6.9"** set; App Store Connect scales it down for smaller iPhones.

1. In Xcode's Simulator, open an **iPhone 16 Pro Max** (its screenshots are
   1320×2868, the 6.9" size). Install the app on it with
   `npx eas-cli build:run -p ios --latest --profile simulator` from
   `moodlens-frontend`.
2. Add 5–6 realistic text entries over a mix of moods so the Daily Reading
   and distribution have content.
3. Take screenshots with **Cmd+S** in the Simulator (they save to the Desktop):
   1. Home screen with the Daily Reading filled in
   2. A text entry typed in, just before Reveal My Mood
   3. The Reading result screen
   4. Readings (history) list
   5. Voice mode
4. Upload 3–6 in that order. Use Delete All afterwards so test data doesn't linger.

## Submission checklist

- [ ] Build 1.0.0 (1) uploaded (`npx eas-cli submit -p ios --latest`) and finished processing
- [ ] App information, pricing (Free), availability filled in
- [ ] Screenshots uploaded
- [ ] Description, keywords, subtitle, promotional text, URLs
- [ ] App Privacy questionnaire answered and published
- [ ] Age rating questionnaire answered
- [ ] App Review notes + contact info
- [ ] Build selected on the version page
- [ ] Before tapping Submit for Review: keep the server warm for the review window
      (see below)

## During review

Apple's reviewer may open the app when the server is cold. The keep-warm ping
makes that unlikely, but for the review window (typically 1–3 days) it's
worth guaranteeing:

```bash
# on submit (estimated $2–4/day while on - check the billing page):
gcloud run services update moodlens-api --region=us-east1 --project=moodlens-36dunes --min-instances=1
# once approved:
gcloud run services update moodlens-api --region=us-east1 --project=moodlens-36dunes --min-instances=0
```
