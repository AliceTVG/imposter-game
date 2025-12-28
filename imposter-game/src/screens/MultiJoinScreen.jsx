import { useEffect, useMemo, useState } from "react";
import {
  joinGame,
  fetchLobbyByCode,
  leaveGame,
  setPlayerReady,
  startGame,
  revealGame,
  touchPlayer,
  fetchChatMessages,
  sendChatMessage,
  castVote,
  fetchVotes,
} from "../backend/lobbyApi";
import {
  computeMultiDeviceOutcome,
  computeMultiDeviceRoleForPlayer,
} from "../game/multiDeviceEngine";

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

  // chat/votes
  const [chatMessages, setChatMessages] = useState([]);
  const [chatText, setChatText] = useState("");
  const [sendingChat, setSendingChat] = useState(false);

  const [votes, setVotes] = useState([]);
  const [myVoteTarget, setMyVoteTarget] = useState(null);
  const [castingVote, setCastingVote] = useState(false);

  // voting countdown display
  const [secondsLeft, setSecondsLeft] = useState(null);

  const roundKey = joinedGame?.started_at || null;
  const stage = useMemo(
    () => deriveStage(joinedGame, chatMessages),
    [joinedGame, chatMessages]
  );

  const iAmHost = useMemo(() => {
    if (!joinedGame || !player) return false;
    return joinedGame.host_player_id === player.id;
  }, [joinedGame, player]);

  const voteCounts = useMemo(() => {
    const counts = new Map();
    for (const v of votes) {
      counts.set(v.target_player_id, (counts.get(v.target_player_id) || 0) + 1);
    }
    return counts;
  }, [votes]);

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
    if (!player?.id) return false;
    return chattedSet.has(player.id);
  }, [player?.id, chattedSet]);

  const nonSystemChat = useMemo(
    () => chatMessages.filter((m) => !isSystemMsg(m)),
    [chatMessages]
  );

  const { currentName: nextSpeakerName, currentId: nextSpeakerId } = useMemo(() => {
    return computeNextSpeaker({
      players,
      firstSpeakerId: joinedGame?.first_speaker_player_id,
      chatMessages: nonSystemChat.filter((m) => (m?.name || "").toUpperCase() !== "HOST"),
    });
  }, [players, joinedGame?.first_speaker_player_id, nonSystemChat]);

  const votingStartAt = useMemo(
    () => findSystemTimestamp(chatMessages, SYS.VOTING_START),
    [chatMessages]
  );

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

    setChatMessages([]);
    setChatText("");
    setVotes([]);
    setMyVoteTarget(null);
    setSecondsLeft(null);

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
      const { game, player } = await joinGame({ code: trimmedCode, name: trimmedName });
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

  const refreshRoundData = async (gameObj) => {
    if (!gameObj?.id || !gameObj?.started_at) return;

    try {
      const [msgs, vts] = await Promise.all([
        fetchChatMessages({ gameId: gameObj.id, roundKey: gameObj.started_at, limit: 200 }),
        fetchVotes({ gameId: gameObj.id, roundKey: gameObj.started_at }),
      ]);

      setChatMessages(msgs || []);
      setVotes(vts || []);

      if (player?.id) {
        const mine = (vts || []).find((v) => v.voter_player_id === player.id);
        setMyVoteTarget(mine?.target_player_id ?? null);
      }
    } catch (e) {
      console.error("refreshRoundData failed", e);
    }
  };

  const handleSendChat = async () => {
    if (!joinedGame?.id || !roundKey || !player?.id) return;
    const text = chatText.trim();
    if (!text) return;

    setSendingChat(true);
    try {
      await sendChatMessage({
        gameId: joinedGame.id,
        playerId: player.id,
        name: player.name,
        text,
        roundKey,
      });
      setChatText("");
      await refreshRoundData(joinedGame);
    } catch (e) {
      console.error(e);
      setError(e?.message || "Could not send message.");
    } finally {
      setSendingChat(false);
    }
  };

  const handleVote = async (targetPlayerId) => {
    if (!joinedGame?.id || !roundKey || !player?.id) return;
    if (!targetPlayerId) return;

    setCastingVote(true);
    try {
      await castVote({
        gameId: joinedGame.id,
        roundKey,
        voterPlayerId: player.id,
        targetPlayerId,
      });
      setMyVoteTarget(targetPlayerId);
      await refreshRoundData(joinedGame);
    } catch (e) {
      console.error(e);
      setError(e?.message || "Could not cast vote.");
    } finally {
      setCastingVote(false);
    }
  };

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

  // Waiting poll
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

        const localCat = categories.find((c) => c.id === game.category_id);
        const categoryFromGame =
          game.category_name && Array.isArray(game.category_words)
            ? { id: game.category_id, name: game.category_name, words: game.category_words }
            : null;

        const categoryForRound = localCat || categoryFromGame || category;
        if (categoryForRound && categoryForRound.id !== category.id) setCategory(categoryForRound);

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

          setChatMessages([]);
          setVotes([]);
          setMyVoteTarget(null);
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

  // Play poll
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

        await refreshRoundData(game);

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
          <p>You were removed by the host.</p>
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
              <div className="hint">Try to figure out the secret word.</div>
            </>
          ) : (
            <>
              <div className="hint">The secret word is</div>
              <h2 style={{ margin: "0.25rem 0" }}>{roleData.word}</h2>
              <div className="hint">Send messages without giving it away.</div>
            </>
          )}

          <button
            className="btn-primary mt-lg"
            onClick={async () => {
              setPhase("play");
              if (joinedGame?.id && joinedGame?.started_at) await refreshRoundData(joinedGame);
            }}
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  if (phase === "play" && category && roleData && joinedGame) {
    const requireMessages = !!joinedGame.require_chat_clue;

    return (
      <div className="screen-centered">
        <button className="btn-text screen-header-left" onClick={leaveCompletely}>
          ← Leave game
        </button>

        <h2>
          {stage === "discussion"
            ? "Discussion"
            : stage === "voting"
            ? "Voting"
            : stage === "revealVotes"
            ? "Vote Results"
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

          {/* Chat room */}
          <div className="chat-room">
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

            <div className="chat-room-scroll">
              {nonSystemChat.map((m) => {
                const isMe = player?.id && m.player_id === player.id;
                const isHost = (m.name || "").toUpperCase() === "HOST";
                const bubbleClass = isHost ? "host" : isMe ? "me" : "them";
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
              <button className="btn-primary" onClick={handleSendChat} disabled={sendingChat || stage !== "discussion"}>
                {sendingChat ? "…" : "Send"}
              </button>
            </div>
          </div>

          {/* Voting */}
          {stage === "voting" && (
            <>
              <div className="vote-header">
                <div style={{ fontWeight: 800 }}>Vote now</div>
                <div style={{ opacity: 0.85, fontSize: "0.95rem" }}>
                  Time left: <strong>{secondsLeft ?? 30}s</strong>
                </div>
              </div>

              <div className="vote-grid">
                {players
                  .filter((p) => p.id !== player?.id)
                  .map((p) => {
                    const selected = myVoteTarget === p.id;
                    return (
                      <button
                        key={p.id}
                        className={`btn-secondary btn-vote ${selected ? "selected" : ""}`}
                        onClick={() => handleVote(p.id)}
                        disabled={castingVote}
                      >
                        <div style={{ fontWeight: 800 }}>{p.name}</div>
                        <div style={{ opacity: 0.8, fontSize: "0.9rem" }}>
                          {selected ? "Selected" : "Tap to vote"}
                        </div>
                      </button>
                    );
                  })}
              </div>

              <div style={{ marginTop: 10, opacity: 0.85 }}>
                {myVoteTarget ? "✅ Vote submitted." : "⏳ Submit your vote."}
              </div>
            </>
          )}

          {/* Vote results stage */}
          {stage === "revealVotes" && (
            <>
              <div className="vote-header" style={{ marginTop: 14 }}>
                <div style={{ fontWeight: 800 }}>Vote results</div>
                <div style={{ opacity: 0.85, fontSize: "0.95rem" }}>Waiting for the final reveal…</div>
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

          <button className="btn-secondary mt-lg" onClick={() => setPhase("role")}>
            View my role again
          </button>

          {iAmHost && stage === "revealVotes" && (
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
              Reveal results (host)
            </button>
          )}
        </div>
      </div>
    );
  }

  if (phase === "result" && roleData) {
    const imposterPlayers = players.filter((p) => roleData.imposters?.includes(p.id));

    return (
      <div className="screen-centered big-reveal-wrap">
        <button className="btn-text screen-header-left" onClick={leaveCompletely}>
          ← Back
        </button>

        <div className="big-reveal big-reveal-mobile">
          <div className="big-reveal-top">
            <div className="big-reveal-kicker">RESULTS</div>
            <div className="big-reveal-title">THE IMPOSTER WAS…</div>
            <div className="big-reveal-sub">
              Secret word: <span className="big-reveal-word">“{roleData.word}”</span>
            </div>
          </div>

          <div className="big-reveal-grid one">
            <div className="card big-reveal-card">
              <div className="tv-section-title">Imposter</div>
              <div className="big-reveal-people">
                {imposterPlayers.map((p) => (
                  <div key={p.id} className="big-reveal-name">
                    {p.name}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="big-reveal-actions">
            <button
              className="btn-primary"
              onClick={async () => {
                try {
                  if (player?.id) await setPlayerReady(player.id, true);
                } catch (e) {
                  console.error(e);
                }
                setPhase("waiting");
                setRoleData(null);
                setChatMessages([]);
                setVotes([]);
                setMyVoteTarget(null);
                setSecondsLeft(null);
              }}
            >
              Play again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
