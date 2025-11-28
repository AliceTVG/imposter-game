import { GameMode } from "./types";

function randomChoice(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function shuffled(arr) {
    const copy = [...arr];
    for (let i = copy.length -1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

/**
 * Create a new local game.
 * 
 * @param {Object} options
 * @param {number} options.playerCount
 * @param {number} options.imposterCount
 * @param {string} options.categoryId
 * @param {Array} categories
 * @returns {import("./types.js").GameState}
 */
// src/game/engine.js
export function createLocalGame(options, categories) {
  const { playerCount, imposterCount, categoryId, playerNames } = options;

  const category = categories.find((c) => c.id === categoryId);
  if (!category) throw new Error("Category not found");
  if (!category.words || category.words.length === 0) {
    throw new Error("Category has no words");
  }

  const word = randomChoice(category.words);

  const players = Array.from({ length: playerCount }, (_, i) => i + 1);
  const shuffledPlayers = shuffled(players);
  const imposters = shuffledPlayers.slice(0, imposterCount);

  const defaultNames = players.map((n) => `Player ${n}`);
  const finalNames =
    Array.isArray(playerNames) && playerNames.length >= playerCount
      ? playerNames.slice(0, playerCount)
      : defaultNames;

  const game = {
    mode: GameMode.LOCAL,
    playerCount,
    imposterCount,
    categoryId,
    categoryName: category.name,
    word,
    imposters,
    playerNames: finalNames,
    revealedPlayers: [], // NEW
  };

  return game;
}


/**
 * Check if a given player is an imposter
 * 
 * @param {import("./types.js").GameState} game
 * @param {number} playerNumber // 1-based
 * @returns {boolean}
 */
export function isImposter(game, playerNumber) {
    return game.imposters.includes(playerNumber);
}