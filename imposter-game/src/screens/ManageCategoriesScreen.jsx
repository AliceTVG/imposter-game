import { useState } from "react";

export default function ManageCategoriesScreen({
  categories,
  setCategories,
  onBack,
}) {
  const [selectedId, setSelectedId] = useState(
    categories[0] ? categories[0].id : ""
  );
  const [newName, setNewName] = useState("");
  const [newWord, setNewWord] = useState("");

  const selected = categories.find((c) => c.id === selectedId);

  const handleAddCategory = () => {
    const name = newName.trim();
    if (!name) return;

    const id = name.toLowerCase().replace(/\s+/g, "-") + "-" + Date.now();
    const next = [...categories, { id, name, words: [] }];
    setCategories(next);
    setSelectedId(id);
    setNewName("");
  };

  const handleAddWord = () => {
    if (!selected) return;
    const word = newWord.trim();
    if (!word) return;

    const next = categories.map((c) =>
      c.id === selected.id ? { ...c, words: [...c.words, word] } : c
    );
    setCategories(next);
    setNewWord("");
  };

  const handleDeleteWord = (word) => {
    if (!selected) return;
    const next = categories.map((c) =>
      c.id === selected.id
        ? { ...c, words: c.words.filter((w) => w !== word) }
        : c
    );
    setCategories(next);
  };

  return (
    <div>
      <button className="btn-text" onClick={onBack}>
        ← Back
      </button>
      <h2>Manage Categories</h2>

      <div className="card" style={{ marginTop: "0.75rem" }}>
        <h3>Categories</h3>

        <div className="field">
          <span>Select category</span>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="field field-inline">
          <input
            type="text"
            placeholder="New category name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button
            type="button"
            className="btn-secondary"
            onClick={handleAddCategory}
          >
            Add Category
          </button>
        </div>
      </div>

      {selected && (
        <div className="card" style={{ marginTop: "1rem" }}>
          <h3>{selected.name} words</h3>

          <ul className="word-list">
            {selected.words.map((w) => (
              <li key={w} className="word-row">
                <span>{w}</span>
                <button
                  type="button"
                  className="btn-icon"
                  onClick={() => handleDeleteWord(w)}
                  aria-label={`Remove ${w}`}
                >
                  ✕
                </button>
              </li>
            ))}
            {selected.words.length === 0 && (
              <li className="word-empty">No words yet. Add some below!</li>
            )}
          </ul>

          <div className="field field-inline">
            <input
                type="text"
                placeholder="New word"
                value={newWord}
                onChange={(e) => setNewWord(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddWord();
                    }
                }}
            />
                <button
                type="button"
                className="btn-secondary"
                onClick={handleAddWord}
                >
                Add word
                </button>
          </div>
        </div>
      )}
    </div>
  );
}
