export default function RevealResultScreen({ game, onHome, onReplay }) {
  return (
    <div className="screen-centered">
      <h2>Result</h2>

      <div className="card card-narrow" style={{ marginTop: "0.75rem" }}>
        <p>
          The secret word was{" "}
          <strong>
            {game.word} ({game.categoryName})
          </strong>
          .
        </p>

        <h3 style={{ marginTop: "1rem" }}>Imposters</h3>
        <ul style={{ listStyle: "none", paddingLeft: 0, marginTop: "0.5rem" }}>
          {game.imposters.map((n) => {
            const name =
              game.playerNames && game.playerNames[n - 1]
                ? game.playerNames[n - 1]
                : `Player ${n}`;
            return <li key={n}>{name}</li>;
          })}
        </ul>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "1.25rem" }}>
          <button className="btn-primary" onClick={onReplay}>
            Replay with same group
          </button>
          <button className="btn-secondary" onClick={onHome}>
            Back to home
          </button>
        </div>
      </div>
    </div>
  );
}
