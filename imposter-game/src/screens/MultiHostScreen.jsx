// src/screens/MultiHostScreen.jsx
import { useEffect, useState } from "react";
import {
  createGameLobby,
  fetchLobbyByCode,
  startGame,
  joinGame,
  revealGame,
  leaveGame,
  setPlayerReady,
  setGameHost,
} from "../backend/lobbyApi";
import {
  computeMultiDeviceOutcome,
  computeMultiDeviceRoleForPlayer,
} from "../game/multiDeviceEngine";

export default function MultiHostScreen({ categories, onBack }) {
  // setup | lobby | role | play | result
  const [phase, setPhase] = useState("setup");

  const [categoryIndex, setCategoryIndex] = useState(0);
  const [hostName, setHostName] = useState("");

  const [game, setGame] = useState(null);
  const [hostPlayer, setHostPlayer] = useState(null);
  const [players, setPlayers] = useState([]);

  const [roleData, setRoleData] = useState(null);

  const [startedAtSeen, setStartedAtSeen] = useState(null);
  const [revealedAtSeen, setRevealedAtSeen] = useState(null);

  const [creating, setCreating] = useState(false);
  const [starting, setStarting] = useState(false);
  const [revealing, setRevealing] = useState(false);

  const [forceSingleImposter, setForceSingleImposter] = useState(false);

  const selectedCategory = categories[categoryIndex];

  const resetAll = () => {
    setPhase("setup");
    setCategoryIndex(0);
    setHostName("");
    setGame(null);
    setHostPlayer(null);
    setPlayers([]);
    setRoleData(null);
    setStartedAtSeen(null);
    setRevealedAtSeen(null);
    setCreating(false);
    setStarting(false);
    setRevealing(false);
  };

  const handleLeaveCompletely = async () => {
    try {
      if (hostPlayer?.id) {
        await leaveGame(hostPlayer.id);
      }
    } catch (e) {
      console.error("leaveGame failed", e);
    } finally {
      resetAll();
      onBack();
    }
  };

  const handleCreate = async () => {
    const trimmedName = hostName.trim();
    if (!trimmedName) {
      alert("Please enter your name to host a game.");
      return;
    }

    setCreating(true);
    try {
      const createdGame = await createGameLobby({
        categoryId: selectedCategory.id,
        categoryName: selectedCategory.name,
        categoryWords: selectedCategory.words,
        forceSingleImposter,
      });

      const { game, player } = await joinGame({
        code: createdGame.code,
        name: trimmedName,
      });

      const updatedGame = await setGameHost(game.id, player.id);

      const { players } = await fetchLobbyByCode(createdGame.code);

      setGame(game);
      setHostPlayer(player);
      setPlayers(players);
      setStartedAtSeen(updatedGame.started_at || null);
      setRevealedAtSeen(updatedGame.revealed_at || null);
      setPhase("lobby");
    } catch (e) {
      console.error(e);
      alert(
        `Could not create game: ${
            e?.message || e?.error_description || "Unknown error"
        }`
      );
    } finally {
      setCreating(false);
    }
  };

  const handleStartGame = async () => {
    if (!game) return;
    setStarting(true);
    try {
      await startGame(game.code);
      // started_at will be picked up by the lobby polling effect
    } catch (e) {
      console.error(e);
      alert("Could not start game. Please try again.");
    } finally {
      setStarting(false);
    }
  };

  const handleReveal = async () => {
    if (!game) return;
    setRevealing(true);
    try {
      await revealGame(game.code);
      // revealed_at will be picked up by the play polling effect
    } catch (e) {
      console.error(e);
      alert("Could not reveal result. Please try again.");
    } finally {
      setRevealing(false);
    }
  };

  // Poll in lobby: update players list and move to role when started_at flips
  useEffect(() => {
    if (phase !== "lobby" || !game || !selectedCategory || !hostPlayer) return;

    let cancelled = false;

    const tick = async () => {
      try {
        const { game: freshGame, players } = await fetchLobbyByCode(game.code);
        if (cancelled) return;

        setPlayers(players);

        if (freshGame.started_at && freshGame.started_at !== startedAtSeen) {
          setStartedAtSeen(freshGame.started_at);

          const readyPlayers = players.filter((p) => p.ready_for_next_round);

          const categoryFromGame = {
            id: freshGame.category_id,
            name: freshGame.category_name,
            words: freshGame.category_words,
          }

          const outcome = computeMultiDeviceOutcome({
            code: freshGame.code,
            players: readyPlayers,
            category: categoryFromGame,
            minImposters: 1,
            maxImposters: freshGame.force_single_imposter ? 1 : undefined,
            roundKey: freshGame.started_at,
          });

          const myRole = computeMultiDeviceRoleForPlayer(
            outcome,
            hostPlayer.id
          );

          setRoleData({
            ...myRole,
            imposters: outcome.imposters,
          });

          setPhase("role");
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
  }, [phase, game, selectedCategory, hostPlayer, startedAtSeen]);

  // Poll in play phase: when revealed_at flips, move to result
  useEffect(() => {
    if (phase !== "play" || !game) return;

    let cancelled = false;

    const tick = async () => {
      try {
        const { game: freshGame, players } = await fetchLobbyByCode(game.code);
        if (cancelled) return;

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

  // ----- RENDER PHASES -----

  // Setup screen
  if (phase === "setup") {
    return (
      <div className="screen-centered">
        <button className="btn-text screen-header-left" onClick={onBack}>
          ← Back
        </button>

        <h1>Host Game</h1>

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

          <div className="form-group">
            <label className="label">Your name (host)</label>
            <input
              className="input-text"
              value={hostName}
              onChange={(e) => setHostName(e.target.value)}
              placeholder="e.g. Alice"
            />
          </div>
          <div className="form-group">
            <label className="label">Imposter settings</label>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <input
                    type="checkbox"
                    checked={forceSingleImposter}
                    onChange={(e) => setForceSingleImposter(e.target.checked)}
                />
                <span>Only 1 imposter?</span>
            </div>
            <p className="hint" style={{ marginTop: "0.35rem" }}>
                If unchecked, the game will auto-pick roughly 25% of players as imposters.
            </p>
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

  // Lobby screen
  if (phase === "lobby" && game && selectedCategory) {
    const readyPlayers = players.filter((p) => p.ready_for_next_round);
    const canStart = readyPlayers.length >= 3;
    return (
      <div className="screen-centered">
        <button
          className="btn-text screen-header-left"
          onClick={handleLeaveCompletely}
        >
          ← Close lobby
        </button>

        <h1>Lobby</h1>

        <div className="card card-narrow mt-lg form-card">
          <label className="label">Game code</label>
          <p
            style={{
              fontSize: "1.8rem",
              fontWeight: 700,
              letterSpacing: "0.3em",
              marginBottom: "0.5rem",
            }}
          >
            {game.code}
          </p>

          <p>
            Category: <strong>{selectedCategory.name}</strong>
          </p>

          <p style={{ marginTop: "0.5rem" }}>
            Ask everyone to open <strong>Multi-device → Join with a code</strong>{" "}
            and enter this code and their name.
          </p>

          {players.length > 0 && (
            <>
              <p className="label" style={{ marginTop: "1rem" }}>
                Players in lobby
              </p>
              <ul className="player-list">
                {players.map((p) => (
                  <li key={p.id}>
                    {p.name}
                    {hostPlayer && p.id === hostPlayer.id ? " (you)" : ""}
                  </li>
                ))}
              </ul>
            </>
          )}

          <button
            className="btn-primary btn-full mt-lg"
            onClick={handleStartGame}
            disabled={!canStart || starting}
          >
            {starting ? "Starting..." : "Start game"}
          </button>

          <p
            style={{
              marginTop: "0.5rem",
              fontSize: "0.9rem",
              opacity: 0.8,
            }}
          >
            Ready players: {readyPlayers.length} / {players.length}
          </p>
        </div>
      </div>
    );
  }

  // Role screen for host
  if (phase === "role" && selectedCategory && roleData) {
    const { isImposter, word } = roleData;

    return (
      <div className="screen-centered">
        <button
          className="btn-text screen-header-left"
          onClick={handleLeaveCompletely}
        >
          ← Leave game
        </button>

        <h1>Your role (host)</h1>

        <div className="card card-narrow mt-lg role-card">
          {isImposter ? (
            <>
              <p className="role-label">You are the</p>
              <p className="role-primary">IMPOSTER</p>
              <p className="role-sub">
                Blend in and try to guess the secret word from everyone
                else&apos;s clues.
              </p>
            </>
          ) : (
            <>
              <p className="role-label">The secret word is:</p>
              <p className="role-primary">{word}</p>
              <p className="role-sub">
                Describe it without giving it away to the imposter.
              </p>
            </>
          )}

          <button
            className="btn-primary btn-full mt-lg"
            onClick={() => setPhase("play")}
          >
            Continue to discussion
          </button>
        </div>
      </div>
    );
  }

  // Play screen for host
  if (phase === "play" && selectedCategory && roleData) {
    return (
      <div className="screen-centered">
        <button
          className="btn-text screen-header-left"
          onClick={handleLeaveCompletely}
        >
          ← End game
        </button>

        <h2>Discussion phase (host)</h2>

        <div className="card card-narrow mt-lg">
          <p>
            Let everyone take turns giving clues and guessing. When the round is
            over, tap the button below to reveal the result on all devices.
          </p>

          <button
            className="btn-primary btn-full mt-lg"
            onClick={handleReveal}
            disabled={revealing}
          >
            {revealing ? "Revealing..." : "Reveal result to everyone"}
          </button>
        </div>
      </div>
    );
  }

  // Result screen for host
  if (phase === "result" && selectedCategory && roleData) {
    const imposterPlayers = players.filter((p) =>
      roleData.imposters?.includes(p.id)
    );

    return (
      <div className="screen-centered">
        <button
          className="btn-text screen-header-left"
          onClick={handleLeaveCompletely}
        >
          ← Back to menu
        </button>

        <h2>Result</h2>

        <div className="card card-narrow mt-lg">
          <p>
            The secret word was{" "}
            <strong>
              {roleData.word} ({selectedCategory.name})
            </strong>
            .
          </p>

          <h3 style={{ marginTop: "1rem" }}>Imposters</h3>
          <ul
            style={{
              listStyle: "none",
              paddingLeft: 0,
              marginTop: "0.5rem",
              textAlign: "left",
            }}
          >
            {imposterPlayers.map((p) => (
              <li key={p.id}>{p.name}</li>
            ))}
          </ul>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.5rem",
              marginTop: "1.25rem",
            }}
          >
            <button
                className="btn-primary btn-full"
                onClick={async () => {
                    try {
                        if (hostPlayer?.id) {
                            await setPlayerReady(hostPlayer.id, true);
                        }
                    } catch (e) {
                        console.error(e);
                    }
                    setPhase("lobby");
                    setRoleData(null);
                }}
            >
                Play again with this lobby
            </button>
            <button
              className="btn-secondary btn-full"
              onClick={handleLeaveCompletely}
            >
              Back to multi-device menu
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
