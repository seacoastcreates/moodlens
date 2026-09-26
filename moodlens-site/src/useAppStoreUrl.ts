import { useEffect, useState } from 'react'

// The App Store link, once MoodLens is live - null until then (and while
// loading, or if the check fails), which the page shows as "Coming soon".
// Backed by netlify/functions/app-store.mts.
export function useAppStoreUrl(): string | null {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/app-store', { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { url?: string | null } | null) => {
        if (data?.url) setUrl(data.url)
      })
      .catch(() => {
        // Network error or aborted: stay on "Coming soon".
      })
    return () => controller.abort()
  }, [])

  return url
}
