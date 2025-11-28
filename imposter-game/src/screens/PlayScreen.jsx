export default function PlayScreen({ onReveal, onAbort }) {
  return (
    <div className="screen-centered">
      <button className="btn-text screen-header-left" onClick={onAbort}>
        ← Abort
      </button>

      <h2>Discussion Phase</h2>

      <div className="card card-narrow">
        <p>
          Now talk in real life! Describe the word without making it too easy
          for the imposter to guess.
        </p>
        <p style={{ marginTop: "0.5rem" }}>
          When you&apos;re ready to reveal the answer and vote, tap the button
          below.
        </p>

        <button className="btn-primary mt-lg" onClick={onReveal}>
          Reveal result
        </button>
      </div>
    </div>
  );
}
