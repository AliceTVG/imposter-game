export default function MultiModeScreen({ onBack, onHost, onJoin }) {
    return (
        <div className="screen-centered">
            <button className="btn-text screen-header-left" onClick={onBack}>
                ← Back
            </button>

            <h1>Multi-device</h1>

            <div className="card card-narrow mt-lg form-card">
                <p style={{ marginBottom: "1rem" }}>
                    Use this mode when everyone has their own phone, but you're in the same room.
                </p>

                <button className="btn-primary btn-full" onClick={onHost}>
                    Host a new game
                </button>

                <button className="btn-secondary btn-full" onClick={onJoin}>
                    Join with a code
                </button>
            </div>
        </div>
    );
}