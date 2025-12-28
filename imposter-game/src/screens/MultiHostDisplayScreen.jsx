// src/screens/MultiHostDisplayScreen.jsx
import { useEffect, useMemo, useState } from "react";
import QRCode from "react-qr-code";
import { supabase } from "../backend/supabaseClient";
import {
  createGameLobby,
  fetchLobbyByCode,
  startGame,
  revealGame,
  updateGameCategory,
  fetchChatMessages,
  sendChatMessage,
  fetchVotes,
  kickPlayer,
} from "../backend/lobbyApi";
import { computeMultiDeviceOutcome } from "../game/multiDeviceEngine";

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

function pickWeightedRandomId(players, imposterIds, imposterWeight = 0.33) {
  if (!players?.length) return null;
  const imposterSet = new Set(imposterIds || []);

  const weighted = players.map((p) => ({
    id: p.id,
    w: imposterSet.has(p.id) ? imposterWeight : 1,
  }));

  const total = weighted.reduce((sum, x) => sum + x.w, 0);
  if (total <= 0) return weighted[0].id;

  let r = Math.random() * total;
  for (const x of weighted) {
    r -= x.w;
    if (r <= 0) return x.id;
  }
  return weighted[weighted.length - 1].id;
}


function computeNextSpeaker({ players, firstSpeakerId, chatMessages }) {
  const order = (players || []).map((p) => p.id);
  if (!order.length) return { currentId: null, currentName: null };

  const startId =
    firstSpeakerId && order.includes(firstSpeakerId) ? firstSpeakerId : order[0];

  let idx = order.indexOf(startId);
  let current = order[idx];

  // Advance when CURRENT speaker sends a message (non-system, non-host)
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

export default function MultiHostDisplayScreen({ categories, onBack }) {
  const [phase, setPhase] = useState("setup"); // setup | lobby | play | result

  const [categoryIndex, setCategoryIndex] = useState(0);
  const [game, setGame] = useState(null);
  const [players, setPlayers] = useState([]);

  const [startedAtSeen, setStartedAtSeen] = useState(null);
  const [revealedAtSeen, setRevealedAtSeen] = useState(null);

  const [creating, setCreating] = useState(false);
  const [starting, setStarting] = useState(false);
  const [revealing, setRevealing] = useState(false);

  // Setup-page toggles (used at lobby creation time)
  const [forceSingleImposter, setForceSingleImposter] = useState(false);
  const [requireChatMessage, setRequireChatMessage] = useState(false);

  const [error, setError] = useState("");

  // Round data
  const [chatMessages, setChatMessages] = useState([]);
  const [chatText, setChatText] = useState("");
  const [sendingChat, setSendingChat] = useState(false);
  const [votes, setVotes] = useState([]);

  // Voting countdown (30s)
  const [secondsLeft, setSecondsLeft] = useState(null);

  // Right panel tab
  const [sideTab, setSideTab] = useState("players"); // players | join | stage

  // ✅ Lock round roster at round start (fixes "Unknown imposter" + caught/escaped mismatch)
  const [roundPlayerIds, setRoundPlayerIds] = useState([]);

  const selectedCategory = categories?.[categoryIndex] ?? categories?.[0] ?? null;

  const joinUrl = useMemo(() => {
    if (!game?.code) return "";
    return `${window.location.origin}/?join=${game.code}`;
  }, [game?.code]);

  const roundKey = game?.started_at || null;

  const stage = useMemo(() => deriveStage(game, chatMessages), [game, chatMessages]);

  const voteCounts = useMemo(() => {
    const counts = new Map();
    for (const v of votes) {
      counts.set(v.target_player_id, (counts.get(v.target_player_id) || 0) + 1);
    }
    return counts;
  }, [votes]);

  const votedSet = useMemo(() => {
    const s = new Set();
    for (const v of votes) s.add(v.voter_player_id);
    return s;
  }, [votes]);

  const chattedSet = useMemo(() => {
    const s = new Set();
    for (const m of chatMessages) {
      if (m.player_id) s.add(m.player_id);
    }
    return s;
  }, [chatMessages]);

  const nonSystemChat = useMemo(
    () => chatMessages.filter((m) => !isSystemMsg(m)),
    [chatMessages]
  );

  const categoryForRound = useMemo(() => {
    if (!game) return selectedCategory;
    if (game.category_name && Array.isArray(game.category_words)) {
      return { id: game.category_id, name: game.category_name, words: game.category_words };
    }
    return selectedCategory;
  }, [game, selectedCategory]);

  // ✅ The actual round participants (locked at start)
  const roundPlayers = useMemo(() => {
    if (!roundPlayerIds.length) return [];
    return players.filter((p) => roundPlayerIds.includes(p.id));
  }, [players, roundPlayerIds]);

  const allVoted = useMemo(() => {
    if (!roundPlayers.length) return false;
    return roundPlayers.every((p) => votedSet.has(p.id));
  }, [roundPlayers, votedSet]);

  const allPlayersMessaged = useMemo(() => {
    if (!roundPlayers.length) return false;
    return roundPlayers.every((p) => chattedSet.has(p.id));
  }, [roundPlayers, chattedSet]);

  const { currentId: nextSpeakerId, currentName: nextSpeakerName } = useMemo(() => {
    return computeNextSpeaker({
      players: roundPlayers.length ? roundPlayers : players,
      firstSpeakerId: game?.first_speaker_player_id,
      chatMessages: nonSystemChat.filter(
        (m) => (m?.name || "").toUpperCase() !== "HOST"
      ),
    });
  }, [players, roundPlayers, game?.first_speaker_player_id, nonSystemChat]);

  const votingStartAt = useMemo(
    () => findSystemTimestamp(chatMessages, SYS.VOTING_START),
    [chatMessages]
  );

  // ✅ Outcome computed from locked round roster (fixes imposter unknown)
  const outcome = useMemo(() => {
    if (!game?.started_at || !categoryForRound) return null;
    if (!roundPlayers.length) return null;

    try {
      return computeMultiDeviceOutcome({
        code: game.code,
        players: roundPlayers,
        category: categoryForRound,
        minImposters: 1,
        maxImposters: game.force_single_imposter ? 1 : undefined,
        roundKey: game.started_at,
      });
    } catch (e) {
      console.error("compute outcome failed", e);
      return null;
    }
  }, [
    game?.started_at,
    game?.code,
    game?.force_single_imposter,
    categoryForRound,
    roundPlayers,
  ]);

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
    setRequireChatMessage(false);

    setError("");

    setChatMessages([]);
    setChatText("");
    setSendingChat(false);

    setVotes([]);
    setSecondsLeft(null);

    setSideTab("players");
    setRoundPlayerIds([]);
  };

  const handleCloseLobby = () => {
    resetAll();
    onBack();
  };

  const handleCreate = async () => {
    if (!selectedCategory) return;
    setError("");
    setCreating(true);

    try {
      const createdGame = await createGameLobby({
        categoryId: selectedCategory.id,
        categoryName: selectedCategory.name,
        categoryWords: selectedCategory.words,
        forceSingleImposter,
        requireChatClue: requireChatMessage,
      });

      const { game: freshGame, players: freshPlayers } = await fetchLobbyByCode(
        createdGame.code
      );

      setGame(freshGame);
      setPlayers(freshPlayers);
      setStartedAtSeen(freshGame.started_at || null);
      setRevealedAtSeen(freshGame.revealed_at || null);
      setPhase("lobby");
    } catch (e) {
      console.error(e);
      setError(`Could not create game: ${e?.message || "Unknown error"}`);
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

  const refreshRoundData = async (freshGame) => {
    if (!freshGame?.id || !freshGame?.started_at) return;

    try {
      const [msgs, vts] = await Promise.all([
        fetchChatMessages({
          gameId: freshGame.id,
          roundKey: freshGame.started_at,
          limit: 200,
        }),
        fetchVotes({ gameId: freshGame.id, roundKey: freshGame.started_at }),
      ]);

      setChatMessages(msgs || []);
      setVotes(vts || []);
    } catch (e) {
      console.error("refreshRoundData failed", e);
    }
  };

  const handleSendChat = async () => {
    if (!game?.id || !roundKey) return;
    const text = chatText.trim();
    if (!text) return;

    setSendingChat(true);
    try {
      await sendChatMessage({
        gameId: game.id,
        playerId: null,
        name: "HOST",
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

  const pushSystem = async (token) => {
    if (!game?.id || !roundKey) return;
    setError("");
    try {
      await sendChatMessage({
        gameId: game.id,
        playerId: null,
        name: "HOST",
        text: token,
        roundKey,
      });
      await refreshRoundData(game);
    } catch (e) {
      console.error(e);
      setError("Could not change stage.");
    }
  };

  const handleMoveToVoting = async () => {
    if (game?.require_chat_clue && !allPlayersMessaged) {
      setError("Chat is required: everyone must send at least one message before voting.");
      setSideTab("stage");
      return;
    }
    await pushSystem(SYS.VOTING_START);
    setSideTab("stage");
  };

  const handleRevealVotes = async () => {
    if (!allVoted && (secondsLeft == null || secondsLeft > 0)) {
      setError("Waiting for votes (or countdown to end).");
      setSideTab("stage");
      return;
    }
    await pushSystem(SYS.REVEAL_VOTES);
    setSideTab("stage");
  };

  const handleRevealImposter = async () => {
    if (!game) return;
    setRevealing(true);
    setError("");
    try {
      await revealGame(game.code);
    } catch (e) {
      console.error(e);
      setError("Could not reveal results. Please try again.");
    } finally {
      setRevealing(false);
    }
  };

  const handleToggleLobbySetting = async (patch) => {
    if (!game?.id) return;
    setError("");

    try {
      const { data, error: supaError } = await supabase
        .from("games")
        .update(patch)
        .eq("id", game.id)
        .select()
        .single();

      if (supaError) throw supaError;
      setGame(data);
    } catch (e) {
      console.error(e);
      setError("Could not update lobby settings.");
    }
  };

  // Voting countdown (30s) based on system message timestamp
  useEffect(() => {
    if (phase !== "play" || !game) return;
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
  }, [phase, game, stage, votingStartAt]);

  // Poll lobby
  useEffect(() => {
    if (phase !== "lobby" || !game) return;

    let cancelled = false;

    const tick = async () => {
      try {
        const { game: freshGame, players: freshPlayers } =
          await fetchLobbyByCode(game.code);
        if (cancelled) return;

        setGame(freshGame);
        setPlayers(freshPlayers);

        if (freshGame.started_at && freshGame.started_at !== startedAtSeen) {
          setStartedAtSeen(freshGame.started_at);
          setPhase("play");

          // ✅ Lock roster now (this fixes reveal correctness later)
          const lockedIds = (freshPlayers || [])
            .filter((p) => p.ready_for_next_round)
            .map((p) => p.id);
          setRoundPlayerIds(lockedIds)// --- Pick starter (random, but imposters are only 33% as likely) and persist it ---
            try {
            const roundRoster = (freshPlayers || []).filter((p) => p.ready_for_next_round);

            // Compute outcome now so we know who the imposters are
            const localOutcome = computeMultiDeviceOutcome({
                code: freshGame.code,
                players: roundRoster,
                category: {
                id: freshGame.category_id,
                name: freshGame.category_name,
                words: freshGame.category_words,
                },
                minImposters: 1,
                maxImposters: freshGame.force_single_imposter ? 1 : undefined,
                roundKey: freshGame.started_at,
            });

            const pickedStarterId = pickWeightedRandomId(
                roundRoster,
                localOutcome?.imposters || [],
                0.5
            );

            if (pickedStarterId) {
                const { data, error: supaError } = await supabase
                .from("games")
                .update({ first_speaker_player_id: pickedStarterId })
                .eq("id", freshGame.id)
                .select()
                .single();

                if (!supaError && data) {
                setGame(data); // ensures UI uses the persisted starter
                }
            }
            } catch (e) {
            console.error("Failed to set first speaker", e);
            }

          setChatMessages([]);
          setVotes([]);
          setSecondsLeft(null);
          setSideTab("players");

          await refreshRoundData(freshGame);
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

  // Poll play
  useEffect(() => {
    if (phase !== "play" || !game) return;

    let cancelled = false;

    const tick = async () => {
      try {
        const { game: freshGame, players: freshPlayers } =
          await fetchLobbyByCode(game.code);
        if (cancelled) return;

        setGame(freshGame);
        setPlayers(freshPlayers);

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

  // ---------- RENDER ----------

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

          <div className="field">
            <span>Game settings</span>

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

            <div className="toggle-row" style={{ marginTop: 10 }}>
              <div className="toggle-text">
                <div className="toggle-title">Require everyone to send a message?</div>
                <div className="toggle-subtitle">
                  If on, everyone must send at least one message during discussion before voting can begin.
                </div>
              </div>

              <label className="switch" aria-label="Require message">
                <input
                  type="checkbox"
                  checked={requireChatMessage}
                  onChange={(e) => setRequireChatMessage(e.target.checked)}
                />
                <span className="slider" />
              </label>
            </div>
          </div>

          <button
            className="btn-primary btn-full mt-lg"
            onClick={handleCreate}
            disabled={creating || !selectedCategory}
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
              <QRCode value={joinUrl} size={240} bgColor="transparent" fgColor="#f9fafb" />
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

            {/* Lobby toggles */}
            <div className="field" style={{ marginTop: "1rem" }}>
              <span>Settings</span>

              <div className="toggle-row" style={{ marginTop: 8 }}>
                <div className="toggle-text">
                  <div className="toggle-title">Only 1 imposter?</div>
                  <div className="toggle-subtitle">Applies next round.</div>
                </div>
                <label className="switch" aria-label="Only 1 imposter lobby">
                  <input
                    type="checkbox"
                    checked={!!game.force_single_imposter}
                    onChange={(e) =>
                      handleToggleLobbySetting({ force_single_imposter: e.target.checked })
                    }
                  />
                  <span className="slider" />
                </label>
              </div>

              <div className="toggle-row" style={{ marginTop: 10 }}>
                <div className="toggle-text">
                  <div className="toggle-title">Require everyone to send a message?</div>
                  <div className="toggle-subtitle">Prevents voting until everyone has messaged.</div>
                </div>
                <label className="switch" aria-label="Require message lobby">
                  <input
                    type="checkbox"
                    checked={!!game.require_chat_clue}
                    onChange={(e) =>
                      handleToggleLobbySetting({ require_chat_clue: e.target.checked })
                    }
                  />
                  <span className="slider" />
                </label>
              </div>
            </div>

            <p style={{ marginTop: "0.75rem", fontSize: "0.95rem", opacity: 0.9 }}>
              Ready: <strong>{readyPlayers.length}</strong> / {players.length}
            </p>
          </div>

          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
              <h2 style={{ margin: 0 }}>Players</h2>
              <div style={{ opacity: 0.8 }}>{players.length}</div>
            </div>

            <div className="hint" style={{ marginTop: 8, opacity: 0.8 }}>
              Click a player to remove them.
            </div>

            <ul className="player-list-tv">
              {players.map((p) => (
                <li
                  className="player-pill player-pill-clickable"
                  key={p.id}
                  onClick={async () => {
                    try {
                      setError("");
                      await kickPlayer(p.id);
                    } catch (e) {
                      console.error(e);
                      setError("Could not remove player.");
                    }
                  }}
                  title="Click to remove"
                >
                  <span>{p.name}</span>
                  <span style={{ opacity: 0.75, fontSize: "0.85rem" }}>
                    {p.ready_for_next_round ? "Ready" : "Not ready"}
                  </span>
                </li>
              ))}
            </ul>

            <div className="tv-action-row">
              <button className="btn-primary" onClick={handleStartGame} disabled={!canStart || starting}>
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
    const chatGateOn = !!game.require_chat_clue;

    const canMoveToVoting = !chatGateOn || allPlayersMessaged;
    const canRevealVotes = allVoted || (secondsLeft !== null && secondsLeft === 0);

    const maxVotes = Math.max(1, ...players.map((p) => voteCounts.get(p.id) || 0));
    const voteRows = [...players]
      .map((p) => ({ player: p, count: voteCounts.get(p.id) || 0 }))
      .sort((a, b) => b.count - a.count || a.player.name.localeCompare(b.player.name));

    return (
      <div className="screen-tv">
        <button className="btn-text screen-header-left" onClick={handleCloseLobby}>
          ← Close lobby
        </button>

        <h1>Discussion</h1>

        {error && (
          <div className="alert alert-error" style={{ maxWidth: 1100 }}>
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

        {/* Top status row */}
        <div className="tv-status-row">
          <div className="tv-status-pill">
            Stage:{" "}
            <strong>
              {stage === "discussion"
                ? "Chat"
                : stage === "voting"
                ? "Voting"
                : stage === "revealVotes"
                ? "Vote Results"
                : "Final"}
            </strong>
          </div>

          <div className="tv-status-pill">
            Next: <strong>{nextSpeakerName || "—"}</strong>
          </div>

          {stage === "voting" && (
            <>
              <div className="tv-status-pill">
                Time left: <strong>{secondsLeft ?? 30}s</strong>
              </div>
              <div className="tv-status-pill">
                Voted: <strong>{votedSet.size}</strong> / {roundPlayers.length || players.length}
              </div>
            </>
          )}

          {stage === "discussion" && chatGateOn && (
            <div className="tv-status-pill">
              Messaged: <strong>{chattedSet.size}</strong> / {roundPlayers.length || players.length}
            </div>
          )}
        </div>

        <div className="tv-discussion-layout">
          {/* MAIN: chat */}
          <div className="card tv-chat-main">
            <div className="tv-chat-header">
              <div>
                <div className="tv-section-title">Chat</div>
                <div className="hint" style={{ marginTop: 6, opacity: 0.8 }}>
                  {stage === "discussion"
                    ? "Players discuss and send messages."
                    : stage === "voting"
                    ? "Voting is live on phones. Votes are hidden until you reveal them."
                    : "Vote results are shown. Next: reveal the imposter."}
                </div>
              </div>

              {/* Stage controls */}
              <div className="tv-controls">
                {stage === "discussion" && (
                  <button className="btn-primary" onClick={handleMoveToVoting} disabled={!canMoveToVoting}>
                    Move to voting
                  </button>
                )}

                {stage === "voting" && (
                  <button className="btn-primary" onClick={handleRevealVotes} disabled={!canRevealVotes}>
                    Reveal votes
                  </button>
                )}

                {stage === "revealVotes" && (
                  <button className="btn-primary" onClick={handleRevealImposter} disabled={revealing}>
                    {revealing ? "Revealing..." : "Reveal imposter"}
                  </button>
                )}
              </div>
            </div>

            {/* Next speaker spotlight */}
            <div className="tv-next-speaker">
              <div className="tv-next-label">Who’s next?</div>
              <div className="tv-next-name">{nextSpeakerName || "—"}</div>
            </div>

            {/* Chat messages */}
            <div className="tv-chat-scroll">
              {nonSystemChat.map((m) => {
                const isHost = (m.name || "").toUpperCase() === "HOST";
                const bubbleClass = isHost ? "host" : "them";
                const isNext = m.player_id && m.player_id === nextSpeakerId;

                return (
                  <div key={m.id} className={`tv-bubble-row ${bubbleClass}`}>
                    <div className="tv-bubble-meta">
                      <span className="tv-bubble-name">{m.name || "?"}</span>
                      {isNext ? <span className="tv-badge">next</span> : null}
                    </div>
                    <div className={`tv-bubble ${bubbleClass}`}>{m.message}</div>
                  </div>
                );
              })}

              {nonSystemChat.length === 0 && (
                <div style={{ opacity: 0.75, marginTop: 8 }}>No messages yet.</div>
              )}
            </div>

            {/* Host input */}
            <div className="tv-chat-input">
              <input
                className="input-text"
                value={chatText}
                onChange={(e) => setChatText(e.target.value)}
                placeholder="Send a message as HOST…"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSendChat();
                }}
              />
              <button className="btn-secondary" onClick={handleSendChat} disabled={sendingChat}>
                {sendingChat ? "…" : "Send"}
              </button>
            </div>
          </div>

          {/* SIDE PANEL */}
          <div className="card tv-side-panel" style={{ minHeight: 640 }}>
            <div className="tv-side-tabs">
              <button
                className={`tv-side-tab ${sideTab === "players" ? "active" : ""}`}
                onClick={() => setSideTab("players")}
              >
                Players
              </button>
              <button
                className={`tv-side-tab ${sideTab === "join" ? "active" : ""}`}
                onClick={() => setSideTab("join")}
              >
                Join
              </button>
              <button
                className={`tv-side-tab ${sideTab === "stage" ? "active" : ""}`}
                onClick={() => setSideTab("stage")}
              >
                Stage
              </button>
            </div>

            {/* Players list (kick mid-game) */}
            {sideTab === "players" && (
              <>
                <div className="tv-section-title">Players</div>
                <div className="hint" style={{ marginTop: 8, opacity: 0.8 }}>
                  Click a player to remove them mid-round.
                </div>

                <ul className="player-list-tv" style={{ marginTop: 12 }}>
                  {players.map((p) => (
                    <li
                      className="player-pill player-pill-clickable"
                      key={p.id}
                      onClick={async () => {
                        try {
                          setError("");
                          await kickPlayer(p.id);
                        } catch (e) {
                          console.error(e);
                          setError("Could not remove player.");
                        }
                      }}
                      title="Click to remove"
                    >
                      <span>{p.name}</span>
                      <span style={{ opacity: 0.75, fontSize: "0.85rem" }}>
                        {p.ready_for_next_round ? "Ready" : "Not ready"}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {/* QR join during discussion */}
            {sideTab === "join" && (
              <>
                <div className="tv-section-title">Join next round</div>
                <div className="hint" style={{ marginTop: 8, opacity: 0.8 }}>
                  Scan to join the lobby. New players will be ready for the next round.
                </div>

                <div className="qr-wrapper" style={{ justifyContent: "center", marginTop: 12 }}>
                  <QRCode value={joinUrl} size={220} bgColor="transparent" fgColor="#f9fafb" />
                </div>

                <div className="tv-code" style={{ marginTop: 10 }}>
                  {game.code}
                </div>

                <p className="qr-url" style={{ marginTop: 10 }}>
                  {joinUrl.replace(/^https?:\/\//, "")}
                </p>
              </>
            )}

            {/* Stage details */}
            {sideTab === "stage" && (
              <>
                {stage === "discussion" && (
                  <>
                    <div className="tv-section-title">Chat stage</div>
                    {chatGateOn ? (
                      <>
                        <div style={{ marginTop: 10, opacity: 0.9 }}>
                          Everyone must send at least <strong>one message</strong> before voting.
                        </div>
                        <ul className="tv-checklist" style={{ marginTop: 12 }}>
                          {(roundPlayers.length ? roundPlayers : players).map((p) => {
                            const done = chattedSet.has(p.id);
                            return (
                              <li key={p.id} className={done ? "done" : ""}>
                                {done ? "✅" : "⬜"} {p.name}
                              </li>
                            );
                          })}
                        </ul>
                      </>
                    ) : (
                      <div style={{ marginTop: 10, opacity: 0.85 }}>
                        Messages are optional. Move to voting whenever you’re ready.
                      </div>
                    )}
                  </>
                )}

                {stage === "voting" && (
                  <>
                    <div className="tv-section-title">Voting</div>
                    <div style={{ marginTop: 10, opacity: 0.9 }}>
                      Everyone must vote — but you can proceed when the timer hits 0.
                    </div>

                    <div className="tv-vote-summary">
                      <div className="tv-vote-big">{votedSet.size}</div>
                      <div className="tv-vote-sub">
                        of {(roundPlayers.length || players.length)} voted
                      </div>
                    </div>

                    <div className="tv-countdown">
                      <div className="tv-countdown-num">{secondsLeft ?? 30}</div>
                      <div className="tv-countdown-label">seconds left</div>
                    </div>

                    <div className="tv-section-title" style={{ marginTop: 14 }}>
                      Who hasn’t voted?
                    </div>
                    <ul className="tv-checklist" style={{ marginTop: 10 }}>
                      {(roundPlayers.length ? roundPlayers : players).map((p) => {
                        const done = votedSet.has(p.id);
                        return (
                          <li key={p.id} className={done ? "done" : ""}>
                            {done ? "✅" : "⬜"} {p.name}
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}

                {stage === "revealVotes" && (
                  <>
                    <div className="tv-section-title">Vote results</div>
                    <div className="hint" style={{ marginTop: 8, opacity: 0.8 }}>
                      Bar length = number of votes.
                    </div>

                    <div className="tv-bar-chart">
                      {voteRows.map(({ player: p, count }) => {
                        const pct = Math.round((count / maxVotes) * 100);
                        return (
                          <div key={p.id} className="tv-bar-row">
                            <div className="tv-bar-name">{p.name}</div>
                            <div className="tv-bar-track">
                              <div className="tv-bar-fill" style={{ width: `${pct}%` }} />
                            </div>
                            <div className="tv-bar-count">{count}</div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}

                {stage === "final" && (
                  <div style={{ marginTop: 10, opacity: 0.85 }}>
                    Final results are being shown.
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (phase === "result" && game) {
    const word = outcome?.word || null;
    const imposterIds = outcome?.imposters || [];
    const imposters = players.filter((p) => imposterIds.includes(p.id));

    // top-voted among the round players (fallback to all players)
    const voteUniverse = roundPlayers.length ? roundPlayers : players;
    const maxVotes = Math.max(0, ...voteUniverse.map((p) => voteCounts.get(p.id) || 0));
    const topVoted = voteUniverse.filter(
      (p) => (voteCounts.get(p.id) || 0) === maxVotes && maxVotes > 0
    );

    const imposterCaught =
      topVoted.some((p) => imposterIds.includes(p.id)) && imposterIds.length > 0;

    const maxVotesDenom = Math.max(1, ...voteUniverse.map((p) => voteCounts.get(p.id) || 0));

    return (
      <div className="screen-tv big-reveal-wrap" style={{ position: "relative" }}>
        {/* ✅ pinned top-left regardless of big-reveal centering */}
        <button
          className="btn-text"
          style={{ position: "absolute", left: "1.25rem", top: "1.25rem" }}
          onClick={handleCloseLobby}
        >
          ← Close lobby
        </button>

        <div className="big-reveal">
          <div className="big-reveal-top">
            <div className="big-reveal-kicker">THE BIG REVEAL</div>
            <div className="big-reveal-title">
              {imposterCaught ? "IMPOSTER CAUGHT!" : "IMPOSTER ESCAPED!"}
            </div>
            <div className="big-reveal-sub">
              {word ? (
                <>
                  The secret word was <span className="big-reveal-word">“{word}”</span>
                </>
              ) : (
                "The secret word is shown on player devices."
              )}
            </div>
          </div>

          <div className="big-reveal-grid">
            <div className="card big-reveal-card">
              <div className="tv-section-title">Imposter</div>
              <div className="big-reveal-people">
                {imposters.length ? (
                  imposters.map((p) => (
                    <div key={p.id} className="big-reveal-name">
                      {p.name}
                    </div>
                  ))
                ) : (
                  <div style={{ opacity: 0.85 }}>Unknown</div>
                )}
              </div>

              <div className="hint" style={{ marginTop: 12, opacity: 0.8 }}>
                {imposterCaught ? "Nice work, detectives." : "That’s going in the villain arc."}
              </div>
            </div>

            <div className="card big-reveal-card">
              <div className="tv-section-title">Vote breakdown</div>

              <div className="tv-bar-chart" style={{ marginTop: 12 }}>
                {voteUniverse
                  .map((p) => ({ player: p, count: voteCounts.get(p.id) || 0 }))
                  .sort((a, b) => b.count - a.count || a.player.name.localeCompare(b.player.name))
                  .map(({ player: p, count }) => {
                    const pct = Math.round((count / maxVotesDenom) * 100);
                    return (
                      <div key={p.id} className="tv-bar-row">
                        <div className="tv-bar-name">{p.name}</div>
                        <div className="tv-bar-track">
                          <div className="tv-bar-fill" style={{ width: `${pct}%` }} />
                        </div>
                        <div className="tv-bar-count">{count}</div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>

          <div className="big-reveal-actions">
            <button className="btn-secondary" onClick={() => setPhase("lobby")}>
              Back to lobby
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
