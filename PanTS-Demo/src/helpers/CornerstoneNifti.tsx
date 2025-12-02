import {
  Enums,
  RenderingEngine,
  cache,
  init as csInit,
  getRenderingEngine,
  setVolumesForViewports,
  volumeLoader,
} from "@cornerstonejs/core";
import {
  CrosshairsTool,
  PanTool,
  SegmentationDisplayTool,
  StackScrollMouseWheelTool,
  ToolGroupManager,
  ZoomTool,
  addTool,
  state as csToolState,
  init as csTools3dInit,
  Enums as csToolsEnums,
  segmentation,
} from "@cornerstonejs/tools";

import type { ColorLUT } from "@cornerstonejs/core/dist/types/types";
import { cornerstoneNiftiImageVolumeLoader } from "@cornerstonejs/nifti-volume-loader";

import type { VisualizationRenderReturnType } from "../types";
import { APP_CONSTANTS } from "./constants";
import { getPanTSId } from "./utils";

type viewportIdTypes = "CT_NIFTI_AXIAL" | "CT_NIFTI_SAGITTAL" | "CT_NIFTI_CORONAL";

const toolGroupId = "myToolGroup";
const renderingEngineId = "myRenderingEngine";
const segmentationId = "combined_labels";

const DEFAULT_SEGMENTATION_CONFIG = {
  fillAlpha: APP_CONSTANTS.DEFAULT_SEGMENTATION_OPACITY,
  fillAlphaInactive: APP_CONSTANTS.DEFAULT_SEGMENTATION_OPACITY,
  outlineOpacity: 1,
  outlineWidth: 1,
  renderOutline: false,
  outlineOpacityInactive: 0,
};

const toolGroupSpecificRepresentationConfig = {
  renderInactiveSegmentations: true,
  representations: {
    [csToolsEnums.SegmentationRepresentations.Labelmap]: DEFAULT_SEGMENTATION_CONFIG,
  },
};

const viewportId1: viewportIdTypes = "CT_NIFTI_AXIAL";
const viewportId2: viewportIdTypes = "CT_NIFTI_SAGITTAL";
const viewportId3: viewportIdTypes = "CT_NIFTI_CORONAL";

// 只做一次的初始化 flag
let cornerstoneInitialized = false;
let toolsInitialized = false;
let niftiRegistered = false;

