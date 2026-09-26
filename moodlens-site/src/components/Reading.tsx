import { useState, type CSSProperties } from 'react'
import { SAMPLE_READINGS } from '../readings'

export default function Reading() {
  const [selected, setSelected] = useState(0)
  const reading = SAMPLE_READINGS[selected]

  return (
    <section className="reading" id="reading">
      <div className="wrap">
        <p className="eyebrow">The reading</p>
        <h2>Choose an entry. See what the model sees.</h2>
        <p className="intro">
          These are real results from MoodLens's emotion model on sample journal entries. Each emotion
          is scored on its own, so a bittersweet entry can read as sad and loving at once.
        </p>
        <div className="reading-grid">
          <div className="entries" role="group" aria-label="Sample entries">
            {SAMPLE_READINGS.map((r, i) => (
              <button
                key={r.text}
                id={`entry-${i}`}
                type="button"
                className="entry"
                aria-pressed={i === selected}
                onClick={() => setSelected(i)}
              >
                “{r.text}”
              </button>
            ))}
          </div>

          <div className="card" aria-live="polite">
            <p className="card-label">Entry</p>
            <p className="quote">“{reading.text}”</p>
            <p className="card-label">Strongest emotion</p>
            <p className="top-label">{reading.scores[0][0]}</p>
            <div className="bars">
              {reading.scores.map(([label, score]) => {
                const pct = Math.round(score * 100)
                return (
                  // Keyed by selection so each pick remounts the bars and replays
                  // the grow-in animation. The bar's resting width is its real
                  // score, so it reads correctly even if animation never runs.
                  <div className="bar-row" key={`${selected}-${label}`}>
                    <span className="name">{label}</span>
                    <span className="track" aria-hidden="true">
                      <span className="fill" style={{ '--w': `${Math.max(pct, 1)}%` } as CSSProperties} />
                    </span>
                    <span className="pct">{pct}%</span>
                  </div>
                )
              })}
            </div>
            <p className="fineprint">
              Scores are the model's confidence for each emotion, from 0 to 100%. Readings can be wrong;
              they're a prompt for reflection, not a verdict.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
