// src/screens/HomeScreen.jsx

export default function HomeScreen({
  onPlay,
  onManage,
  onHowToPlay,
  onShare,
}) {
  return (
    <div>
      <div className="home-header">
        <div className="home-title-group">
          <h1>Imposter Game</h1>
          <p className="home-subtitle">
            A secret word party game for one device.
          </p>
        </div>

        <button
          type="button"
          className="icon-button-share"
          onClick={onShare}
          aria-label="Share game"
        >
          {/* simple share arrow icon */}
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              d="M7 11a1 1 0 0 1 0-2h7.586L12.293 6.707a1 1 0 0 1 1.414-1.414l4.5 4.5a1 1 0 0 1 0 1.414l-4.5 4.5a1 1 0 0 1-1.414-1.414L14.586 11H7Z"
              fill="currentColor"
            />
            <path
              d="M7 14a1 1 0 0 1 1 1v3h9v-3a1 1 0 1 1 2 0v3.25A1.75 1.75 0 0 1 17.25 20H8.75A1.75 1.75 0 0 1 7 18.25V15a1 1 0 0 1 1-1Z"
              fill="currentColor"
            />
          </svg>
        </button>
      </div>

      <div className="card" style={{ marginTop: "1.25rem" }}>
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

      <div className="home-bottom-row">
        <button className="btn-text" onClick={onHowToPlay}>
          How to play
        </button>
      </div>
    </div>
  );
}