export async function renderVisualization(
  ref1: HTMLDivElement | null,
  ref2: HTMLDivElement | null,
  ref3: HTMLDivElement | null,
  convertedColorLUT: ColorLUT,
  clabelId: string,
  _setLoading: React.Dispatch<React.SetStateAction<boolean>>
): Promise<VisualizationRenderReturnType | undefined> {
  // 如果沒拿到 DOM，就直接結束
  if (!ref1 || !ref2 || !ref3) {
    return;
  }

  // 右鍵關掉原生 menu
  ref1.oncontextmenu = (e) => e.preventDefault();
  ref2.oncontextmenu = (e) => e.preventDefault();
  ref3.oncontextmenu = (e) => e.preventDefault();

  // ---- Cornerstone / tools / nifti loader 只初始化一次 ----
  if (!cornerstoneInitialized) {
    await csInit();
    cornerstoneInitialized = true;
  }

  if (!toolsInitialized) {
    csTools3dInit();
    toolsInitialized = true;
  }

  if (!niftiRegistered) {
    volumeLoader.registerVolumeLoader("nifti", cornerstoneNiftiImageVolumeLoader);
    niftiRegistered = true;
  }

  // 視需要清一下 cache（原本就有）
  cache.purgeCache();

  // ---- ToolGroup / RenderingEngine ----
  const toolGroup = createToolGroup();
  if (!toolGroup) return;

  const renderingEngine = createRenderingEngine();

  // ---- 主要 CT volume (HuggingFace) ----
  const pants_id = getPanTSId(clabelId);
  const mainNiftiURL = `https://huggingface.co/datasets/BodyMaps/iPanTSMini/resolve/main/image_only/${pants_id}/ct.nii.gz?download=true`;
  const volumeId = "nifti:" + mainNiftiURL;

  const volume = await volumeLoader.createAndCacheVolume(volumeId);
  await volume.load();

  // ---- segmentation labelmap (HuggingFace) ----
  // 新的：改回走自己的 Flask server
const segmentationURL = `${APP_CONSTANTS.API_ORIGIN}/api/get-segmentations/${clabelId}`;
const combined_labels_Id = 'nifti:' + segmentationURL;



  console.log("✅ convertedColorLUT = ", convertedColorLUT);

  // ---------------- Viewports 設定 ----------------
  const viewportInputArray = [
    {
      viewportId: viewportId1,
      type: Enums.ViewportType.ORTHOGRAPHIC,
      element: ref1,
      defaultOptions: {
        orientation: Enums.OrientationAxis.AXIAL,
      },
    },
    {
      viewportId: viewportId2,
      type: Enums.ViewportType.ORTHOGRAPHIC,
      element: ref2,
      defaultOptions: {
        orientation: Enums.OrientationAxis.SAGITTAL,
      },
    },
    {
      viewportId: viewportId3,
      type: Enums.ViewportType.ORTHOGRAPHIC,
      element: ref3,
      defaultOptions: {
        orientation: Enums.OrientationAxis.CORONAL,
      },
    },
  ];

  // 這裡用的是「活著的」 renderingEngine（不再 destroy）
  renderingEngine.setViewports(viewportInputArray);

  toolGroup.addViewport(viewportId1, renderingEngineId);
  toolGroup.addViewport(viewportId2, renderingEngineId);
  toolGroup.addViewport(viewportId3, renderingEngineId);

  await setVolumesForViewports(renderingEngine, [{ volumeId }], [
    viewportId1,
    viewportId2,
    viewportId3,
  ]);

  // 初始 window/level
  const initialWindowWidth = 50;
  const initialWindowCenter = 500;

  viewportInputArray.forEach(({ viewportId }) => {
    const viewport = renderingEngine.getViewport(viewportId);

    try {
      // @ts-expect-error setProperties 在型別上沒有，但實際存在
      viewport.setProperties({
        voiRange: {
          windowWidth: initialWindowWidth,
          windowCenter: initialWindowCenter,
        },
      });
    } catch (e) {
      console.warn("[VOI Error]", e);
    }
  });

  renderingEngine.render();

  // ---------------- Segmentation：有就用，沒有就跳過 ----------------
  let combined_labels: any = null;
  let segmentationVolumeArray: any = null;
  let segRepUIDs: string[] = [];

  try {
    combined_labels = await volumeLoader.createAndCacheVolume(combined_labels_Id);
    await combined_labels.load?.();
    segmentationVolumeArray = combined_labels.getScalarData();
  } catch (err) {
    console.warn("⚠️ Segmentation load failed, skipping labelmap:", err);
  }

  if (combined_labels) {
    try {
      // 先清掉舊的 segmentation（如果有）
      try {
        segmentation.state.removeSegmentation(segmentationId);
      } catch {
        // 第一次沒有也沒關係
      }

      segmentation.addSegmentations([
        {
          segmentationId,
          representation: {
            type: csToolsEnums.SegmentationRepresentations.Labelmap,
            data: {
              volumeId: combined_labels_Id,
            },
          },
        },
      ]);

      segRepUIDs = await segmentation.addSegmentationRepresentations(
        toolGroupId,
        [
          {
            segmentationId,
            type: csToolsEnums.SegmentationRepresentations.Labelmap,
            options: {
              colorLUTOrIndex: convertedColorLUT,
            },
          },
        ],
        toolGroupSpecificRepresentationConfig
      );
    } catch (err) {
      console.warn("⚠️ Failed to add segmentation representations:", err);
    }
  }

  // 無論 segmentation 成功與否，都回傳基本資訊
  return {
    segRepUIDs,
    renderingEngine,
    viewportIds: [viewportId1, viewportId2, viewportId3],
    volumeId,
    segmentationVolumeArray,
  };
}

