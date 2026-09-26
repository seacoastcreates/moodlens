import homeScreen from './assets/home-screen.jpg'
import icon from './assets/icon.png'
import Reading from './components/Reading'
import { useAppStoreUrl } from './useAppStoreUrl'

const API = 'https://moodlens-api-536953926843.us-east1.run.app'

const FEATURES = [
  {
    glyph: '✎',
    title: 'Write or speak',
    body: "Type what's on your mind, or switch to voice and talk for a few seconds. MoodLens reads the tone of your voice, too.",
  },
  {
    glyph: '☾',
    title: 'See your patterns',
    body: "A daily reading sums up where you've been. Trends show which days, months, and even moon phases lean lighter or heavier for you.",
  },
  {
    glyph: '✦',
    title: 'Gentle check-ins',
    body: 'When several entries in a row feel heavy, MoodLens says so kindly and offers a few ideas that have helped before.',
  },
]

const PRIVACY = [
  ['Account', 'None. No sign-up, email, or name. Your history is tied to an anonymous ID on your phone.'],
  ['Voice clips', 'Analyzed, then discarded. Recordings are never stored on our server.'],
  ['The AI', 'Open-source emotion models on our own server. Your words are never sent to a third-party AI service.'],
  ['Tracking', 'No ads, no third-party analytics, no tracking across apps.'],
  ['Deleting', 'One tap in Readings removes everything, from your phone and from our server.'],
]

export default function App() {
  const appStoreUrl = useAppStoreUrl()

  return (
    <>
      <div className="sky">
        <div className="wrap">
          <header className="top">
            <a className="brand" href="#top" aria-label="MoodLens">
              <img src={icon} alt="" width="36" height="36" />
              <span>MOODLENS</span>
            </a>
            <span className="status">{appStoreUrl ? 'Now on iPhone' : 'Coming soon · iPhone'}</span>
          </header>

          <div className="hero" id="top">
            <div>
              <div className="ornament" aria-hidden="true">
                ✦ <span className="twinkle">✧</span> ✦
              </div>
              <h1>
                A quiet reading of what you carry&nbsp;today. <em>MoodLens</em>
              </h1>
              <p className="lede">
                Write a few lines or say them out loud. MoodLens reads the emotion underneath, and keeps a
                private record of how your moods move.
              </p>
              <div className="cta-row">
                {appStoreUrl ? (
                  <>
                    <a className="cta" href={appStoreUrl} target="_blank" rel="noopener">
                      Download on the App Store
                    </a>
                    <span className="cta-note">Free · iPhone</span>
                  </>
                ) : (
                  <>
                    <a className="cta" href="#reading">See a reading</a>
                    <span className="cta-note">Free · iPhone · coming soon to the App Store</span>
                  </>
                )}
              </div>
            </div>
            <div className="phone">
              <img
                src={homeScreen}
                alt="The MoodLens home screen, showing a Daily Reading that leans toward joy, a weekly trend, and suggestions under the heading Celebrate the highs."
                width="506"
                height="1100"
              />
            </div>
          </div>
        </div>
      </div>

      <Reading />

      <section id="features">
        <div className="wrap">
          <p className="eyebrow">What it does</p>
          <h2>A journal that notices patterns you might miss</h2>
          <p className="intro">
            No streaks to keep, no score to chase. Just a place to check in, and a gentle eye on the long view.
          </p>
          <div className="features">
            {FEATURES.map((f) => (
              <div className="feature" key={f.title}>
                <span className="glyph" aria-hidden="true">{f.glyph}</span>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="privacy" className="privacy">
        <div className="wrap">
          <p className="eyebrow">Kept in confidence</p>
          <h2>Private by design</h2>
          <p className="intro">A mood journal holds tender things. Here's exactly what happens to yours.</p>
          <ul className="ledger">
            {PRIVACY.map(([k, v]) => (
              <li key={k}>
                <span className="k">{k}</span>
                <span className="v">{v}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <div className="care">
        <div className="wrap">
          <div className="care-box">
            <span className="moon" aria-hidden="true">☽</span>
            <div>
              <h3>A reflection tool, not medical care</h3>
              <p>
                MoodLens doesn't diagnose or treat anything. If you're in crisis or thinking about self-harm,
                in the US you can call or text <a href="tel:988"><strong>988</strong></a> any time, day or night.
                Elsewhere, contact your local emergency number.
              </p>
            </div>
          </div>
        </div>
      </div>

      <footer>
        <div className="wrap foot">
          <span>© 2026 36 Dunes</span>
          <nav aria-label="Footer">
            {appStoreUrl ? <a href={appStoreUrl} target="_blank" rel="noopener">App Store</a> : null}
            <a href={`${API}/privacy`}>Privacy policy</a>
            <a href={`${API}/support`}>Support</a>
            <a href="mailto:kirby@36dunes.com">kirby@36dunes.com</a>
          </nav>
        </div>
      </footer>
    </>
  )
}
