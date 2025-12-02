// src/App.tsx
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "./App.css";

import { default as RotatingHeartLoader } from "./components/Loading";
import { AnnotationProvider } from "./contexts/annotationContexts";
import { FileProvider } from "./contexts/fileContexts";

import VisualizationPage from "./routes/VisualizationPage";
import Homepage from "./routes/Homepage";
import DataPage from "./routes/DataPage";
import Homepage2 from "./routes/Homepage2.jsx"; // 搜尋頁（你說的 homepage2）

const BASENAME = import.meta.env.VITE_BASENAME;

function App() {
  return (
    <FileProvider>
      <AnnotationProvider>
        <div className="App">
          <BrowserRouter basename={BASENAME}>
            <Routes>
              {/* ★ 一進來 http://localhost:5173/ 就用搜尋頁 */}
              <Route path="/" element={<Homepage2 />} />

              {/* 同時支援 /search 和 /search.html */}
              <Route path="/search" element={<Homepage2 />} />
              <Route path="/search.html" element={<Homepage2 />} />

              {/* 原本的首頁（預覽那個）如果之後要用，可以放在 /home */}
              <Route path="/home" element={<Homepage />} />

              {/* Data 分頁頁面 */}
              <Route path="/data" element={<DataPage />} />

              {/* Viewer：個別 case */}
              <Route path="/case/:caseId" element={<VisualizationPage />} />

              {/* 測試 loader */}
              <Route path="/test" element={<RotatingHeartLoader />} />
            </Routes>
          </BrowserRouter>
        </div>
      </AnnotationProvider>
    </FileProvider>
  );
}

export default App;