/* --------------------------- tools & helpers --------------------------- */

function addToolsToCornerstone() {
  const addedTools = csToolState.tools;

  if (!addedTools.StackScrollMouseWheel) addTool(StackScrollMouseWheelTool);
  if (!addedTools.SegmentationDisplay) addTool(SegmentationDisplayTool);
  if (!addedTools.Zoom) addTool(ZoomTool);
  if (!addedTools.Crosshairs) addTool(CrosshairsTool);
  if (!addedTools.Pan) addTool(PanTool);
}

const viewportColors: Record<viewportIdTypes, string> = {
  [viewportId1]: "rgb(200, 0, 0)",
  [viewportId2]: "rgb(200, 200, 0)",
  [viewportId3]: "rgb(0, 200, 0)",
};

const viewportReferenceLineControllable = [viewportId1, viewportId2, viewportId3];
const viewportReferenceLineDraggableRotatable = [viewportId1, viewportId2, viewportId3];
const viewportReferenceLineSlabThicknessControlsOn = [
  viewportId1,
  viewportId2,
  viewportId3,
];

function getReferenceLineColor(viewportId: viewportIdTypes) {
  return viewportColors[viewportId];
}

function getReferenceLineControllable(viewportId: viewportIdTypes) {
  return viewportReferenceLineControllable.includes(viewportId);
}

function getReferenceLineDraggableRotatable(viewportId: viewportIdTypes) {
  return viewportReferenceLineDraggableRotatable.includes(viewportId);
}

function getReferenceLineSlabThicknessControlsOn(viewportId: viewportIdTypes) {
  return viewportReferenceLineSlabThicknessControlsOn.includes(viewportId);
}

function createToolGroup() {
  addToolsToCornerstone();

  // 先清掉舊的，再建立新的
  ToolGroupManager.destroyToolGroup(toolGroupId);
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);
  if (!toolGroup) return;

  toolGroup.addTool(StackScrollMouseWheelTool.toolName);
  toolGroup.addTool(SegmentationDisplayTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);
  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(CrosshairsTool.toolName, {
    getReferenceLineColor,
    getReferenceLineControllable,
    getReferenceLineDraggableRotatable,
    getReferenceLineSlabThicknessControlsOn,
    mobile: {
      enabled: false,
      opacity: 0.8,
      handleRadius: 9,
    },
  });

  toolGroup.setToolActive(StackScrollMouseWheelTool.toolName);
  toolGroup.setToolEnabled(SegmentationDisplayTool.toolName);

  toolGroup.setToolActive(PanTool.toolName, {
    bindings: [{ mouseButton: csToolsEnums.MouseBindings.Primary }],
  });

  toolGroup.setToolActive(ZoomTool.toolName, {
    bindings: [{ mouseButton: csToolsEnums.MouseBindings.Secondary }],
  });

  return toolGroup;
}

export function toggleCrosshairTool(value: boolean) {
  const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);
  if (!toolGroup) return;

  if (value) {
    toolGroup.setToolActive(CrosshairsTool.toolName, {
      bindings: [{ mouseButton: csToolsEnums.MouseBindings.Primary }],
    });
    toolGroup.setToolDisabled(PanTool.toolName);
  } else {
    toolGroup.setToolDisabled(CrosshairsTool.toolName);
    toolGroup.setToolActive(PanTool.toolName, {
      bindings: [{ mouseButton: csToolsEnums.MouseBindings.Primary }],
    });
  }
}

function createRenderingEngine(): RenderingEngine {
  console.log("[createRenderingEngine] called");

  const existing = getRenderingEngine(renderingEngineId) as
    | RenderingEngine
    | undefined;

  if (existing) {
    console.log("Reusing existing renderingEngine");
    return existing;
  }

  const engine = new RenderingEngine(renderingEngineId);
  console.log("Created new renderingEngine");
  return engine;
}

