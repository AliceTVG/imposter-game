// src/screens/MultiHostDisplayScreen.jsx
import { useEffect, useState } from "react";
import {
  createGameLobby,
  fetchLobbyByCode,
  startGame,
  revealGame,
  updateGameCategory,
} from "../backend/lobbyApi";
import QRCode from "react-qr-code";

export default function MultiHostDisplayScreen({ categories, onBack }) {
  // setup | lobby | play | result
  const [phase, setPhase] = useState("setup");

  const [categoryIndex, setCategoryIndex] = useState(0);
  const [game, setGame] = useState(null);
  const [players, setPlayers] = useState([]);

  const [startedAtSeen, setStartedAtSeen] = useState(null);
  const [revealedAtSeen, setRevealedAtSeen] = useState(null);

  const [creating, setCreating] = useState(false);
  const [starting, setStarting] = useState(false);
  const [revealing, setRevealing] = useState(false);

  const [forceSingleImposter, setForceSingleImposter] = useState(false);
  const [error, setError] = useState("");

  const selectedCategory = categories[categoryIndex];

  const resetAll = () => {
    setPhase("setup");
    setCategoryIndex(0);
    setGame(null);
    setPlayers([]);
    setStartedAtSeen(null);
    setRevealedAtSeen(null);
    setCreating(false);
    setStarting(false);
    setRevealing(false);
    setForceSingleImposter(false);
    setError("");
  };

  const handleCloseLobby = () => {
    resetAll();
    onBack();
  };

  const handleCreate = async () => {
    setError("");
    setCreating(true);

    try {
      const createdGame = await createGameLobby({
        categoryId: selectedCategory.id,
        categoryName: selectedCategory.name,
        categoryWords: selectedCategory.words,
        forceSingleImposter,
      });

      const { game: freshGame, players } = await fetchLobbyByCode(createdGame.code);

      setGame(freshGame);
      setPlayers(players);
      setStartedAtSeen(freshGame.started_at || null);
      setRevealedAtSeen(freshGame.revealed_at || null);
      setPhase("lobby");
    } catch (e) {
      console.error(e);
      setError(
        `Could not create game: ${e?.message || e?.error_description || "Unknown error"}`
      );
    } finally {
      setCreating(false);
    }
  };

  const handleStartGame = async () => {
    if (!game) return;
    setStarting(true);
    setError("");

    try {
      await startGame(game.code);
      // polling will move to play when started_at changes
    } catch (e) {
      console.error(e);
      setError("Could not start game. Please try again.");
    } finally {
      setStarting(false);
    }
  };

  const handleReveal = async () => {
    if (!game) return;
    setRevealing(true);
    setError("");

    try {
      await revealGame(game.code);
      // polling will move to result when revealed_at changes
    } catch (e) {
      console.error(e);
      setError("Could not reveal result. Please try again.");
    } finally {
      setRevealing(false);
    }
  };

  // Poll in lobby: update players list and move to play when started_at flips
  useEffect(() => {
    if (phase !== "lobby" || !game) return;

    let cancelled = false;

    const tick = async () => {
      try {
        const { game: freshGame, players } = await fetchLobbyByCode(game.code);
        if (cancelled) return;

        setGame(freshGame);
        setPlayers(players);

        if (freshGame.started_at && freshGame.started_at !== startedAtSeen) {
          setStartedAtSeen(freshGame.started_at);
          setPhase("play");
        }
      } catch (e) {
        console.error(e);
      }
    };

    tick();
    const id = setInterval(tick, 1500);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [phase, game, startedAtSeen]);

  // Poll in play: when revealed_at flips, move to result
  useEffect(() => {
    if (phase !== "play" || !game) return;

    let cancelled = false;

    const tick = async () => {
      try {
        const { game: freshGame, players } = await fetchLobbyByCode(game.code);
        if (cancelled) return;

        setGame(freshGame);
        setPlayers(players);

        if (freshGame.revealed_at && freshGame.revealed_at !== revealedAtSeen) {
          setRevealedAtSeen(freshGame.revealed_at);
          setPhase("result");
        }
      } catch (e) {
        console.error(e);
      }
    };

    tick();
    const id = setInterval(tick, 1500);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [phase, game, revealedAtSeen]);

  // ----- RENDER -----

  if (phase === "setup") {
    return (
      <div className="screen-centered">
        <button className="btn-text screen-header-left" onClick={onBack}>
          ← Back
        </button>

        <h1>Host Display</h1>

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

        <div className="card card-narrow mt-lg form-card">
          <div className="form-group">
            <label className="label">Category</label>
            <select
              className="input-text"
              value={categoryIndex}
              onChange={(e) => setCategoryIndex(Number(e.target.value))}
            >
              {categories.map((cat, idx) => (
                <option key={cat.id} value={idx}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          {/* iOS-style toggle (same one you added on the other host screen) */}
          <div className="field">
            <span>Imposter settings</span>

            <div className="toggle-row">
              <div className="toggle-text">
                <div className="toggle-title">Only 1 imposter?</div>
                <div className="toggle-subtitle">
                  If off, the game auto-picks roughly 25% of players as imposters.
                </div>
              </div>

              <label className="switch" aria-label="Only 1 imposter">
                <input
                  type="checkbox"
                  checked={forceSingleImposter}
                  onChange={(e) => setForceSingleImposter(e.target.checked)}
                />
                <span className="slider" />
              </label>
            </div>
          </div>

          <button
            className="btn-primary btn-full mt-lg"
            onClick={handleCreate}
            disabled={creating}
          >
            {creating ? "Creating..." : "Create lobby"}
          </button>
        </div>
      </div>
    );
  }

  if (phase === "lobby" && game) {
    const readyPlayers = players.filter((p) => p.ready_for_next_round);
    const canStart = readyPlayers.length >= 3;

    const origin = window.location.origin;
    const joinUrl = `${origin}/?join=${game.code}`;

    return (
      <div className="screen-tv">
        <button className="btn-text screen-header-left" onClick={handleCloseLobby}>
          ← Close lobby
        </button>

        <h1>Lobby</h1>

        {error && (
          <div className="alert alert-error" style={{ maxWidth: 760 }}>
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

        <div className="tv-lobby-grid">
          <div className="card">
            <div className="tv-section-title">Game Code</div>
            <div className="tv-code">{game.code}</div>

            <div className="qr-wrapper" style={{ justifyContent: "center" }}>
              <QRCode value={joinUrl} size={260} bgColor="transparent" fgColor="#f9fafb" />
            </div>

            <p className="qr-url">{joinUrl.replace(/^https?:\/\//, "")}</p>

            <div className="field" style={{ marginTop: "1rem" }}>
                <span>Category</span>

                <select
                    value={String(game.category_id ?? selectedCategory?.id ?? "")}
                    onChange={async (e) => {
                    const nextId = e.target.value;
                    const next = categories.find((c) => String(c.id) === nextId);
                    if (!next) return;

                    try {
                        setError("");
                        const updated = await updateGameCategory(game.code, {
                        categoryId: next.id,
                        categoryName: next.name,
                        categoryWords: next.words,
                        });
                        setGame(updated);
                    } catch (err) {
                        console.error(err);
                        setError("Could not change category.");
                    }
                    }}
                >
                    {categories.map((c) => (
                    <option key={c.id} value={String(c.id)}>
                        {c.name}
                    </option>
                    ))}
                </select>
            </div>

            <p style={{ marginTop: "0.75rem", fontSize: "0.9rem", opacity: 0.85 }}>
              Ready: <strong>{readyPlayers.length}</strong> / {players.length}
            </p>
          </div>

          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
              <h2 style={{ margin: 0 }}>Players</h2>
              <div style={{ opacity: 0.8 }}>{players.length}</div>
            </div>

            <ul className="player-list-tv">
              {players.map((p) => (
                <li className="player-pill" key={p.id}>
                  <span>{p.name}</span>
                  <span style={{ opacity: 0.75, fontSize: "0.85rem" }}>
                    {p.ready_for_next_round ? "Ready" : "Not ready"}
                  </span>
                </li>
              ))}
            </ul>

            <div className="tv-action-row">
              <button
                className="btn-primary"
                onClick={handleStartGame}
                disabled={!canStart || starting}
              >
                {starting ? "Starting..." : "Start round"}
              </button>
            </div>

            {!canStart && (
              <p style={{ marginTop: "0.6rem", fontSize: "0.9rem", opacity: 0.8 }}>
                Need at least 3 ready players to start.
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (phase === "play" && game) {
    return (
      <div className="screen-tv">
        <button className="btn-text screen-header-left" onClick={handleCloseLobby}>
          ← Close lobby
        </button>

        <h1>Round in progress</h1>

        <div className="card" style={{ maxWidth: 760 }}>
          <p className="hint">
            Players are discussing. When you’re ready, reveal the result for everyone.
          </p>

          <button
            className="btn-primary btn-full mt-lg"
            onClick={handleReveal}
            disabled={revealing}
          >
            {revealing ? "Revealing..." : "Reveal result"}
          </button>
        </div>
      </div>
    );
  }

  if (phase === "result" && game) {
    return (
      <div className="screen-tv">
        <button className="btn-text screen-header-left" onClick={handleCloseLobby}>
          ← Close lobby
        </button>

        <h1>Result</h1>

        <div className="card" style={{ maxWidth: 760 }}>
          <p className="hint">
            This screen can show the word + imposters if your backend returns them after
            reveal. Right now it’s just the “round ended” state.
          </p>

          <button className="btn-secondary btn-full mt-lg" onClick={() => setPhase("lobby")}>
            Back to lobby
          </button>
        </div>
      </div>
    );
  }

  return null;
}
