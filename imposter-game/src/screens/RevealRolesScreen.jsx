import { useState } from "react";
import RoleCard from "../components/RoleCard.jsx";

export default function RevealRolesScreen({
  game,
  isImposter,
  onAllDone,
  onAbort,
}) {
  const [activePlayer, setActivePlayer] = useState(null); // 1-based player number
  const [roleVisible, setRoleVisible] = useState(false);
  const [revealedPlayers, setRevealedPlayers] = useState([]); // array of player numbers
  const [allRevealed, setAllRevealed] = useState(false);

  const { playerCount, playerNames } = game;
  const players = Array.from({ length: playerCount }, (_, i) => i + 1);

  const isPlayerDone = (n) => revealedPlayers.includes(n);

  const handleSelectPlayer = (n) => {
    // can't change while a role is visible, and can't reopen done players
    if (roleVisible || isPlayerDone(n)) return;
    setActivePlayer(n);
    setRoleVisible(false);
  };

  const handleHideRole = () => {
    if (!activePlayer) return;

    setRevealedPlayers((prev) => {
      if (prev.includes(activePlayer)) return prev;
      const next = [...prev, activePlayer];

      // if everyone has now seen their role, stop auto-advancing
      if (next.length === playerCount) {
        setAllRevealed(true);
      }

      return next;
    });

    // clear current player & hide the card
    setRoleVisible(false);
    setActivePlayer(null);
  };

  const currentName =
    activePlayer && playerNames && playerNames[activePlayer - 1]
      ? playerNames[activePlayer - 1]
      : activePlayer
      ? `Player ${activePlayer}`
      : null;

  const currentIsImposter =
    activePlayer != null ? isImposter(game, activePlayer) : false;

  return (
    <div>
      <button className="btn-text" onClick={onAbort}>
        ← Abort game
      </button>
      <h2>Role Reveal</h2>
      <p className="hint">
        Each player taps their name, checks their role, taps &quot;Hide role&quot;,
        and their name will grey out. When everyone is greyed out, the game continues.
      </p>

      <div
        className="card"
        style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}
      >
        {players.map((n) => {
          const name =
            playerNames && playerNames[n - 1]
              ? playerNames[n - 1]
              : `Player ${n}`;
          const done = isPlayerDone(n);
          const isActive = activePlayer === n;

          return (
            <button
              key={n}
              type="button"
              onClick={() => handleSelectPlayer(n)}
              className={
                "player-chip " +
                (done ? "player-chip-done" : isActive ? "player-chip-active" : "")
              }
              disabled={done || roleVisible}
            >
              {name}
            </button>
          );
        })}
      </div>

      {allRevealed && (
        <div style={{ marginTop: "1rem" }}>
          <button className="btn-primary" onClick={onAllDone}>
            Continue to discussion
          </button>
        </div>
      )}

      {activePlayer && (
        <div style={{ marginTop: "1rem" }}>
          <p>
            Hand the device to <strong>{currentName}</strong> and make sure no
            one else can see.
          </p>

          <RoleCard
            isImposter={currentIsImposter}
            word={game.word}
            visible={roleVisible}
            onShow={() => setRoleVisible(true)}
            onHide={handleHideRole}
          />
        </div>
      )}
    </div>
  );
}
