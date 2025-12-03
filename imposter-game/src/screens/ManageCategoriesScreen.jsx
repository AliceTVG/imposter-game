import { useRef, useState, useEffect} from "react";

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
  const [showBulk, setShowBulk] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [error, setError] = useState("");


  const selected = categories.find((c) => c.id === selectedId);

  const textRef = useRef(null);

  const autoResize = () => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }

  useEffect(() => {
    if (showBulk) {
        autoResize();
    }
  }, [showBulk]);

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

    const exists = selected.words.some(
        (w) => w.trim().toLowerCase() === word.toLowerCase()
    )

    if (exists) {
        setError(`"${word}" is already in this category.`);
        return;
    }

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

  const handleBulkAdd = () => {
    if (!selected) return;

    const existing = selected.words.map((w) => w.trim().toLowerCase());

    const incoming = bulkText
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
    
    if (incoming.length === 0) {
        setError ("No valid words found.");
        return;
    }

    const seenNew = new Set();
    const toAdd = [];

    for (const word of incoming) {
        const lower = word.toLowerCase();

        if (existing.includes(lower) || seenNew.has(lower)) {
            continue;
        }

        seenNew.add(lower);
        toAdd.push(word);
    }

    if (toAdd.length === 0) {
        setError("All of those words are already in this category");
        return;
    }

    const next = categories.map((c) =>
        c.id === selected.id
            ? { ...c, words: [...c.words, ...toAdd] }
            : c
    );

    setCategories(next)
    setBulkText("");
    setShowBulk(false);
  };

  return (
    <div>
      <button className="btn-text" onClick={onBack}>
        ← Back
      </button>
      <h2>Manage Categories</h2>

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
        <button
            type="button"
            className="btn-secondary"
            style={{ marginBottom: "0.75rem", width: "100%" }}
            onClick={() => setShowBulk((prev) => !prev)}
        >
            {showBulk ? "Cancel bulk add" : "Bulk add words"}
        </button>

        {showBulk && (
            <div className="field">
                <textarea
                    ref={textRef}
                    style={{
                        minHeight: "120px",
                        borderRadius: "0.5rem",
                        padding: "0.5rem",
                        background: "#020617",
                        color: "#f9fafb",
                        border: "1px solid #4b5563",
                        resize: "none",
                        overflow: "hidden"
                    }}
                    placeholder={"One word per line\nExample:\nPizza\nBurger\nSushi"}
                    value={bulkText}
                    onChange={(e) => {
                        setBulkText(e.target.value);
                        autoResize();
                    }}
                ></textarea>

                <button
                    type="button"
                    className="btn-primary mt"
                    onClick={handleBulkAdd}
                >
                    Add all words
                </button>
            </div>
        )}
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
