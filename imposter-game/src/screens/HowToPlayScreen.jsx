// src/screens/HowToPlayScreen.jsx

export default function HowToPlayScreen({ onBack }) {
  return (
    <div>
      <button className="btn-text" onClick={onBack}>
        ← Back
      </button>

      <h1>How to Play</h1>

      <div className="card card-narrow mt-lg">
        <h2>Overview</h2>
        <p>
          Imposter Game is a secret word party game. Everyone knows the word
          except the imposter, who has to blend in without being caught.
        </p>
      </div>

      <div className="card card-narrow mt-lg">
        <h2>Setup</h2>
        <ol className="rules-list">
          <li>Choose a category on the home screen.</li>
          <li>Set the number of players and imposters.</li>
          <li>Give each player a name (or use the defaults).</li>
          <li>Tap <strong>Start Game</strong> to begin.</li>
        </ol>
      </div>

      <div className="card card-narrow mt-lg">
        <h2>Role Reveal</h2>
        <ol className="rules-list">
          <li>Pass the device around. Each player taps their name.</li>
          <li>
            They flip the card to see their role, then tap{" "}
            <strong>Hide role</strong>.
          </li>
          <li>When everyone has checked their role, the game moves on.</li>
        </ol>
      </div>

      <div className="card card-narrow mt-lg">
        <h2>Discussion Phase</h2>
        <ol className="rules-list">
          <li>
            Going in turns, each player says something related to the secret
            word.
          </li>
          <li>
            Don&apos;t be too obvious – the imposter is trying to guess the
            word.
          </li>
          <li>
            Don&apos;t be too vague – other players might think <em>you</em> are
            the imposter.
          </li>
        </ol>
      </div>

      <div className="card card-narrow mt-lg">
        <h2>Voting & Result</h2>
        <ol className="rules-list">
          <li>After a few rounds of clues, stop and vote in real life.</li>
          <li>
            Once you&apos;ve decided, tap <strong>Reveal result</strong>.
          </li>
          <li>
            The app shows the secret word and who the imposter was. Then you
            can replay with the same group.
          </li>
        </ol>
      </div>
    </div>
  );
}
