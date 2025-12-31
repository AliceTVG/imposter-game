import { supabase } from "./supabaseClient";
// Engine utilities live alongside this file in this repo.
import { pickFirstSpeakerForRound } from "../game/multiDeviceEngine";

// --- Name safety / uniqueness ---
const MAX_NAME_LEN = 18;
const BANNED_SUBSTRINGS = [
  // Keep this short + obvious for now. You can expand later.
  "nigger",
  "nigga",
  "faggot",
  "fag",
  "tranny",
  "kike",
  "spic",
  "chink",
  "retard",
  "spastic",
  "spaz",
  "dyke",
  "coon",
  "rape",
  "rapist",
  "pedophile",
  "pedo",
];

function ensureSupabase() {
  if (!supabase) {
    throw new Error(
      "Supabase is not configured. Multi-device mode is unavailable."
    );
  }
}

function sanitizeName(raw) {
  const trimmed = (raw ?? "").toString().trim();
  const squashed = trimmed.replace(/\s+/g, " ");
  // eslint-disable-next-line no-control-regex
  const cleaned = squashed.replace(/[\x00-\x1F\x7F]/g, "");
  return cleaned.slice(0, MAX_NAME_LEN);
}

function normalizeForModeration(s) {
  return (s ?? "")
    .toString()
    .toLowerCase()
    .replace(/[@]/g, "a")
    .replace(/[0]/g, "o")
    .replace(/[1!]/g, "i")
    .replace(/[3]/g, "e")
    .replace(/[4]/g, "a")
    .replace(/[5$]/g, "s")
    .replace(/[7]/g, "t")
    .replace(/[^a-z0-9]/g, "")
    .replace(/(.)\1{2,}/g, "$1$1");
}

function isNameAllowed(name) {
  const norm = normalizeForModeration(name);
  return !BANNED_SUBSTRINGS.some((b) => norm.includes(b));
}

function isTextAllowed(text) {
  const norm = normalizeForModeration(text);
  return !BANNED_SUBSTRINGS.some((b) => norm.includes(b));
}

