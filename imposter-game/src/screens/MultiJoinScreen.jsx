import { useEffect, useState } from "react";
import { joinGame, fetchLobbyByCode, leaveGame, setPlayerReady, startGame, revealGame, } from "../backend/lobbyApi";
import {
  computeMultiDeviceOutcome,
  computeMultiDeviceRoleForPlayer,
} from "../game/multiDeviceEngine";

export default function MultiJoinScreen({ categories, onBack }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");

  // form | waiting | role | play | result
  const [phase, setPhase] = useState("form");

  const [joinedGame, setJoinedGame] = useState(null);
  const [category, setCategory] = useState(null);

  const [player, setPlayer] = useState(null);
  const [players, setPlayers] = useState([]);

  const [roleData, setRoleData] = useState(null);

  const [startedAtSeen, setStartedAtSeen] = useState(null);
  const [revealedAtSeen, setRevealedAtSeen] = useState(null);

  const [loading, setLoading] = useState(false);

  const iAmHost =
    joinedGame && player && joinedGame.host_player_id === player.id;

  const resetState = () => {
    setCode("");
    setName("");
    setPhase("form");
    setJoinedGame(null);
    setCategory(null);
    setPlayer(null);
    setPlayers([]);
    setRoleData(null);
    setStartedAtSeen(null);
    setRevealedAtSeen(null);
  };

  const leaveCompletely = async () => {
    try {
      if (player?.id) {
        await leaveGame(player.id);
      }
    } catch (e) {
      console.error("leaveGame failed", e);
    } finally {
      resetState();
      onBack();
    }
  };

  const handleJoin = async () => {
    const trimmedCode = code.trim().toUpperCase();
    const trimmedName = name.trim();

    if (!trimmedCode || !trimmedName) {
      alert("Please enter a game code and your name.");
      return;
    }

    setLoading(true);
    try {
      const { game, player } = await joinGame({
        code: trimmedCode,
        name: trimmedName,
      });

      const { players } = await fetchLobbyByCode(trimmedCode);

      const cat = categories.find((c) => c.id === game.category_id);
      if (!cat) {
        alert("This game uses a category that does not exist on this device.");
        setLoading(false);
        return;
      }

      setJoinedGame(game);
      setCategory(cat);
      setPlayer(player);
      setPlayers(players);
      setStartedAtSeen(game.started_at || null);
      setRevealedAtSeen(game.revealed_at || null);
      setPhase("waiting");
    } catch (e) {
      console.error(e);
      alert(
        "Could not join game. Make sure the host has created it and you typed the code correctly."
      );
    } finally {
      setLoading(false);
    }
  };

  // Poll while waiting: update lobby list and move to role when started_at flips
  useEffect(() => {
    if (phase !== "waiting" || !joinedGame || !category || !player) return;

    let cancelled = false;

    const tick = async () => {
      try {
        const { game, players } = await fetchLobbyByCode(joinedGame.code);
        if (cancelled) return;

        setJoinedGame(game);
        setPlayers(players);

        if (game.started_at && game.started_at !== startedAtSeen) {
          setStartedAtSeen(game.started_at);

          const readyPlayers = players.filter((p) => p.ready_for_next_round);

          const outcome = computeMultiDeviceOutcome({
            code: joinedGame.code,
            players: readyPlayers,
            category,
            roundKey: game.started_at
          });

          const myRole = computeMultiDeviceRoleForPlayer(outcome, player.id);

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
  }, [phase, joinedGame, category, player, startedAtSeen]);

  // Poll during play: when revealed_at flips, move to result
  useEffect(() => {
    if (phase !== "play" || !joinedGame) return;

    let cancelled = false;

    const tick = async () => {
      try {
        const { game, players } = await fetchLobbyByCode(joinedGame.code);
        if (cancelled) return;

        setJoinedGame(game);
        setPlayers(players);

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

  // ----- RENDER PHASES -----

  // Waiting lobby (host-style view but without Start button)
  if (phase === "waiting" && joinedGame && category) {
    const readyPlayers = players.filter((p) => p.ready_for_next_round);
    const canStart = readyPlayers.length >= 3;
    return (
      <div className="screen-centered">
        <button
          className="btn-text screen-header-left"
          onClick={leaveCompletely}
        >
          ← Leave lobby
        </button>

        <h1>Waiting for host</h1>

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
            {joinedGame.code}
          </p>

          <p>
            Category: <strong>{category.name}</strong>
          </p>

          <p style={{ marginTop: "0.5rem" }}>
            When the host starts the game, your role will appear on this
            screen.
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
                    {player && p.id === player.id ? " (you)" : ""}
                    {joinedGame?.host_player_id === p.id ? " (host)" : ""}
                  </li>
                ))}
              </ul>
            </>
          )}

          { iAmHost && (
            <>
                <button
                    className="btn-primary btn-full mt-lg"
                    onClick={async () => {
                        try {
                            await startGame(joinedGame.code);
                        } catch (e) {
                            console.error(e);
                            alert("Could not start game. Please try again.");
                        }
                    }}
                    disabled={!canStart}
                >
                    Start Game
                </button>
                <p
                    style={{
                        marginTop: "0.5rem",
                        fontSize: "0.9rem",
                        opacity: "0.8",
                    }}
                >
                    Ready players: {readyPlayers.length} / {players.length}
                </p>
            </>
          )}
        </div>
      </div>
    );
  }

  // Role screen
  if (phase === "role" && category && roleData) {
    const { isImposter, word } = roleData;

    return (
      <div className="screen-centered">
        <button
          className="btn-text screen-header-left"
          onClick={leaveCompletely}
        >
          ← Leave game
        </button>

        <h1>Your role</h1>

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

  // Discussion phase
  if (phase === "play" && category && roleData) {
    return (
      <div className="screen-centered">
        <button
          className="btn-text screen-header-left"
          onClick={leaveCompletely}
        >
          ← Leave game
        </button>

        <h2>Discussion phase</h2>

        <div className="card card-narrow mt-lg">
          <p>
            Discuss clues in real life. The host will reveal the answer when
            everyone has guessed.
          </p>
          <p style={{ marginTop: "0.5rem" }}>
            This screen will update automatically when the host reveals the
            result.
          </p>

          {iAmHost && (
            <button
                className="btn-primary btn-full mt-lg"
                onClick={async () => {
                    try {
                        await revealGame(joinedGame.code);
                    } catch (e) {
                        console.error(e);
                        alert("Could not reveal result. Please try again.");
                    }
                }}
            >
                Reveal result for everyone
            </button>
          )}
        </div>
      </div>
    );
  }

  // Result phase
  if (phase === "result" && category && roleData) {
    const imposterPlayers = players.filter((p) =>
      roleData.imposters?.includes(p.id)
    );

    return (
      <div className="screen-centered">
        <button
          className="btn-text screen-header-left"
          onClick={leaveCompletely}
        >
          ← Back to menu
        </button>

        <h2>Result</h2>

        <div className="card card-narrow mt-lg">
          <p>
            The secret word was{" "}
            <strong>
              {roleData.word} ({category.name})
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
                    if (player?.id) {
                        await setPlayerReady(player.id, true);
                    }
                } catch (e) {
                    console.error(e);
                }
                // Stay in the lobby for another round
                setPhase("waiting");
                setRoleData(null);
              }}
            >
              Play again with this lobby
            </button>
            <button
              className="btn-secondary btn-full"
              onClick={leaveCompletely}
            >
              Back to multi-device menu
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Default: join form
  return (
    <div className="screen-centered">
      <button className="btn-text screen-header-left" onClick={onBack}>
        ← Back
      </button>

      <h1>Join Game</h1>

      <div className="card card-narrow mt-lg form-card">
        <div className="form-group">
          <label className="label">Game code</label>
          <input
            className="input-text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="e.g. AB7QZK"
          />
        </div>

        <div className="form-group">
          <label className="label">Your name</label>
          <input
            className="input-text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Alice"
          />
        </div>

        <button
          className="btn-primary btn-full mt-lg"
          onClick={handleJoin}
          disabled={loading}
        >
          {loading ? "Joining..." : "Join"}
        </button>
      </div>
    </div>
  );
}
