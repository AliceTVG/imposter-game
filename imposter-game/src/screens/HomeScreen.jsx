export default function HomeScreen({ onPlay, onManage }) {
  return (
    <div>
      <h1>Imposter Game</h1>
      <p>A secret word party game for one device.</p>

      <div className="card" style={{ marginTop: "1rem" }}>
        <p style={{ marginTop: 0 }}>
          Choose a category, give everyone a name, and let one of you bluff your
          way through the clues.
        </p>
        <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
          <button className="btn-primary" onClick={onPlay}>
            Play
          </button>
          <button className="btn-secondary" onClick={onManage}>
            Manage Categories
          </button>
        </div>
      </div>
    </div>
  );
}
