import type { RenderingEngine } from "@cornerstonejs/core";
import type {
  Color,
  ColorLUT,
  
} from "@cornerstonejs/core/dist/types/types";
import { Niivue } from "@niivue/niivue";
import {
  IconDownload,
  IconHome,
  IconPointer,
  IconReport,
  IconSettings,
  IconZoom,
} from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";

import RotatingModelLoader from "../components/Loading";
import OpacitySlider from "../components/OpacitySlider/OpacitySlider";
import OrganCheckbox from "../components/OrganCheckbox";
import ReportScreen from "../components/ReportScreen/ReportScreen";
import WindowingSlider from "../components/WindowingSlider/WindowingSlider";
import ZoomHandle from "../components/zoomHandle";

import {
  renderVisualization,
  setToolGroupOpacity,
  setVisibilities,
  toggleCrosshairTool,
} from "../helpers/CornerstoneNifti";
import { create3DVolume, updateVisibilities } from "../helpers/NiiVueNifti";
import {
  API_BASE,
  APP_CONSTANTS,
  segmentation_categories,
  segmentation_category_colors,
} from "../helpers/constants";
import { filenameToName } from "../helpers/utils";
import { type CheckBoxData, type LastClicked, type NColorMap } from "../types";

import "./VisualizationPage.css";

