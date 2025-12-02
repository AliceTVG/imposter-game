import { supabase } from "./supabaseClient";

function ensureSupabase() {
  if (!supabase) {
    throw new Error(
      "Supabase is not configured. Multi-device mode is unavailable."
    );
  }
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

// Add a player to a game by code
export async function joinGame({ code, name }) {
  const upper = code.trim().toUpperCase();
  const trimmedName = name.trim();

  const { data: game, error: gameError } = await supabase
    .from("games")
    .select("*")
    .eq("code", upper)
    .single();

  if (gameError) {
    console.error("joinGame - gameError", gameError);
    throw gameError;
  }

  const { data: player, error: playerError } = await supabase
    .from("players")
    .insert({
      game_id: game.id,
      name: trimmedName,
      ready_for_next_round: true, // ready for the first / current round
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
  const { data, error } = await supabase
    .from("players")
    .update({ ready_for_next_round: ready })
    .eq("id", playerId)
    .select()
    .single();

  if (error) {
    console.error("setPlayerReady error", error);
    throw error;
  }
  return data;
}

// Remove a player completely (used when someone quits to menu)
// If they were the host, promote another player to host.
export async function leaveGame(playerId) {
  if (!playerId) return;

  // Get the player so we know which game they're in
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

  // Delete the player
  const { error: deleteError } = await supabase
    .from("players")
    .delete()
    .eq("id", playerId);

  if (deleteError) {
    console.error("leaveGame - deleteError", deleteError);
    throw deleteError;
  }

  // If they weren't the host, we're done
  if (game.host_player_id !== playerId) {
    return;
  }

  // They *were* the host. Find remaining players and promote one.
  const { data: remaining, error: remainingError } = await supabase
    .from("players")
    .select("*")
    .eq("game_id", game.id);

  if (remainingError) {
    console.error("leaveGame - remainingError", remainingError);
    throw remainingError;
  }

  if (!remaining || remaining.length === 0) {
    // No one left, clear host
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

  // Pick a new host at random from the remaining players
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
  const upper = code.trim().toUpperCase();
  const now = new Date().toISOString();

  const { data: game, error: gameError } = await supabase
    .from("games")
    .update({
      revealed_at: now,
    })
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
