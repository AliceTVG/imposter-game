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


function App() {
  const [screen, setScreen] = useState("home");
  const [categories, setCategories] = useState(() => loadCategories());
  const [currentGame, setCurrentGame] = useState(null);

  const updateCategories = (next) => {
    setCategories(next);
    saveCategories(next);
  };

  const handleStartGame = ({ playerCount, imposterCount, categoryId, playerNames }) => {
    try {
      const game = createLocalGame(
        { playerCount, imposterCount, categoryId, playerNames },
        categories
      );
      setCurrentGame(game);
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

    </div>
  );


  
};

export default App;