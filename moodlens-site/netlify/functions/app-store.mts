import type { Config } from "@netlify/functions";

// Answers "is MoodLens on the App Store yet, and where?" so the site's
// download button switches from "Coming soon" to a real link on its own the
// day Apple approves the app - no redeploy needed.
//
// Source of truth is Apple's public iTunes lookup API, keyed by bundle ID.
// APP_STORE_URL (a Netlify env var) overrides it, e.g. to point at a
// campaign link or to force a URL before Apple's lookup index catches up.

const BUNDLE_ID = "com.36dunes.moodlens";

export default async () => {
  const override = Netlify.env.get("APP_STORE_URL");
  const url = override || (await lookupAppStoreUrl());

  return Response.json(
    { url },
    {
      headers: {
        // Browsers always revalidate; Netlify's CDN caches for an hour so
        // Apple's API sees at most one request per hour per edge, and the
        // button flips within an hour of the app going live.
        "Cache-Control": "public, max-age=0, must-revalidate",
        "Netlify-CDN-Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    }
  );
};

async function lookupAppStoreUrl(): Promise<string | null> {
  try {
    const res = await fetch(
      `https://itunes.apple.com/lookup?bundleId=${BUNDLE_ID}&country=us`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { results?: { trackViewUrl?: string }[] };
    const trackUrl = data.results?.[0]?.trackViewUrl;
    // Strip Apple's affiliate/tracking query params for a clean link.
    return trackUrl ? trackUrl.split("?")[0] : null;
  } catch {
    // Apple unreachable: show "Coming soon" rather than a broken link.
    return null;
  }
}

export const config: Config = {
  path: "/api/app-store",
};
