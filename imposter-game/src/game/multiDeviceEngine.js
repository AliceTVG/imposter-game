// src/game/multiDeviceEngine.js

// Simple deterministic hash → integer
export function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

// Pick a word from a list based on a seed string
export function pickWordForCode(seed, words) {
  if (!words?.length) return "???";
  const idx = hashString(seed) % words.length;
  return words[idx];
}

/**
 * Compute the *shared* outcome for a lobby:
 * - which word is used
 * - which players are imposters
 *
 * Everyone uses the same inputs (code + players list + roundKey), so the result is
 * deterministic across devices *for that round*, but different between rounds.
 */
export function computeMultiDeviceOutcome({
  code,
  players,
  category,
  roundKey,          // NEW: e.g. started_at timestamp for this round
  minImposters = 1,
  maxImposters,      // optional upper bound
}) {
  const words = category?.words || [];

  // Seed for this round: same code but different started_at → different seed
  const seedBase = roundKey ? `${code}|${roundKey}` : code;

  const word = pickWordForCode(seedBase, words);

  const playerList = Array.isArray(players) ? players : [];
  const n = playerList.length;

  if (n < 2) {
    // Can't sensibly have imposters with < 2 players
    return { word, imposters: [] };
  }

  // Base target: about 25% of players as imposters
  let target = Math.round(n * 0.25);
  if (target < minImposters) target = minImposters;

  const hardMax = maxImposters ?? Math.max(1, Math.floor(n / 3));
  if (target > hardMax) target = hardMax;

  // Always keep at least one non-imposter
  if (target >= n) target = n - 1;

  // Rank players deterministically by a hash that includes the round seed
  const ranked = playerList
    .map((p) => ({
      id: p.id,
      name: p.name ?? "",
      key: hashString(`${seedBase}|${p.name ?? ""}`),
    }))
    .sort((a, b) => a.key - b.key);

  const imposters = ranked.slice(0, target).map((p) => p.id);

  return {
    word,
    imposters,
  };
}

/**
 * Convenience helper: given the shared outcome + your player id,
 * return { word, isImposter } for this device.
 */
export function computeMultiDeviceRoleForPlayer(outcome, playerId) {
  const isImposter = outcome.imposters.includes(playerId);
  return {
    word: outcome.word,
    isImposter,
  };
}
