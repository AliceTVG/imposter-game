// src/components/RoleCard.jsx

export default function RoleCard({ isImposter, word, visible, onShow, onHide }) {
  return (
    <div className="role-card-wrapper">
      <div
        className={
          "role-card-inner" + (visible ? " role-card-inner--flipped" : "")
        }
      >
        {/* FRONT (hidden) */}
        <div className="role-card-face role-card-face--front">
          <div>
            <p className="role-card-title">Ready?</p>
            <p className="role-card-text">
              Make sure nobody else can see, then tap to reveal your role.
            </p>
          </div>
          <button type="button" className="btn-primary" onClick={onShow}>
            Reveal role
          </button>
        </div>

        {/* BACK (revealed) */}
        <div className="role-card-face role-card-face--back">
          <div>
            {isImposter ? (
              <>
                <p className="role-card-main">
                  You are the <strong>IMPOSTER</strong>.
                </p>
                <p className="role-card-text">
                  Blend in, give vague clues, and don&apos;t get caught.
                </p>
              </>
            ) : (
              <>
                <p className="role-card-main">The secret word is:</p>
                <p className="role-card-word">{word}</p>
                <p className="role-card-text role-card-text-subtle">
                  Describe it without giving it away to the imposter.
                </p>
              </>
            )}
          </div>

          <button type="button" className="btn-secondary" onClick={onHide}>
            Hide role
          </button>
        </div>
      </div>
    </div>
  );
}