function VisualizationPage() {
  // ------------------------
  // URL / caseId 解析
  // ------------------------
  const params = useParams<{ caseId: string }>();

  // URL 中原始的 caseId（例如 "PanTS_00008854"）
  const rawCaseId = params.caseId ?? "1";

  // 給後端 / HuggingFace 用的 ID：移除前綴 "PanTS_"
  const pantsCase = rawCaseId.replace(/^PanTS_/, "");

  // ------------------------
  // refs
  // ------------------------
  const axial_ref = useRef<HTMLDivElement>(null);
  const sagittal_ref = useRef<HTMLDivElement>(null);
  const coronal_ref = useRef<HTMLDivElement>(null);
  const render_ref = useRef<HTMLCanvasElement>(null);
  const cmapRef = useRef<NColorMap>(null);
  const VisualizationContainer_ref = useRef<HTMLDivElement | null>(null);
  const segmentationRef = useRef<any | null>(null);


  // ------------------------
  // state
  // ------------------------
  const [checkState, setCheckState] = useState<boolean[]>([true]);
  const [segmentationRepresentationUIDs, setSegmentationRepresentationUIDs] =
    useState<string[] | null>(null);
  const [NV, setNV] = useState<Niivue | undefined>();
  const [sessionKey, _setSessionKey] = useState<string | undefined>(undefined);
  const [checkBoxData, setCheckBoxData] = useState<CheckBoxData[]>([]);
  const [opacityValue, setOpacityValue] = useState(
    APP_CONSTANTS.DEFAULT_SEGMENTATION_OPACITY * 100
  );
  const [windowWidth, setWindowWidth] = useState(400);
  const [windowCenter, setWindowCenter] = useState(50);
  const [renderingEngine, setRenderingEngine] =
    useState<RenderingEngine | null>(null);
  const [viewportIds, setViewportIds] = useState<string[]>([]);
  const [volumeId, setVolumeId] = useState<string | null>(null);
  const [showReportScreen, setShowReportScreen] = useState(false);
  const [_lastClicked, setLastClicked] = useState<LastClicked | null>(null);
  const [showTaskDetails, setShowTaskDetails] = useState(true);
  const [showOrganDetails, setShowOrganDetails] = useState(false);
  const [loading, setLoading] = useState(true);
  const [labelColorMap, _setLabelColorMap] = useState<{ [k: number]: Color }>(
    segmentation_category_colors
  );
  const [zoomMode, setZoomMode] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [crosshairToolActive, setCrosshairToolActive] = useState(false);

  // ------------------------
  // Crosshair 開關
  // ------------------------
  useEffect(() => {
    toggleCrosshairTool(crosshairToolActive);
  }, [crosshairToolActive]);

  // ------------------------
  // 主 setup：載入 2D + 3D
  // ------------------------
  useEffect(() => {
    const setup = async () => {
      try {
        // 1. checkbox 資料
        const cbData: CheckBoxData[] = segmentation_categories.map(
          (filename, i) => ({
            label: filenameToName(filename),
            id: i + 1,
          })
        );
        setCheckBoxData(cbData);

        // 背景固定 true，其他 label 也預設開啟
        const initialState: boolean[] = [true];
        cbData.forEach((item) => {
          initialState[item.id] = true;
        });
        setCheckState(initialState);

        // 2. 建立 label colormap
        const max = Math.max(
          ...Object.keys(labelColorMap).map((key) => parseInt(key, 10))
        );

        const cmap: ColorLUT = Array.from({ length: max + 1 }, () => [
          0, 0, 0, 0,
        ]);
        for (const key in labelColorMap) {
          const idx = parseInt(key, 10);
          cmap[idx] = labelColorMap[idx];
        }

        if (
          !axial_ref.current ||
          !sagittal_ref.current ||
          !coronal_ref.current ||
          !render_ref.current ||
          cmap.length === 0
        ) {
          return;
        }

        // 3. 先 render 2D 視窗（Cornerstone）
        const result = await renderVisualization(
          axial_ref.current,
          sagittal_ref.current,
          coronal_ref.current,
          cmap,
          pantsCase,
          setLoading
        );

        // 失敗就直接結束，不要往下跑
        if (!result) return;

        const {
          segmentationVolumeArray,
          segRepUIDs,
          renderingEngine,
          viewportIds,
          volumeId,
        } = result;

        setSegmentationRepresentationUIDs(segRepUIDs ?? []);
        setRenderingEngine(renderingEngine);
        setViewportIds(viewportIds);
        setVolumeId(volumeId);

        // 4. 建立 3D volume（Niivue）
        const { nv, cmapCopy } = await create3DVolume(
          render_ref,
          pantsCase,
          labelColorMap
        );
        cmapRef.current = cmapCopy;
        setNV(nv);
        if (segmentationVolumeArray) {
  segmentationRef.current = segmentationVolumeArray;
} else {
  segmentationRef.current = null;
}

      } catch (err) {
        console.warn("❗ setup() failed:", err);
      } finally {
        // 確保一定會把 loading 關掉
        setLoading(false);
      }
    };

    setup();
  }, [pantsCase, labelColorMap]);

  // ------------------------
  // Window / level
  // ------------------------
  const handleWindowChange = (
    newWidth: number | null,
    newCenter: number | null
  ) => {
    const _width = Math.max(newWidth ?? windowWidth, 1);
    const _center = newCenter ?? windowCenter;

    setWindowWidth(_width);
    setWindowCenter(_center);

    if (!renderingEngine || !viewportIds.length || !volumeId) return;

    const windowLow = _center - _width / 2;
    const windowHigh = _center + _width / 2;

    viewportIds.forEach((viewportId) => {
      const viewport = renderingEngine.getViewport(viewportId);
      const actors = viewport.getActors();

      for (const actor of actors) {
        if (actor.uid === volumeId) {
          try {
            const tf = actor.actor.getProperty().getRGBTransferFunction(0);
            tf.setMappingRange(windowLow, windowHigh);
            tf.updateRange();
            viewport.render();
          } catch (e) {
            console.warn("[VOI Error]", e);
          }
        }
      }
    });
  };

  useEffect(() => {
    if (renderingEngine && viewportIds.length && volumeId) {
      handleWindowChange(windowWidth, windowCenter);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderingEngine, viewportIds, volumeId]);

  // ------------------------
  // segmentation 顯示 / 隱藏
  // ------------------------
  useEffect(() => {
    if (segmentationRepresentationUIDs && checkState && NV) {
      const checkStateArr = [
        true, // ID=0 background
        ...checkBoxData.map((item) => !!checkState[item.id]),
      ];
      setVisibilities(segmentationRepresentationUIDs, checkStateArr);
      updateVisibilities(NV, checkStateArr, sessionKey, cmapRef.current);
    }
  }, [
    segmentationRepresentationUIDs,
    checkState,
    NV,
    checkBoxData,
    sessionKey,
  ]);

  // ------------------------
  // Opacity handlers
  // ------------------------
  const handleOpacityOnSliderChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const value = Number(event.target.value);
    setOpacityValue(value);
    setToolGroupOpacity(value / 100);
  };

  const handleOpacityOnFormSubmit = (value: number) => {
    setOpacityValue(value);
    setToolGroupOpacity(value / 100);
  };

  // ------------------------
  // 下載 zip
  // ------------------------
  const handleDownloadClick = async () => {
    const response = await fetch(`${API_BASE}/api/download/${pantsCase}`);
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `${pantsCase}_segmentations.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  // ------------------------
  // Home 按鈕 → 搜尋頁
  // ------------------------
  const navBack = () => {
    window.location.href = "/search.html";
  };

  // ------------------------
  // JSX
  // ------------------------
  return (
    <div
      className="VisualizationPage"
      style={{
        display: "flex",
        overflow: "hidden",
        flexDirection: "column",
        height: "100vh",
        width: "100vw",
      }}
    >
      <div style={{ position: "relative" }}>
        {/* 左上角設定 / Home */}
        <div className="sidebar position-absolute z-3 top-0 left-0">
          <div>
            <div className="flex">
              <div
                className={`hover:bg-gray-700 z-4 cursor-pointer bg-[#0f0824] p-2 ml-4 mt-4 rounded-lg w-fit`}
                onClick={() => setShowTaskDetails((prev) => !prev)}
              >
                <IconSettings color="white" />
              </div>
              <div
                className={`hover:bg-gray-700 z-4 cursor-pointer bg-[#0f0824] p-2 ml-4 mt-4 rounded-lg w-fit`}
                onClick={navBack}
              >
                <IconHome color="white" />
              </div>
            </div>

            {/* 左側控制面板 */}
            <div
              className={`text-black bg-[#0f0824] m-4 z-3 rounded-lg w-64 p-4 pt-3 gap-3 flex flex-col relative transition-all duration-100 origin-top-left ${
                showTaskDetails ? "scale-0" : "scale-100"
              }`}
            >
              {!showTaskDetails && (
                <>
                  {!zoomMode && (
                    <div className="grid grid-cols-6 items-center justify-center">
                      <div></div>
                      <div className="text-white font-bold text-xl col-span-4">
                        {`Case ID: ${pantsCase}`}
                      </div>
                      <div></div>
                    </div>
                  )}

                  {zoomMode ? (
                    <ZoomHandle
                      submitted={zoomLevel}
                      setSubmitted={setZoomLevel}
                      setZoomMode={setZoomMode}
                    />
                  ) : (
                    <>
                      <OpacitySlider
                        opacityValue={opacityValue}
                        handleOpacityOnSliderChange={
                          handleOpacityOnSliderChange
                        }
                        handleOpacityOnFormSubmit={handleOpacityOnFormSubmit}
                      />
                      <WindowingSlider
                        windowWidth={windowWidth}
                        windowCenter={windowCenter}
                        onWindowChange={handleWindowChange}
                      />
                    </>
                  )}

                  {!zoomMode && (
                    <>
                      <button
                        className="text-white relative pt-3 !bg-blue-900 hover:!border-white"
                        onClick={() => {
                          setShowOrganDetails((prev) => !prev);
                          setShowTaskDetails((prev) => !prev);
                        }}
                      >
                        Class Map
                      </button>

                      <div className="flex gap-3 items-center justify-center">
                        {/* Crosshair */}
                        <div className="group cursor-pointer rounded-md relative border">
                          <div
                            className={`border-gray-500 hover:bg-gray-700 border rounded-md p-2 ${
                              crosshairToolActive ? "bg-gray-700" : ""
                            }`}
                          >
                            <IconPointer
                              className="w-6 h-6 text-white relative cursor-pointer"
                              onClick={() =>
                                setCrosshairToolActive((prev) => !prev)
                              }
                            />
                          </div>
                          <span className="transition-all pointer-events-none duration-100 scale-0 group-hover:scale-100 absolute top-0 left-12 z-1 bg-gray-900 text-white rounded-md p-2">
                            Crosshair Mode
                          </span>
                        </div>

                        {/* Zoom */}
                        <div className="group cursor-pointer rounded-md relative">
                          {!zoomMode && (
                            <>
                              <div className="border-gray-500 hover:bg-gray-700 border rounded-md p-2">
                                <IconZoom
                                  onClick={() => setZoomMode(true)}
                                  className="w-6 h-6 text-white relative"
                                />
                              </div>
                              <span className="transition-all pointer-events-none duration-100 scale-0 group-hover:scale-100 absolute top-0 left-12 z-1 bg-gray-900 text-white rounded-md p-2">
                                Zoom
                              </span>
                            </>
                          )}
                        </div>

                        {/* Download */}
                        <div className="group cursor-pointer rounded-md relative">
                          <div className="border-gray-500 hover:bg-gray-700 border rounded-md p-2">
                            <IconDownload
                              onClick={handleDownloadClick}
                              className="w-6 h-6 text-white relative"
                            />
                          </div>
                          <span className="transition-all pointer-events-none duration-100 scale-0 group-hover:scale-100 absolute top-0 left-12 z-1 bg-gray-900 text-white rounded-md p-2">
                            Download
                          </span>
                        </div>

                        {/* Report */}
                        <div className="group cursor-pointer rounded-md relative">
  <div
    className="border-gray-500 hover:bg-gray-700 border rounded-md p-2"
    onClick={() => setShowReportScreen(true)}
  >
    <IconReport className="w-6 h-6 text-white relative" />
  </div>
  <span className="transition-all pointer-events-none duration-100 scale-0 group-hover:scale-100 absolute top-0 left-12 z-1 bg-gray-900 text-white rounded-md p-2">
    Report
  </span>
</div>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {loading ? <RotatingModelLoader /> : null}

        <div
          className="visualization-container"
          ref={VisualizationContainer_ref}
          style={{ overflow: "hidden" }}
        >
          <div
            className={`axial ${
              loading ? "" : "border-b-8 border-r-8 border-gray-800"
            }`}
            ref={axial_ref}
            onMouseDown={(e) =>
              setLastClicked({
                orientation: "axial",
                x: Math.floor(
                  e.clientX - e.currentTarget.getBoundingClientRect().left
                ),
                y: Math.floor(
                  e.clientY - e.currentTarget.getBoundingClientRect().top
                ),
              })
            }
          ></div>

          <div
            className={`sagittal ${
              loading ? "" : "border-b-8 border-l-8 border-gray-800"
            }`}
            ref={sagittal_ref}
            onMouseDown={(e) =>
              setLastClicked({
                orientation: "sagittal",
                x: Math.floor(
                  e.clientX - e.currentTarget.getBoundingClientRect().left
                ),
                y: Math.floor(
                  e.clientY - e.currentTarget.getBoundingClientRect().top
                ),
              })
            }
          ></div>

          <div
            className={`coronal ${
              loading ? "" : "border-t-8 border-r-8 border-gray-800"
            }`}
            ref={coronal_ref}
            onMouseDown={(e) =>
              setLastClicked({
                orientation: "coronal",
                x: Math.floor(
                  e.clientX - e.currentTarget.getBoundingClientRect().left
                ),
                y: Math.floor(
                  e.clientY - e.currentTarget.getBoundingClientRect().top
                ),
              })
            }
          ></div>

          <div
            className={`render ${
              loading ? "" : "border-t-8 border-l-8 border-gray-800"
            }`}
          >
            <div className="canvas">
              <canvas ref={render_ref}></canvas>
            </div>
          </div>
        </div>
      </div>

      {/* 底部 organ checkbox */}
      <OrganCheckbox
        setCheckState={setCheckState}
        checkState={checkState}
        sessionId={sessionKey}
        setShowTaskDetails={setShowTaskDetails}
        setShowOrganDetails={setShowOrganDetails}
        showOrganDetails={showOrganDetails}
        labelColorMap={labelColorMap}
      />

      {showReportScreen && (
        <ReportScreen id={pantsCase} onClose={() => setShowReportScreen(false)} />
      )}
    </div>
  );
}

export default VisualizationPage;
