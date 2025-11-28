// src/screens/ShareGameScreen.jsx
import QRCode from "react-qr-code";

export default function ShareGameScreen({ onBack }) {
  const shareUrl = window.location.origin;

  return (
    <div className="screen-container">
      <button className="btn-text screen-header-left" onClick={onBack}>
        ← Back
      </button>

      <h1>Share Game</h1>

      <div className="card card-narrow mt-lg" style={{ textAlign: "center" }}>
        <p style={{ marginBottom: "1rem" }}>
          Ask everyone to scan this code to open Imposter Game on their own
          device.
        </p>

        <div className="qr-wrapper">
          <QRCode
            value={shareUrl}
            size={220}
            bgColor="transparent"
            fgColor="#f9fafb"
          />
        </div>

        <p className="qr-url">
          {shareUrl.replace(/^https?:\/\//, "")}
        </p>
      </div>
    </div>
  );
}
