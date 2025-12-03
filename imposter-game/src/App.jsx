import { useState } from "react";
import { loadCategories, saveCategories } from "./storage/categoriesStorage";
import { createLocalGame } from "./game/engine";
import { isImposter } from "./game/engine";

import HomeScreen from "./screens/HomeScreen.jsx";
import SetupGameScreen from "./screens/SetupGameScreen.jsx";
import ManageCategoriesScreen from "./screens/ManageCategoriesScreen.jsx";
import RevealRolesScreen from "./screens/RevealRolesScreen.jsx";
import PlayScreen from "./screens/PlayScreen.jsx";
import RevealResultScreen from "./screens/RevealResultScreen.jsx";
import HowToPlayScreen from "./screens/HowToPlayScreen.jsx";
import ShareGameScreen from "./screens/ShareGameScreen.jsx";
import MultiJoinScreen from "./screens/MultiJoinScreen.jsx";
import MultiHostScreen from "./screens/MultiHostScreen.jsx";
import MultiModeScreen from "./screens/MultiModeScreen.jsx";


function App() {
  const initialJoinCode = (() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const j = params.get("join");
      return j ? j.toUpperCase() : "";
    } catch {
      return "";
    }
  })();
  const [screen, setScreen] = useState(initialJoinCode ? "multi" : "home");
  const [categories, setCategories] = useState(() => loadCategories());
  const [currentGame, setCurrentGame] = useState(null);
  const [lastImposters, setLastImposters] = useState([]);
  const [multiSubscreen, setMultiSubscreen] = useState(
    initialJoinCode ? "join" : "menu"
  );
  const [pendingJoinCode] = useState(initialJoinCode);

  const updateCategories = (next) => {
    setCategories(next);
    saveCategories(next);
  };

  const handleStartGame = ({ playerCount, imposterCount, categoryId, playerNames }) => {
    try {
      const game = createLocalGame(
        { playerCount, imposterCount, categoryId, playerNames, lastImposters },
        categories
      );
      setCurrentGame(game);
      setLastImposters(game.imposters)
      setScreen("reveal");
    } catch (err) {
      alert(err.message);
    }
  };

  const handleResetToHome = () => {
    setCurrentGame(null);
    setScreen("home");
  };

  const handleReplay = () => {
    if (!currentGame) return;
    try {
      const game = createLocalGame(
        {
          playerCount: currentGame.playerCount,
          imposterCount: currentGame.imposterCount,
          categoryId: currentGame.categoryId,
          playerNames: currentGame.playerNames,
        },
        categories
      );
      setCurrentGame(game);
      setScreen("reveal");
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="app" >
      {screen === "home" && (
        <HomeScreen
          onPlay={() => setScreen("setup")}
          onManage={() => setScreen("manage")}
          onHowToPlay={() => setScreen("rules")}
          onShare={() => setScreen("share")}
          onPlayMulti={() => {
            setMultiSubscreen("menu");
            setScreen("multi");
          }}
        />
      )}

      {screen === "setup" && (
        <SetupGameScreen
          categories={categories}
          onBack={() => setScreen("home")}
          onStart={handleStartGame}
        />
      )}

      {screen === "manage" && (
        <ManageCategoriesScreen
          categories={categories}
          setCategories={updateCategories}
          onBack={() => setScreen("home")}
        />
      )}

      {screen === "reveal" && currentGame && (
        <RevealRolesScreen
          game={currentGame}
          isImposter={isImposter}
          onAllDone={() => setScreen("play")}
          onAbort={handleResetToHome}
       />
      )}


      {screen === "play" && currentGame && (
        <PlayScreen
          onReveal={() => setScreen("result")}
          onAbort={handleResetToHome}
        />
      )}

      {screen === "result" && currentGame && (
          <RevealResultScreen
            game={currentGame}
            onHome={handleResetToHome}
            onReplay={handleReplay}
          />
        )}
      
      {screen === "rules" && (
        <HowToPlayScreen onBack={() => setScreen("home")} />
      )}

      {screen === "share" && (
        <ShareGameScreen onBack={() => setScreen("home")} />
      )}

      {screen === "multi" && (
        multiSubscreen === "menu" ? (
          <MultiModeScreen
            onBack={() => setScreen("home")}
            onHost={() => setMultiSubscreen("host")}
            onJoin={() => setMultiSubscreen("join")}
          />
        ) : multiSubscreen === "host" ? (
          <MultiHostScreen
            categories={categories}
            onBack={() => setMultiSubscreen("menu")}
          />
        ) : (
          <MultiJoinScreen
            categories={categories}
            onBack={() => setMultiSubscreen("menu")}
            initialCode={pendingJoinCode}
          />
        )
      )}

    </div>
  );


  
};

export default App;