export function setVisibilities(segRepUIDs: string[], checkState: boolean[]) {
  const uid = segRepUIDs[0];
  if (!uid) return;

  for (let i = 1; i < checkState.length; i++) {
    segmentation.config.visibility.setSegmentVisibility(
      toolGroupId,
      uid,
      i,
      checkState[i],
    );
  }
}

export function getSlicePercent(viewportId: viewportIdTypes) {
  const engine = getRenderingEngine(renderingEngineId);
  if (!engine) return 0;

  const viewport: any = engine.getViewport(viewportId);

  const idx =
    typeof viewport.getSliceIndex === "function"
      ? viewport.getSliceIndex()
      : 0;

  const maxIdx =
    typeof viewport.getNumberOfSlices === "function"
      ? viewport.getNumberOfSlices()
      : idx || 1;

  return idx / maxIdx;
}

export function setZoom(zoomValue: number) {
  const engine = getRenderingEngine(renderingEngineId);
  if (!engine) return;

  [viewportId1, viewportId2, viewportId3].forEach((viewportId) => {
    const viewport = engine.getViewport(viewportId);
    viewport.setZoom(zoomValue);
    viewport.render();
  });
}

// 0 left / 1 right / 2 up / 3 down
export function setPan(panValue: number) {
  const engine = getRenderingEngine(renderingEngineId);
  if (!engine) return;

  const MULT = 20;

  [viewportId1, viewportId2, viewportId3].forEach((viewportId) => {
    const viewport = engine.getViewport(viewportId);
    const cur = viewport.getPan();

    if (panValue === 0) viewport.setPan([cur[0] + MULT, cur[1]]);
    if (panValue === 1) viewport.setPan([cur[0] - MULT, cur[1]]);
    if (panValue === 2) viewport.setPan([cur[0], cur[1] - MULT]);
    if (panValue === 3) viewport.setPan([cur[0], cur[1] + MULT]);

    viewport.render();
  });
}

export function zoomToFit() {
  const engine = getRenderingEngine(renderingEngineId);
  if (!engine) return;

  [viewportId1, viewportId2, viewportId3].forEach((viewportId) => {
    const viewport = engine.getViewport(viewportId);
    viewport.resetCamera(true, true);
    viewport.render();
  });
}

/**
 * 讓三個 viewport 的相機 focal point 跟著 Crosshair 的中心
 */
export function centerOnCursor() {
  const engine = getRenderingEngine(renderingEngineId);
  const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);
  if (!engine || !toolGroup) return;

  const crosshairTool = toolGroup.getToolInstance(
    CrosshairsTool.toolName,
  ) as any;

  const toolCenter = crosshairTool?.toolCenter;
  if (!toolCenter) {
    console.warn("[centerOnCursor] toolCenter is missing");
    return;
  }

  [viewportId1, viewportId2, viewportId3].forEach((viewportId) => {
    const viewport: any = engine.getViewport(viewportId);
    if (!viewport || typeof viewport.setViewReference !== "function") return;

    viewport.setViewReference({
      FrameOfReferenceUID: "1.2.3", // 隨便給一個固定 UID 即可
      cameraFocalPoint: toolCenter,
    });

    viewport.render();
  });
}

export function setToolGroupOpacity(opacityValue: number) {
  const newSegConfig = { ...DEFAULT_SEGMENTATION_CONFIG };
  newSegConfig.fillAlpha = opacityValue;
  newSegConfig.fillAlphaInactive = opacityValue;
  newSegConfig.outlineOpacity = opacityValue;
  newSegConfig.outlineOpacityInactive = opacityValue;

  const newToolGroupConfig = {
    renderInactiveSegmentations: true,
    representations: {
      [csToolsEnums.SegmentationRepresentations.Labelmap]: newSegConfig,
    },
  };

  segmentation.config.setToolGroupSpecificConfig(
    toolGroupId,
    newToolGroupConfig,
  );
}
