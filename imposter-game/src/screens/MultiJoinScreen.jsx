import { useEffect, useMemo, useState } from "react";
import {
  joinGame,
  fetchLobbyByCode,
  leaveGame,
  setPlayerReady,
  startGame,
  revealGame,
  touchPlayer,
} from "../backend/lobbyApi";
import {
  computeMultiDeviceOutcome,
  computeMultiDeviceRoleForPlayer,
} from "../game/multiDeviceEngine";

export default function MultiJoinScreen({ categories, onBack, initialCode = "" }) {
  // form | waiting | role | play | result | kicked
  const [phase, setPhase] = useState("form");

  const [code, setCode] = useState(initialCode);
  const [name, setName] = useState("");

  const [joinedGame, setJoinedGame] = useState(null);
  const [player, setPlayer] = useState(null);
  const [players, setPlayers] = useState([]);

  const [category, setCategory] = useState(null);
  const [roleData, setRoleData] = useState(null);

  const [startedAtSeen, setStartedAtSeen] = useState(null);
  const [revealedAtSeen, setRevealedAtSeen] = useState(null);

  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");

  const iAmHost = useMemo(() => {
    if (!joinedGame || !player) return false;
    return joinedGame.host_player_id === player.id;
  }, [joinedGame, player]);

  const hardResetToMenu = () => {
    setPhase("form");
    setJoinedGame(null);
    setPlayer(null);
    setPlayers([]);
    setRoleData(null);
    setCategory(null);
    setStartedAtSeen(null);
    setRevealedAtSeen(null);
    setError("");
    onBack();
  };

  const leaveCompletely = async () => {
    try {
      if (player?.id) await leaveGame(player.id);
    } catch (e) {
      console.error(e);
    } finally {
      hardResetToMenu();
    }
  };

  const handleJoin = async () => {
    const trimmedCode = code.trim();
    const trimmedName = name.trim();
    if (!trimmedCode || !trimmedName) {
      setError("Please enter a code and name.");
      return;
    }

    setJoining(true);
    setError("");

    try {
      const { game, player } = await joinGame({
        code: trimmedCode,
        name: trimmedName,
      });

      const { players: lobbyPlayers } = await fetchLobbyByCode(game.code);

      const localCat = categories.find((c) => c.id === game.category_id);
      const categoryFromGame =
        game.category_name && Array.isArray(game.category_words)
          ? { id: game.category_id, name: game.category_name, words: game.category_words }
          : null;

      setCategory(localCat || categoryFromGame);
      setJoinedGame(game);
      setPlayer(player);
      setPlayers(lobbyPlayers);

      setStartedAtSeen(game.started_at || null);
      setRevealedAtSeen(game.revealed_at || null);

      setPhase("waiting");
    } catch (e) {
      console.error(e);
      setError(e?.message || "Could not join game.");
    } finally {
      setJoining(false);
    }
  };

  const checkKicked = (freshPlayers) => {
    if (!player?.id) return false;
    const stillHere = freshPlayers.some((p) => p.id === player.id);
    if (!stillHere) {
      setPhase("kicked");
      return true;
    }
    return false;
  };

  // Waiting poll: lobby updates + started_at => role
  useEffect(() => {
    if (phase !== "waiting" || !joinedGame || !category || !player) return;

    let cancelled = false;

    const tick = async () => {
      try {
        const { game, players } = await fetchLobbyByCode(joinedGame.code);
        if (cancelled) return;

        setJoinedGame(game);
        setPlayers(players);

        if (checkKicked(players)) return;

        // keep category in sync
        const localCat = categories.find((c) => c.id === game.category_id);
        const categoryFromGame =
          game.category_name && Array.isArray(game.category_words)
            ? { id: game.category_id, name: game.category_name, words: game.category_words }
            : null;

        const categoryForRound = localCat || categoryFromGame || category;
        if (categoryForRound && categoryForRound.id !== category.id) {
          setCategory(categoryForRound);
        }

        if (game.started_at && game.started_at !== startedAtSeen) {
          setStartedAtSeen(game.started_at);

          const readyPlayers = players.filter((p) => p.ready_for_next_round);

          const outcome = computeMultiDeviceOutcome({
            code: joinedGame.code,
            players: readyPlayers,
            category: categoryForRound,
            minImposters: 1,
            maxImposters: game.force_single_imposter ? 1 : undefined,
            roundKey: game.started_at,
          });

          const myRole = computeMultiDeviceRoleForPlayer(outcome, player.id);

          setRoleData({ ...myRole, imposters: outcome.imposters });
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
  }, [phase, joinedGame, category, categories, player, startedAtSeen]);

  // Heartbeat
  useEffect(() => {
    if (!player?.id) return;
    if (phase === "form" || phase === "kicked") return;

    let cancelled = false;

    const ping = async () => {
      try {
        await touchPlayer(player.id);
      } catch (e) {
        console.error("touchPlayer failed", e);
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
  }, [player?.id, phase]);

  // Play poll: reveal => result + kicked detection
  useEffect(() => {
    if (phase !== "play" || !joinedGame) return;

    let cancelled = false;

    const tick = async () => {
      try {
        const { game, players } = await fetchLobbyByCode(joinedGame.code);
        if (cancelled) return;

        setJoinedGame(game);
        setPlayers(players);

        if (checkKicked(players)) return;

        if (game.revealed_at && game.revealed_at !== revealedAtSeen) {
          setRevealedAtSeen(game.revealed_at);
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
  }, [phase, joinedGame, revealedAtSeen]);

  // --- RENDER ---

  if (phase === "kicked") {
    return (
      <div className="screen-centered">
        <h1>Removed from lobby</h1>
        <div className="card card-narrow">
          <p>You were removed by the host (or the lobby timed you out).</p>
          <button className="btn-primary mt-lg" onClick={hardResetToMenu}>
            Back to menu
          </button>
        </div>
      </div>
    );
  }

  if (phase === "form") {
    return (
      <div className="screen-centered">
        <button className="btn-text screen-header-left" onClick={onBack}>
          ← Back
        </button>

        <h1>Join game</h1>

        {error && (
          <div className="card" style={{ borderColor: "rgba(248,113,113,0.35)" }}>
            ⚠️ {error}
          </div>
        )}

        <div className="card card-narrow mt-lg">
          <div className="field">
            <span>Lobby code</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. 4Q7K9P"
            />
          </div>

          <div className="field">
            <span>Your name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Alice" />
          </div>

          <button className="btn-primary mt-lg" onClick={handleJoin} disabled={joining}>
            {joining ? "Joining..." : "Join lobby"}
          </button>
        </div>
      </div>
    );
  }

  if (phase === "waiting" && joinedGame && category) {
    const readyPlayers = players.filter((p) => p.ready_for_next_round);
    const canStart = readyPlayers.length >= 3;

    return (
      <div className="screen-centered">
        <button className="btn-text screen-header-left" onClick={leaveCompletely}>
          ← Leave lobby
        </button>

        <h1>Waiting for host</h1>

        <div className="card card-narrow mt-lg">
          <div className="hint">Game code</div>
          <div style={{ fontSize: "1.8rem", fontWeight: 800, letterSpacing: "0.3em" }}>
            {joinedGame.code}
          </div>

          <p style={{ marginTop: "0.75rem" }}>
            Category: <strong>{category.name}</strong>
          </p>

          {players.length > 0 && (
            <>
              <div className="hint" style={{ marginTop: "1rem" }}>
                Players
              </div>
              <ul style={{ textAlign: "left" }}>
                {players.map((p) => (
                  <li key={p.id}>
                    {p.name}
                    {player && p.id === player.id ? " (you)" : ""}
                    {joinedGame.host_player_id === p.id ? " (host)" : ""}
                  </li>
                ))}
              </ul>
            </>
          )}

          {iAmHost && (
            <>
              <button
                className="btn-primary mt-lg"
                onClick={async () => {
                  try {
                    await startGame(joinedGame.code);
                  } catch (e) {
                    console.error(e);
                  }
                }}
                disabled={!canStart}
              >
                Start game (host)
              </button>
              <div className="hint" style={{ marginTop: "0.5rem" }}>
                Ready: {readyPlayers.length} / {players.length}
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  if (phase === "role" && category && roleData) {
    return (
      <div className="screen-centered">
        <button className="btn-text screen-header-left" onClick={leaveCompletely}>
          ← Leave game
        </button>

        <h1>Your role</h1>

        <div className="card card-narrow mt-lg">
          {roleData.isImposter ? (
            <>
              <div className="hint">You are the</div>
              <h2 style={{ margin: "0.25rem 0" }}>IMPOSTER</h2>
              <div className="hint">Try to guess the secret word.</div>
            </>
          ) : (
            <>
              <div className="hint">The secret word is</div>
              <h2 style={{ margin: "0.25rem 0" }}>{roleData.word}</h2>
              <div className="hint">Give clues without giving it away.</div>
            </>
          )}

          <button className="btn-primary mt-lg" onClick={() => setPhase("play")}>
            Continue to discussion
          </button>
        </div>
      </div>
    );
  }

  if (phase === "play" && category && roleData) {
    return (
      <div className="screen-centered">
        <button className="btn-text screen-header-left" onClick={leaveCompletely}>
          ← Leave game
        </button>

        <h2>Discussion phase</h2>

        <div className="card card-narrow mt-lg">
          <p>Discuss clues in real life. This screen updates when the host reveals.</p>

          <button className="btn-secondary mt-lg" onClick={() => setPhase("role")}>
            View my role again
          </button>

          {iAmHost && (
            <button
              className="btn-primary mt"
              onClick={async () => {
                try {
                  await revealGame(joinedGame.code);
                } catch (e) {
                  console.error(e);
                }
              }}
            >
              Reveal result (host)
            </button>
          )}
        </div>
      </div>
    );
  }

  if (phase === "result" && category && roleData && joinedGame) {
    const imposterPlayers = players.filter((p) => roleData.imposters?.includes(p.id));

    return (
      <div className="screen-centered">
        <button className="btn-text screen-header-left" onClick={leaveCompletely}>
          ← Back
        </button>

        <h2>Result</h2>

        <div className="card card-narrow mt-lg">
          <p>
            The secret word was <strong>{roleData.word}</strong>.
          </p>

          <h3 style={{ marginTop: "1rem" }}>Imposters</h3>
          <ul style={{ listStyle: "none", paddingLeft: 0, textAlign: "left" }}>
            {imposterPlayers.map((p) => (
              <li key={p.id}>{p.name}</li>
            ))}
          </ul>

          <button
            className="btn-primary mt-lg"
            onClick={async () => {
              try {
                if (player?.id) await setPlayerReady(player.id, true);
              } catch (e) {
                console.error(e);
              }
              setPhase("waiting");
              setRoleData(null);
            }}
          >
            Play again
          </button>
        </div>
      </div>
    );
  }

  return null;
}
