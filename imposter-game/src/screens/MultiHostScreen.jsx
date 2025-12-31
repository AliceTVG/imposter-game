// src/screens/MultiHostScreen.jsx
import { useEffect, useMemo, useRef, useState } from "react";
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
  fetchChatMessages,
  sendChatMessage,
  castVote,
  fetchVotes,
} from "../backend/lobbyApi";
import {
  computeMultiDeviceOutcome,
  computeMultiDeviceRoleForPlayer,
} from "../game/multiDeviceEngine";
import QRCode from "react-qr-code";

const SYS = {
  VOTING_START: "__SYS:VOTING_START__",
  REVEAL_VOTES: "__SYS:REVEAL_VOTES__",
};

function isSystemMsg(m) {
  return (
    (m?.name || "").toUpperCase() === "HOST" &&
    typeof m?.message === "string" &&
    m.message.startsWith("__SYS:")
  );
}

function deriveStage(game, chatMessages) {
  if (game?.revealed_at) return "final";
  let stage = "discussion";
  for (const m of chatMessages) {
    if (!isSystemMsg(m)) continue;
    if (m.message === SYS.VOTING_START) stage = "voting";
    if (m.message === SYS.REVEAL_VOTES) stage = "revealVotes";
  }
  return stage;
}

function findSystemTimestamp(chatMessages, sysToken) {
  let ts = null;
  for (const m of chatMessages) {
    if (isSystemMsg(m) && m.message === sysToken) ts = m.created_at;
  }
  return ts;
}

