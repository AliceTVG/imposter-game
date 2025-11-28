export const GameMode = {
    LOCAL: "local",
    // ONLINE: "online", // future
};

/**
 * @typedef {Object} Category
 * @property {string} id
 * @property {string} name
 * @property {string[]} words
 */

/**
 * @typedef {Object} GameState
 * @property {"local"} mode
 * @property {number} playerCount
 * @property {number} imposterCount
 * @property {string} categoryId
 * @property {string} categoryName
 * @property {string} word
 * @property {number[]} imposters   // player numbers
 * @property {number} revealedIndex // 0-based index of last revealed player
 */
