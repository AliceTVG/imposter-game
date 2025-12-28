// src/screens/MultiHostScreen.jsx
import { useEffect, useMemo, useState } from "react";
import {
  createGameLobby,
  fetchLobbyByCode,
  startGame,
  joinGame,
  revealGame,
  leaveGame,
  setPlayerReady,
  setGameHost,
  updateGameCategory,
  kickPlayer,
  touchPlayer,
  pruneInactivePlayers,
} from "../backend/lobbyApi";
import {
  computeMultiDeviceOutcome,
  computeMultiDeviceRoleForPlayer,
} from "../game/multiDeviceEngine";
import QRCode from "react-qr-code";

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
  const [requireChatClue, setRequireChatClue] = useState(false)

  const [error, setError] = useState("");

  const selectedCategory = categories[categoryIndex];

  const currentLobbyCategory = useMemo(() => {
    if (!game) return selectedCategory;

    // Prefer a local category match by id
    const local = categories.find((c) => c.id === game.category_id);
    if (local) return local;

    // Fallback to whatever is stored on the game row
    if (game.category_name && Array.isArray(game.category_words)) {
      return {
        id: game.category_id,
        name: game.category_name,
        words: game.category_words,
      };
    }

    return selectedCategory;
  }, [game, selectedCategory, categories]);

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
    setForceSingleImposter(false);
    setRequireChatClue(false);
    setError("");
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
      setError("Please enter your name to host a game.");
      return;
    }

    setCreating(true);
    setError("");

    try {
      const createdGame = await createGameLobby({
        categoryId: selectedCategory.id,
        categoryName: selectedCategory.name,
        categoryWords: selectedCategory.words,
        forceSingleImposter,
        requireChatClue,
      });

      const { game, player } = await joinGame({
        code: createdGame.code,
        name: trimmedName,
      });

      const updatedGame = await setGameHost(game.id, player.id);

      const { players } = await fetchLobbyByCode(createdGame.code);

      setGame(updatedGame);
      setHostPlayer(player);
      setPlayers(players);
      setStartedAtSeen(updatedGame.started_at || null);
      setRevealedAtSeen(updatedGame.revealed_at || null);
      setPhase("lobby");
    } catch (e) {
      console.error(e);
      setError(
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
    setError("");
    try {
      await startGame(game.code);
      // started_at picked up by polling effect
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
      // revealed_at picked up by polling
    } catch (e) {
      console.error(e);
      setError("Could not reveal result. Please try again.");
    } finally {
      setRevealing(false);
    }
  };

  // Host heartbeat so they don't get pruned
  useEffect(() => {
    if (!hostPlayer?.id) return;
    if (phase === "setup") return;

    let cancelled = false;

    const ping = async () => {
      try {
        await touchPlayer(hostPlayer.id);
      } catch (e) {
        console.error("host touchPlayer failed", e);
      }
    };

    ping();
    const id = setInterval(() => {
      if (!cancelled) ping();
    }, 30000);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [hostPlayer?.id, phase]);

  // Poll in lobby: update players list and move to role when started_at flips
  useEffect(() => {
    if (phase !== "lobby" || !game || !hostPlayer) return;

    let cancelled = false;
    let lastPrune = 0;

    const tick = async () => {
      try {
        const { game: freshGame, players } = await fetchLobbyByCode(game.code);
        if (cancelled) return;

        setGame(freshGame);
        setPlayers(players);

        // prune inactive players every ~10s to keep it light
        const now = Date.now();
        if (now - lastPrune > 10000) {
          lastPrune = now;
          try {
            await pruneInactivePlayers(freshGame.id, 120);
          } catch (e) {
            console.error("pruneInactivePlayers failed", e);
          }
        }

        if (freshGame.started_at && freshGame.started_at !== startedAtSeen) {
          setStartedAtSeen(freshGame.started_at);

          const readyPlayers = players.filter((p) => p.ready_for_next_round);

          const categoryFromGame = {
            id: freshGame.category_id,
            name: freshGame.category_name,
            words: freshGame.category_words,
          };

          const outcome = computeMultiDeviceOutcome({
            code: freshGame.code,
            players: readyPlayers,
            category: categoryFromGame,
            minImposters: 1,
            maxImposters: freshGame.force_single_imposter ? 1 : undefined,
            roundKey: freshGame.started_at,
          });

          const myRole = computeMultiDeviceRoleForPlayer(outcome, hostPlayer.id);

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
  }, [phase, game, hostPlayer, startedAtSeen]);

  // Poll in play phase: when revealed_at flips, move to result
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

  // ----- RENDER PHASES -----

  // Setup screen
  if (phase === "setup") {
    return (
      <div className="screen-centered">
        <button className="btn-text screen-header-left" onClick={onBack}>
          ← Back
        </button>

        <h1>Host Game</h1>

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

          <div className="form-group">
            <label className="label">Your name (host)</label>
            <input
              className="input-text"
              value={hostName}
              onChange={(e) => setHostName(e.target.value)}
              placeholder="e.g. Alice"
            />
          </div>

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
          <div className="field">
            <span>Chat settings</span>

            <div className="toggle-row">
              <div className="toggle-text">
                <div className="toggle-title">Require chat?</div>
                  <div className="toggle-subtitle">
                    If on, everyone must send at least one chat message during discussion before the host can reveal results.
                  </div>
              </div>
              <label className="switch" aria-label="Require chat clue">
                <input
                  type="checkbox"
                  checked={requireChatClue}
                  onChange={(e) => setRequireChatClue(e.target.checked)}
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

  // Lobby screen
  if (phase === "lobby" && game && currentLobbyCategory) {
    const readyPlayers = players.filter((p) => p.ready_for_next_round);
    const canStart = readyPlayers.length >= 3;
    const origin = window.location.origin;
    const joinUrl = `${origin}/?join=${game.code}`;

    return (
      <div className="screen-centered">
        <button className="btn-text screen-header-left" onClick={handleLeaveCompletely}>
          ← Close lobby
        </button>

        <h1>Lobby</h1>

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

          <div className="form-group" style={{ marginTop: "0.75rem" }}>
            <label className="label">Category (change in lobby)</label>
            <select
              className="input-text"
              value={currentLobbyCategory.id}
              onChange={async (e) => {
                const nextId = e.target.value;
                const next = categories.find((c) => c.id === nextId);
                if (!next) return;
                try {
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
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <p style={{ marginTop: "0.5rem" }}>
            Ask everyone to open <strong>Multi-device → Join with a code</strong> and enter
            this code and their name.
          </p>

          <div style={{ textAlign: "center" }}>
            <p style={{ fontSize: "0.9rem", marginBottom: "0.5rem" }}>
              Or let players scan this to join:
            </p>
            <div className="qr-wrapper">
              <QRCode value={joinUrl} size={180} bgColor="transparent" fgColor="#f9fafb" />
            </div>
            <p className="qr-url" style={{ marginTop: "0.5rem" }}>
              {joinUrl.replace(/^https?:\/\//, "")}
            </p>
          </div>

          {players.length > 0 && (
            <>
              <p className="label" style={{ marginTop: "1rem" }}>
                Players in lobby
              </p>

              <ul className="player-list">
                {players.map((p) => (
                  <li
                    key={p.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: "0.75rem",
                    }}
                  >
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.name}
                      {hostPlayer && p.id === hostPlayer.id ? " (you)" : ""}
                    </span>

                    {hostPlayer?.id !== p.id && (
                      <button
                        type="button"
                        className="btn-text"
                        onClick={async () => {
                          try {
                            await kickPlayer(p.id);
                          } catch (e) {
                            console.error(e);
                            setError("Could not kick player.");
                          }
                        }}
                      >
                        Kick
                      </button>
                    )}
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

          <p style={{ marginTop: "0.5rem", fontSize: "0.9rem", opacity: 0.8 }}>
            Ready players: {readyPlayers.length} / {players.length}
          </p>
        </div>
      </div>
    );
  }

  // Role screen for host
  if (phase === "role" && currentLobbyCategory && roleData) {
    const { isImposter, word } = roleData;

    return (
      <div className="screen-centered">
        <button className="btn-text screen-header-left" onClick={handleLeaveCompletely}>
          ← Leave game
        </button>

        <h1>Your role (host)</h1>

        <div className="card card-narrow mt-lg role-card">
          {isImposter ? (
            <>
              <p className="role-label">You are the</p>
              <p className="role-primary">IMPOSTER</p>
              <p className="role-sub">
                Blend in and try to guess the secret word from everyone else&apos;s clues.
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

          <button className="btn-primary btn-full mt-lg" onClick={() => setPhase("play")}>
            Continue to discussion
          </button>
        </div>
      </div>
    );
  }

  // Play screen for host
  if (phase === "play" && currentLobbyCategory && roleData) {
    return (
      <div className="screen-centered">
        <button className="btn-text screen-header-left" onClick={handleLeaveCompletely}>
          ← End game
        </button>

        <h2>Discussion phase (host)</h2>

        <div className="card card-narrow mt-lg">
          <p>
            Let everyone take turns giving clues and guessing. When the round is over, tap the
            button below to reveal the result on all devices.
          </p>

          <button className="btn-secondary btn-full mt-lg" onClick={() => setPhase("role")}>
            View my role again
          </button>

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
  if (phase === "result" && currentLobbyCategory && roleData) {
    const imposterPlayers = players.filter((p) => roleData.imposters?.includes(p.id));

    return (
      <div className="screen-centered">
        <button className="btn-text screen-header-left" onClick={handleLeaveCompletely}>
          ← Back to menu
        </button>

        <h2>Result</h2>

        <div className="card card-narrow mt-lg">
          <p>
            The secret word was{" "}
            <strong>
              {roleData.word} ({currentLobbyCategory.name})
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

            <button className="btn-secondary btn-full" onClick={handleLeaveCompletely}>
              Back to multi-device menu
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