function generateGameCode(length = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

// Create a new game lobby with a unique code
export async function createGameLobby({
  categoryId,
  categoryName,
  categoryWords,
  forceSingleImposter = false,
  requireChatClue = false,
}) {
  ensureSupabase();
  let attempts = 0;

  while (attempts < 5) {
    const code = generateGameCode();
    const { data, error } = await supabase
      .from("games")
      .insert({
        code,
        category_id: categoryId,
        category_name: categoryName,
        category_words: categoryWords,
        force_single_imposter: forceSingleImposter,
        require_chat_clue: requireChatClue,
        started_at: null,
        revealed_at: null,
        first_speaker_player_id: null,
        host_player_id: null,
      })
      .select()
      .single();

    if (!error && data) {
      return data;
    }

    // If it's a uniqueness violation on code, try again with a different code
    if (error && error.code === "23505") {
      attempts += 1;
      continue;
    }

    if (error) {
      console.error("createGameLobby error", error);
      throw error;
    }
  }

  throw new Error("Could not create game lobby after several attempts.");
}

// Chat: add a message for the current round
export async function sendChatMessage({
  gameId,
  playerId,
  name,
  text,
  roundKey,
}) {
  ensureSupabase();
  const body = (text ?? "").toString().trim();
  if (!body) throw new Error("Message can't be empty.");

  if (body.length > 200) {
    return { error: "Message too long" };
  }

  if (!isTextAllowed(body)) {
    return { error: "Message not allowed" };
  }

  const payload = {
    game_id: gameId,
    round_key: roundKey || null,
    player_id: playerId || null,
    name: (name ?? "").toString().slice(0, MAX_NAME_LEN),
    message: body.slice(0, 200),
  };

  const { data, error } = await supabase
    .from("chat_messages")
    .insert(payload)
    .select()
    .single();

  if (error) {
    console.error("sendChatMessage error", error);
    throw error;
  }
  return data;
}

export async function fetchChatMessages({ gameId, roundKey, limit = 80 }) {
  ensureSupabase();
  let q = supabase
    .from("chat_messages")
    .select("*")
    .eq("game_id", gameId)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (roundKey) q = q.eq("round_key", roundKey);

  const { data, error } = await q;
  if (error) {
    console.error("fetchChatMessages error", error);
    throw error;
  }
  return data || [];
}

/**
 * Voting: MULTI-SELECT TOGGLE
 *
 * IMPORTANT: This requires the votes table uniqueness to be:
 *   unique (game_id, round_key, voter_player_id, target_player_id)
 *
 * Behaviour:
 * - If vote exists for (voter -> target) this round: delete it (toggle off)
 * - Else insert it (toggle on) unless maxSelections would be exceeded
 *
 * Params:
 * - maxSelections (optional): enforce cap per voter (e.g. Math.floor(players/2))
 *
 * Return:
 * - { selected: boolean }
 */
export async function castVote({
  gameId,
  roundKey,
  voterPlayerId,
  targetPlayerId,
  maxSelections,
}) {
  ensureSupabase();
  if (!gameId || !roundKey || !voterPlayerId || !targetPlayerId) {
    throw new Error("Missing vote info");
  }

  // 1) Check if this vote already exists -> toggle OFF
  const { data: existing, error: existingErr } = await supabase
    .from("votes")
    .select("id")
    .eq("game_id", gameId)
    .eq("round_key", roundKey)
    .eq("voter_player_id", voterPlayerId)
    .eq("target_player_id", targetPlayerId)
    .limit(1);

  if (existingErr) {
    console.error("castVote existing check error", existingErr);
    throw existingErr;
  }

  if (existing && existing.length > 0) {
    const { error: delErr } = await supabase
      .from("votes")
      .delete()
      .eq("game_id", gameId)
      .eq("round_key", roundKey)
      .eq("voter_player_id", voterPlayerId)
      .eq("target_player_id", targetPlayerId);

    if (delErr) {
      console.error("castVote delete error", delErr);
      throw delErr;
    }

    return { selected: false };
  }

  // 2) Enforce cap -> toggle ON
  if (typeof maxSelections === "number") {
    const { count, error: countErr } = await supabase
      .from("votes")
      .select("*", { count: "exact", head: true })
      .eq("game_id", gameId)
      .eq("round_key", roundKey)
      .eq("voter_player_id", voterPlayerId);

    if (countErr) {
      console.error("castVote count error", countErr);
      throw countErr;
    }

    if ((count || 0) >= maxSelections) {
      throw new Error("Vote limit reached");
    }
  }

  // 3) Insert the new selection
  const { error: insErr } = await supabase.from("votes").insert({
    game_id: gameId,
    round_key: roundKey,
    voter_player_id: voterPlayerId,
    target_player_id: targetPlayerId,
  });

  if (insErr) {
    console.error("castVote insert error", insErr);
    throw insErr;
  }

  return { selected: true };
}

export async function fetchVotes({ gameId, roundKey }) {
  ensureSupabase();
  const { data, error } = await supabase
    .from("votes")
    .select("*")
    .eq("game_id", gameId)
    .eq("round_key", roundKey);

  if (error) {
    console.error("fetchVotes error", error);
    throw error;
  }
  return data || [];
}

// Add a player to a game by code (enforces unique, sanitized names)
export async function joinGame({ code, name }) {
  ensureSupabase();
  const upper = code.trim().toUpperCase();
  const safeName = sanitizeName(name);

  if (!safeName) throw new Error("Please enter a name.");
  if (!isNameAllowed(safeName))
    throw new Error("That name isn't allowed. Please choose another.");

  const { data: game, error: gameError } = await supabase
    .from("games")
    .select("*")
    .eq("code", upper)
    .single();

  if (gameError) {
    console.error("joinGame - gameError", gameError);
    throw gameError;
  }

  // Reject duplicate names within the lobby (case-insensitive)
  const { data: existingPlayers, error: existingError } = await supabase
    .from("players")
    .select("name")
    .eq("game_id", game.id);

  if (existingError) {
    console.error("joinGame - existingError", existingError);
    throw existingError;
  }

  const taken = new Set(
    (existingPlayers || []).map((p) => (p.name ?? "").toLowerCase())
  );

  if (taken.has(safeName.toLowerCase())) {
    throw new Error(
      "That name is already taken in this lobby. Please choose another."
    );
  }

  const finalName = safeName;

  const { data: player, error: playerError } = await supabase
    .from("players")
    .insert({
      game_id: game.id,
      name: finalName,
      ready_for_next_round: true,
      last_seen_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (playerError) {
    console.error("joinGame - playerError", playerError);
    throw playerError;
  }

  return { game, player };
}

// Set which player is the host for a game
export async function setGameHost(gameId, playerId) {
  ensureSupabase();
  const { data, error } = await supabase
    .from("games")
    .update({ host_player_id: playerId })
    .eq("id", gameId)
    .select()
    .single();

  if (error) {
    console.error("setGameHost error", error);
    throw error;
  }
  return data;
}

// Mark a player as ready / not ready for the next round
export async function setPlayerReady(playerId, ready) {
  ensureSupabase();
  const { data, error } = await supabase
    .from("players")
    .update({
      ready_for_next_round: ready,
      last_seen_at: new Date().toISOString(),
    })
    .eq("id", playerId)
    .select()
    .single();

  if (error) {
    console.error("setPlayerReady error", error);
    throw error;
  }
  return data;
}

// Host can change category without changing room/code
export async function updateGameCategory(code, { categoryId, categoryName, categoryWords }) {
  ensureSupabase();
  const upper = code.trim().toUpperCase();

  const { data, error } = await supabase
    .from("games")
    .update({
      category_id: categoryId,
      category_name: categoryName,
      category_words: categoryWords,
    })
    .eq("code", upper)
    .select()
    .single();

  if (error) {
    console.error("updateGameCategory error", error);
    throw error;
  }
  return data;
}

// Host kick / remove a player
export async function kickPlayer(playerId) {
  ensureSupabase();
  if (!playerId) return;
  const { error } = await supabase.from("players").delete().eq("id", playerId);
  if (error) {
    console.error("kickPlayer error", error);
    throw error;
  }
}

// Heartbeat: keep an active player from being pruned
export async function touchPlayer(playerId) {
  ensureSupabase();
  if (!playerId) return;
  const { error } = await supabase
    .from("players")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", playerId);
  if (error) {
    console.error("touchPlayer error", error);
    throw error;
  }
}

// Host cleanup: remove inactive players
export async function pruneInactivePlayers(gameId, timeoutSeconds = 120) {
  ensureSupabase();
  if (!gameId) return;
  const cutoff = new Date(Date.now() - timeoutSeconds * 1000).toISOString();

  const { error } = await supabase
    .from("players")
    .delete()
    .eq("game_id", gameId)
    .or(`last_seen_at.lt.${cutoff},last_seen_at.is.null`);

  if (error) {
    console.error("pruneInactivePlayers error", error);
    throw error;
  }
}

// Remove a player completely (used when someone quits)
// If they were the host, promote another player to host.
export async function leaveGame(playerId) {
  ensureSupabase();
  if (!playerId) return;

  const { data: player, error: playerError } = await supabase
    .from("players")
    .select("*")
    .eq("id", playerId)
    .single();

  if (playerError) {
    console.error("leaveGame - playerError", playerError);
    // If player doesn't exist any more, nothing to do
    if (playerError.code === "PGRST116") return;
    throw playerError;
  }

  const { data: game, error: gameError } = await supabase
    .from("games")
    .select("*")
    .eq("id", player.game_id)
    .single();

  if (gameError) {
    console.error("leaveGame - gameError", gameError);
    throw gameError;
  }

  const { error: deleteError } = await supabase
    .from("players")
    .delete()
    .eq("id", playerId);

  if (deleteError) {
    console.error("leaveGame - deleteError", deleteError);
    throw deleteError;
  }

  if (game.host_player_id !== playerId) return;

  const { data: remaining, error: remainingError } = await supabase
    .from("players")
    .select("*")
    .eq("game_id", game.id);

  if (remainingError) {
    console.error("leaveGame - remainingError", remainingError);
    throw remainingError;
  }

  if (!remaining || remaining.length === 0) {
    const { error: clearError } = await supabase
      .from("games")
      .update({ host_player_id: null })
      .eq("id", game.id);

    if (clearError) {
      console.error("leaveGame - clear host error", clearError);
      throw clearError;
    }
    return;
  }

  const idx = Math.floor(Math.random() * remaining.length);
  const newHost = remaining[idx];

  const { error: hostError } = await supabase
    .from("games")
    .update({ host_player_id: newHost.id })
    .eq("id", game.id);

  if (hostError) {
    console.error("leaveGame - host update error", hostError);
    throw hostError;
  }
}

// Fetch a game and its players by lobby code
export async function fetchLobbyByCode(code) {
  ensureSupabase();
  const upper = code.trim().toUpperCase();

  const { data: game, error: gameError } = await supabase
    .from("games")
    .select("*")
    .eq("code", upper)
    .single();

  if (gameError) {
    console.error("fetchLobbyByCode - gameError", gameError);
    throw gameError;
  }

  const { data: players, error: playersError } = await supabase
    .from("players")
    .select("*")
    .eq("game_id", game.id)
    .order("joined_at", { ascending: true });

  if (playersError) {
    console.error("fetchLobbyByCode - playersError", playersError);
    throw playersError;
  }

  return { game, players };
}

// Mark a game as started (new round); also clear any previous reveal
export async function startGame(code) {
  ensureSupabase();
  const upper = code.trim().toUpperCase();

  // Fetch game + players first so we can deterministically pick a first speaker.
  const { data: existing, error: fetchError } = await supabase
    .from("games")
    .select("id, code, force_single_imposter")
    .eq("code", upper)
    .single();

  if (fetchError) {
    console.error("startGame - fetch game error", fetchError);
    throw fetchError;
  }

  const { data: players, error: playersError } = await supabase
    .from("players")
    .select("id, name, ready_for_next_round")
    .eq("game_id", existing.id)
    .order("joined_at", { ascending: true });

  if (playersError) {
    console.error("startGame - fetch players error", playersError);
    throw playersError;
  }

  const startedAt = new Date().toISOString();
  const readyPlayers = (players || []).filter((p) => p.ready_for_next_round);

  const first = pickFirstSpeakerForRound({
    code: existing.code,
    players: readyPlayers,
    roundKey: startedAt,
    minImposters: 1,
    maxImposters: existing.force_single_imposter ? 1 : undefined,
  });

  const { data, error } = await supabase
    .from("games")
    .update({
      started_at: startedAt,
      revealed_at: null,
      first_speaker_player_id: first?.id || null,
    })
    .eq("id", existing.id)
    .select()
    .single();

  if (error) {
    console.error("startGame error", error);
    throw error;
  }
  return data;
}

// Mark a game as revealed so all clients can move to the result screen
// and clear everyone’s ready flag for the next round.
export async function revealGame(code) {
  ensureSupabase();
  const upper = code.trim().toUpperCase();
  const now = new Date().toISOString();

  // fetch game first to ensure a round has started
  const { data: existing, error: fetchError } = await supabase
    .from("games")
    .select("id, started_at")
    .eq("code", upper)
    .single();

  if (fetchError) {
    console.error("revealGame - fetchError", fetchError);
    throw fetchError;
  }

  if (!existing?.started_at) {
    throw new Error("You can't reveal results before a round has started.");
  }

  const { data: game, error: gameError } = await supabase
    .from("games")
    .update({ revealed_at: now })
    .eq("code", upper)
    .select()
    .single();

  if (gameError) {
    console.error("revealGame - gameError", gameError);
    throw gameError;
  }

  const { error: playersError } = await supabase
    .from("players")
    .update({ ready_for_next_round: false })
    .eq("game_id", game.id);

  if (playersError) {
    console.error("revealGame - playersError", playersError);
    throw playersError;
  }

  return game;
}

// Optional helper for debugging
export async function listGamesByCategory(categoryId) {
  ensureSupabase();
  const { data, error } = await supabase
    .from("games")
    .select("*")
    .eq("category_id", categoryId);

  if (error) {
    console.error("listGamesByCategory error", error);
    throw error;
  }

  return data;
}
