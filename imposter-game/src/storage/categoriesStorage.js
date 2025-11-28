const STORAGE_KEY = "imposter_categories_v1";

const DEFAULT_CATEGORIES = [
    {
        id: "food",
        name: "Food",
        words: ["Pizza", "Burger", "Sushi", "Pasta", "Ice Cream"],
    },
    {
        id: "animals",
        name: "Animals",
        words: ["Cat", "Dog", "Elephant", "Shark", "Penguin"],
    },
];

/**
 * @returns {Array}
 */
export function loadCategories() {
    if (typeof localStorage === "undefined") return DEFAULT_CATEGORIES;

    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return DEFAULT_CATEGORIES;

    try {
        const parsed = JSON.parse(stored);
        if (!Array.isArray(parsed)) return DEFAULT_CATEGORIES;
        return parsed;
    } catch {
        return DEFAULT_CATEGORIES;
    }
}

/**
 * @param {Array} categories
 */
export function saveCategories(categories) {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(categories));
}