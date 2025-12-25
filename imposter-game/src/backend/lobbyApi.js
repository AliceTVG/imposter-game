import { supabase } from "./supabaseClient";

// --- Name safety / uniqueness ---
const MAX_NAME_LEN = 18;
const BANNED_SUBSTRINGS = [
  // Keep this short + obvious for now. You can expand later.
  "nigger",
  "faggot",
  "tranny",
  "kike",
  "spic",
  "chink",
  "retard",
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

function isNameAllowed(name) {
  const lower = name.toLowerCase();
  return !BANNED_SUBSTRINGS.some((b) => lower.includes(b));
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
        started_at: null,
        revealed_at: null,
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
    throw new Error("That name is already taken in this lobby. Please choose another.");
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
  const { data, error } = await supabase
    .from("games")
    .update({
      started_at: new Date().toISOString(),
      revealed_at: null,
    })
    .eq("code", upper)
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
