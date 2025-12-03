// src/screens/SetupGameScreen.jsx
import { useState } from "react";

export default function SetupGameScreen({ categories, onBack, onStart }) {
  const [playerCount, setPlayerCount] = useState(4);
  const [playerCountInput, setPlayerCountInput] = useState("4");
  const [imposterCountInput, setImposterCountInput] = useState("1");
  const [categoryId, setCategoryId] = useState(
    categories[0] ? categories[0].id : ""
  );
  const [playerNames, setPlayerNames] = useState([
    "Player 1",
    "Player 2",
    "Player 3",
    "Player 4",
  ]);

  const [error, setError] = useState("")

  const clampCount = (value) => {
    let n = parseInt(value, 10);
    if (isNaN(n)) n = 3;
    if (n < 3) n = 3;
    if (n > 12) n = 12;
    return n;
  };

  const clampImposters = (value) => {
    let n = parseInt(value, 10);
    if (isNaN(n)) n = 1;
    if (n > 3) n = 3;
    return n;
  };

  const resizeNames = (n) => {
    setPlayerNames((prev) => {
      const next = [...prev];
      if (next.length < n) {
        for (let i = next.length; i < n; i++) {
          next.push(`Player ${i + 1}`);
        }
      } else if (next.length > n) {
        next.length = n;
      }
      return next;
    });
  };

  const handlePlayerCountBlur = () => {
    const n = clampCount(playerCountInput);
    setPlayerCount(n);
    setPlayerCountInput(String(n));
    resizeNames(n);
  };

  const handleImposterBlur = () => {
    const n = clampImposters(imposterCountInput);
    setImposterCountInput(String(n));
  };

  const handleNameChange = (index, value) => {
    setPlayerNames((prev) => {
      const next = [...prev];
      next[index] = value; // no auto “Player X” here
      return next;
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    const finalPlayerCount = clampCount(playerCountInput);
    const finalImposters = clampImposters(imposterCountInput); // validated below

    if (!categoryId) {
      setError("Please select a category");
      return;
    }
    if (finalImposters >= finalPlayerCount) {
      setError("Imposters must be fewer than total players");
      return;
    }

    // Build final names: empty entries fall back to "Player X"
    const namesForGame = Array.from({ length: finalPlayerCount }, (_, i) => {
      const raw = playerNames[i] ?? "";
      const trimmed = raw.trim();
      return trimmed || `Player ${i + 1}`;
    });

    // keep internal state in sync
    setPlayerCount(finalPlayerCount);
    setPlayerCountInput(String(finalPlayerCount));
    resizeNames(finalPlayerCount);

    setImposterCountInput(String(finalImposters));

    onStart({
      playerCount: finalPlayerCount,
      imposterCount: Number(finalImposters),
      categoryId,
      playerNames: namesForGame,
    });
  };

  return (
    <div>
      <button className="btn-text" onClick={onBack}>
        ← Back
      </button>
      <h2>Game Setup</h2>

      {error && (
        <div className="alert alert-error">
          <span className="alert-icon">⚠️</span>
          <span>{error}</span>
          <button
            type="button"
            className="alert-close"
            onClick={() => setError("")}
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="card">
        <label className="field">
          <span>Number of players</span>
          <input
            type="number"
            min={3}
            max={12}
            value={playerCountInput}
            onChange={(e) => setPlayerCountInput(e.target.value)}
            onBlur={handlePlayerCountBlur}
          />
        </label>

        <label className="field">
          <span>Number of imposters</span>
          <input
            type="number"
            min={1}
            max={3}
            value={imposterCountInput}
            onChange={(e) => setImposterCountInput(e.target.value)}
            onBlur={handleImposterBlur}
          />
        </label>

        <label className="field">
          <span>Category</span>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <div className="names-section">
          <h3>Player Names</h3>
          {Array.from({ length: playerCount }, (_, i) => (
            <div key={i} className="field">
              <span>Player {i + 1}</span>
              <input
                type="text"
                value={playerNames[i] ?? ""}
                onChange={(e) => handleNameChange(i, e.target.value)}
                placeholder={`Player ${i + 1}`}
              />
            </div>
          ))}
        </div>

        <button type="submit" className="btn-primary mt-lg">
          Start Game
        </button>
      </form>
    </div>
  );
}