function computeNextSpeaker({ players, firstSpeakerId, chatMessages }) {
  const order = (players || []).map((p) => p.id);
  if (!order.length) return { currentId: null, currentName: null };

  const startId =
    firstSpeakerId && order.includes(firstSpeakerId) ? firstSpeakerId : order[0];
  let idx = order.indexOf(startId);
  let current = order[idx];

  for (const m of chatMessages) {
    if (!m?.player_id) continue;
    if (m.player_id === current) {
      idx = (idx + 1) % order.length;
      current = order[idx];
    }
  }

  const currentPlayer = players.find((p) => p.id === current);
  return { currentId: current, currentName: currentPlayer?.name ?? null };
}

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
  const [requireChatClue, setRequireChatClue] = useState(false);

  const [error, setError] = useState("");

  // chat/votes
  const [chatMessages, setChatMessages] = useState([]);
  const [chatText, setChatText] = useState("");
  const [sendingChat, setSendingChat] = useState(false);

  const [votes, setVotes] = useState([]);
  const [myVoteTargets, setMyVoteTargets] = useState([]);
  const [castingVote, setCastingVote] = useState(false);

  const [secondsLeft, setSecondsLeft] = useState(null);

  const chatScrollRef = useRef(null);
  const isChatPinnedRef = useRef(true);

  const selectedCategory = categories[categoryIndex];

  const currentLobbyCategory = useMemo(() => {
    if (!game) return selectedCategory;

    const local = categories.find((c) => c.id === game.category_id);
    if (local) return local;

    if (game.category_name && Array.isArray(game.category_words)) {
      return {
        id: game.category_id,
        name: game.category_name,
        words: game.category_words,
      };
    }

    return selectedCategory;
  }, [game, selectedCategory, categories]);

  const roundKey = game?.started_at || null;

  const stage = useMemo(() => deriveStage(game, chatMessages), [game, chatMessages]);

  const nonSystemChat = useMemo(
    () => (chatMessages || []).filter((m) => !isSystemMsg(m)),
    [chatMessages]
  );

  const chattedSet = useMemo(() => {
    const s = new Set();
    for (const m of chatMessages) {
      if (m.player_id) s.add(m.player_id);
    }
    return s;
  }, [chatMessages]);

  const allPlayersMessaged = useMemo(() => {
    if (!players?.length) return false;
    return players.every((p) => chattedSet.has(p.id));
  }, [players, chattedSet]);

  const iHaveMessaged = useMemo(() => {
    if (!hostPlayer?.id) return false;
    return chattedSet.has(hostPlayer.id);
  }, [hostPlayer?.id, chattedSet]);

  const votingStartAt = useMemo(
    () => findSystemTimestamp(chatMessages, SYS.VOTING_START),
    [chatMessages]
  );

  const { currentName: nextSpeakerName, currentId: nextSpeakerId } = useMemo(() => {
    return computeNextSpeaker({
      players,
      firstSpeakerId: game?.first_speaker_player_id,
      chatMessages: nonSystemChat.filter(
        (m) => (m?.name || "").toUpperCase() !== "HOST"
      ),
    });
  }, [players, game?.first_speaker_player_id, nonSystemChat]);

  const voteCounts = useMemo(() => {
    const counts = new Map();
    for (const v of votes) {
      counts.set(v.target_player_id, (counts.get(v.target_player_id) || 0) + 1);
    }
    return counts;
  }, [votes]);

  const updateChatPinned = () => {
    const el = chatScrollRef.current;
    if (!el) return;
    isChatPinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  useEffect(() => {
    const el = chatScrollRef.current;
    if (!el) return;
    if (!isChatPinnedRef.current) return;

    requestAnimationFrame(() => {
      const el2 = chatScrollRef.current;
      if (el2) el2.scrollTop = el2.scrollHeight;
    });
  }, [nonSystemChat.length]);

  useEffect(() => {
    if (phase !== "play") return;
    if (stage !== "voting") {
      setSecondsLeft(null);
      return;
    }
    if (!votingStartAt) return;

    const startMs = new Date(votingStartAt).getTime();
    const tick = () => {
      const elapsed = Math.floor((Date.now() - startMs) / 1000);
      const left = Math.max(0, 30 - elapsed);
      setSecondsLeft(left);
    };

    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [phase, stage, votingStartAt]);

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

    setChatMessages([]);
    setChatText("");
    setVotes([]);
    setMyVoteTargets([]);
    setSecondsLeft(null);
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

  const refreshRoundData = async (gameObj) => {
    if (!gameObj?.id || !gameObj?.started_at) return;

    try {
      const [msgs, vts] = await Promise.all([
        fetchChatMessages({
          gameId: gameObj.id,
          roundKey: gameObj.started_at,
          limit: 200,
        }),
        fetchVotes({ gameId: gameObj.id, roundKey: gameObj.started_at }),
      ]);

      setChatMessages(msgs || []);
      setVotes(vts || []);

      if (hostPlayer?.id) {
        const mine = (vts || [])
          .filter((v) => v.voter_player_id === hostPlayer.id)
          .map((v) => v.target_player_id);
        setMyVoteTargets(mine);
      }
    } catch (e) {
      console.error("refreshRoundData failed", e);
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
    } catch (e) {
      console.error(e);
      setError("Could not reveal result. Please try again.");
    } finally {
      setRevealing(false);
    }
  };

  const handleSendChat = async () => {
    if (!game?.id || !roundKey || !hostPlayer?.id) return;
    const text = chatText.trim();
    if (!text) return;

    setSendingChat(true);
    setError("");

    try {
      await sendChatMessage({
        gameId: game.id,
        playerId: hostPlayer.id,
        name: hostPlayer.name,
        text,
        roundKey,
      });
      setChatText("");
      await refreshRoundData(game);
    } catch (e) {
      console.error(e);
      setError(e?.message || "Could not send message.");
    } finally {
      setSendingChat(false);
    }
  };

  const postSystemToken = async (token) => {
    if (!game?.id || !roundKey || !hostPlayer?.id) return;
    setError("");

    try {
      await sendChatMessage({
        gameId: game.id,
        playerId: hostPlayer.id,
        name: "HOST",
        text: token,
        roundKey,
      });
      await refreshRoundData(game);
    } catch (e) {
      console.error(e);
      setError(e?.message || "Could not update stage.");
    }
  };

  const handleVote = async (targetPlayerId) => {
    if (!game?.id || !roundKey || !hostPlayer?.id) return;
    if (!targetPlayerId) return;

    const maxSelections = Math.max(1, Math.floor((players?.length || 0) / 2));
    const alreadySelected = myVoteTargets.includes(targetPlayerId);

    if (!alreadySelected && myVoteTargets.length >= maxSelections) {
      setError(
        `You can only vote for up to ${maxSelections} player${
          maxSelections === 1 ? "" : "s"
        }.`
      );
      return;
    }

    // Optimistic toggle so the UI feels snappy
    setMyVoteTargets((prev) =>
      prev.includes(targetPlayerId)
        ? prev.filter((id) => id !== targetPlayerId)
        : [...prev, targetPlayerId]
    );

    setCastingVote(true);
    setError("");

    try {
      await castVote({
        gameId: game.id,
        roundKey,
        voterPlayerId: hostPlayer.id,
        targetPlayerId,
        maxSelections,
      });

      await refreshRoundData(game);
    } catch (e) {
      console.error(e);
      await refreshRoundData(game);
      setError(e?.message || "Could not cast vote.");
    } finally {
      setCastingVote(false);
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

          setChatMessages([]);
          setVotes([]);
          setMyVoteTargets([]);
          setSecondsLeft(null);

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

  // Poll in play phase: keep everything fresh and move to result when revealed_at flips
  useEffect(() => {
    if (phase !== "play" || !game) return;

    let cancelled = false;

    const tick = async () => {
      try {
        const { game: freshGame, players } = await fetchLobbyByCode(game.code);
        if (cancelled) return;

        setGame(freshGame);
        setPlayers(players);

        await refreshRoundData(freshGame);

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
                  If on, everyone must send at least one chat message during discussion
                  before the host can reveal results.
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
              <p className="role-sub">Describe it without giving it away to the imposter.</p>
            </>
          )}

          <button
            className="btn-primary btn-full mt-lg"
            onClick={async () => {
              setPhase("play");
              if (game?.id && game?.started_at) await refreshRoundData(game);
            }}
          >
            Continue to discussion
          </button>
        </div>
      </div>
    );
  }

  if (phase === "play" && currentLobbyCategory && roleData && game) {
    const requireMessages = !!game.require_chat_clue;

    const canFinalReveal =
      !revealing &&
      (stage === "revealVotes" || stage === "discussion" || stage === "voting") &&
      (!requireMessages || allPlayersMessaged);

    return (
      <div className="screen-centered">
        <button className="btn-text screen-header-left" onClick={handleLeaveCompletely}>
          ← End game
        </button>

        <h2>
          {stage === "discussion"
            ? "Discussion (host)"
            : stage === "voting"
            ? "Voting (host)"
            : stage === "revealVotes"
            ? "Vote Results (host)"
            : "Final"}
        </h2>

        {error && (
          <div className="card" style={{ borderColor: "rgba(248,113,113,0.35)", marginTop: 12 }}>
            ⚠️ {error}
          </div>
        )}

        <div className="card card-narrow mt-lg">
          <div className="next-speaker-box">
            <div className="next-speaker-label">Who’s next?</div>
            <div className="next-speaker-name">{nextSpeakerName || "—"}</div>
          </div>

          {stage === "discussion" && requireMessages && (
            <div className="card" style={{ marginTop: 12, opacity: 0.95 }}>
              <strong>Messages required</strong>
              <div style={{ marginTop: 6, opacity: 0.85 }}>
                {allPlayersMessaged ? "✅ Everyone has sent a message." : "⏳ Waiting for everyone to message…"}
              </div>
              {!iHaveMessaged && (
                <div style={{ marginTop: 6 }}>
                  <strong>You still need to send at least one message.</strong>
                </div>
              )}
            </div>
          )}

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
            {stage === "discussion" && (
              <button className="btn-secondary" onClick={() => postSystemToken(SYS.VOTING_START)}>
                Start voting
              </button>
            )}
            {stage === "voting" && (
              <button className="btn-secondary" onClick={() => postSystemToken(SYS.REVEAL_VOTES)}>
                Reveal vote results
              </button>
            )}
            <button
              className="btn-primary"
              onClick={handleReveal}
              disabled={!canFinalReveal}
              title={
                requireMessages && !allPlayersMessaged
                  ? "Everyone must send at least one chat message before you can reveal results."
                  : ""
              }
            >
              {revealing ? "Revealing..." : "Reveal final results"}
            </button>

            <button className="btn-secondary" onClick={() => setPhase("role")}>
              View my role again
            </button>
          </div>

          <div className="chat-room" style={{ marginTop: 14 }}>
            <div className="chat-room-header">
              <div style={{ fontWeight: 800 }}>Chat</div>
              <div className="chat-room-sub">
                {stage === "discussion"
                  ? "Send your message here."
                  : stage === "voting"
                  ? "Voting is live. Results will appear soon."
                  : "Vote results revealed. Waiting for final reveal."}
              </div>
            </div>

            <div className="chat-room-scroll" ref={chatScrollRef} onScroll={updateChatPinned}>
              {nonSystemChat.map((m) => {
                const isMe = hostPlayer?.id && m.player_id === hostPlayer.id;
                const isHostSys = (m.name || "").toUpperCase() === "HOST";
                const bubbleClass = isHostSys ? "host" : isMe ? "me" : "them";
                const isNext = m.player_id && m.player_id === nextSpeakerId;

                return (
                  <div key={m.id} className={`chat-line ${bubbleClass}`}>
                    <div className="chat-meta">
                      <span className="chat-name">{m.name || "?"}</span>
                      {isNext ? <span className="chat-badge">next</span> : null}
                    </div>
                    <div className={`chat-bubble ${bubbleClass}`}>{m.message}</div>
                  </div>
                );
              })}
              {nonSystemChat.length === 0 && <div style={{ opacity: 0.75 }}>No messages yet.</div>}
            </div>

            <div className="chat-compose">
              <input
                className="input-text"
                value={chatText}
                onChange={(e) => setChatText(e.target.value)}
                placeholder="Type your message…"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSendChat();
                }}
                disabled={stage !== "discussion"}
                title={stage !== "discussion" ? "Chat is locked during voting/results." : ""}
              />
              <button
                className="btn-primary"
                onClick={handleSendChat}
                disabled={sendingChat || stage !== "discussion"}
              >
                {sendingChat ? "…" : "Send"}
              </button>
            </div>
          </div>

          {stage === "voting" &&
            (() => {
              const maxSelections = Math.max(1, Math.floor((players?.length || 0) / 2));
              return (
                <>
                  <div className="vote-header" style={{ marginTop: 14 }}>
                    <div style={{ fontWeight: 800 }}>Vote now</div>
                    <div style={{ opacity: 0.85, fontSize: "0.95rem" }}>
                      Time left: <strong>{secondsLeft ?? 30}s</strong>
                    </div>
                  </div>

                  <div className="vote-grid">
                    {players
                      .filter((p) => p.id !== hostPlayer?.id)
                      .map((p) => {
                        const selected = myVoteTargets.includes(p.id);
                        const atCap = !selected && myVoteTargets.length >= maxSelections;

                        return (
                          <button
                            key={p.id}
                            className={`btn-secondary btn-vote ${selected ? "selected" : ""}`}
                            onClick={() => handleVote(p.id)}
                            disabled={castingVote || atCap}
                          >
                            <div style={{ fontWeight: 800 }}>{p.name}</div>
                            <div style={{ opacity: 0.8, fontSize: "0.9rem" }}>
                              {selected ? "Selected (tap to unselect)" : "Tap to select"}
                            </div>
                          </button>
                        );
                      })}
                  </div>

                  <div style={{ marginTop: 10, opacity: 0.85 }}>
                    {myVoteTargets.length
                      ? `✅ Selected ${myVoteTargets.length}/${maxSelections}.`
                      : "⏳ Select at least one player."}
                  </div>
                </>
              );
            })()}

          {stage === "revealVotes" && (
            <>
              <div className="vote-header" style={{ marginTop: 14 }}>
                <div style={{ fontWeight: 800 }}>Vote results</div>
                <div style={{ opacity: 0.85, fontSize: "0.95rem" }}>
                  Ready when you are, host.
                </div>
              </div>

              <ul style={{ textAlign: "left", marginTop: 10 }}>
                {players
                  .map((p) => ({ p, count: voteCounts.get(p.id) || 0 }))
                  .sort((a, b) => b.count - a.count || a.p.name.localeCompare(b.p.name))
                  .map(({ p, count }) => (
                    <li key={p.id}>
                      <strong>{p.name}</strong>: {count} vote{count === 1 ? "" : "s"}
                    </li>
                  ))}
              </ul>
            </>
          )}
        </div>
      </div>
    );
  }

  // ✅ NEW: nicer reveal screen (like your updated style)
  if (phase === "result" && currentLobbyCategory && roleData) {
    const imposterPlayers = players.filter((p) => roleData.imposters?.includes(p.id));

    return (
      <div className="screen-centered">
        <button className="btn-text screen-header-left" onClick={handleLeaveCompletely}>
          ← Back to menu
        </button>

        <div className="card card-narrow mt-lg" style={{ padding: "1.5rem 1.25rem" }}>
          <div style={{ letterSpacing: "0.22em", fontWeight: 800, opacity: 0.7 }}>
            RESULTS
          </div>

          <div
            style={{
              fontSize: "2.15rem",
              fontWeight: 900,
              letterSpacing: "0.05em",
              marginTop: "0.5rem",
              textTransform: "uppercase",
            }}
          >
            THE IMPOSTER WAS…
          </div>

          <div style={{ marginTop: "0.65rem", fontSize: "1.1rem", opacity: 0.95 }}>
            Secret word:{" "}
            <span
              style={{
                display: "inline-block",
                padding: "0.25rem 0.75rem",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.15)",
                background: "rgba(255,255,255,0.06)",
                fontWeight: 800,
              }}
            >
              “{roleData.word}”
            </span>
          </div>

          <div
            className="card"
            style={{
              marginTop: "1.25rem",
              textAlign: "left",
              padding: "1.1rem",
              background: "rgba(2,6,23,0.35)",
              borderColor: "rgba(255,255,255,0.10)",
            }}
          >
            <div style={{ fontSize: "1.05rem", fontWeight: 800, opacity: 0.85 }}>
              {imposterPlayers.length === 1 ? "Imposter" : "Imposters"}
            </div>

            <div style={{ marginTop: "0.85rem", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              {imposterPlayers.map((p) => (
                <div
                  key={p.id}
                  style={{
                    borderRadius: 18,
                    padding: "0.85rem 1rem",
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "rgba(255,255,255,0.04)",
                    fontWeight: 900,
                    textAlign: "center",
                    fontSize: "1.35rem",
                    letterSpacing: "0.04em",
                  }}
                >
                  {p.name}
                </div>
              ))}
            </div>
          </div>

          <button
            className="btn-primary btn-full mt-lg"
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

              setChatMessages([]);
              setVotes([]);
              setMyVoteTargets([]);
              setSecondsLeft(null);
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
