export default function RoleCard({ isImposter, word, visible, onShow, onHide }) {
  if (!visible) {
    return (
      <button className="btn-primary mt" onClick={onShow}>
        Tap to see your role
      </button>
    );
  }

  return (
    <div className="role-card">
      {isImposter ? (
        <>
          <h3>You are the IMPOSTER</h3>
          <p>Blend in and don't get caught</p>
        </>
      ) : (
        <>
          <h3>Your word:</h3>
          <p className="secret-word">{word}</p>
        </>
      )}
      <button className="btn-secondary mt" onClick={onHide}>
        Hide role
      </button>
    </div>
  );
}
