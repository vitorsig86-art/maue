import type { GeographicBounds, ProjectConfig, ProjectLayerConfig } from "./types";
import { microbasinColors, templateProject } from "./template";

const R2 = "https://pub-9c8da9a67fcd49989fc558d4681bfc99.r2.dev";
const reliefBounds: GeographicBounds = [-45, -23.2413462, -43.5937499, -21.9430455];

const raster = (
  id: string, name: string, kind: ProjectLayerConfig["kind"],
  bounds: GeographicBounds, minimumLevel: number, maximumLevel: number,
): ProjectLayerConfig => ({
  id, name, description: "", kind, defaultVisible: id === "orto",
  ...(id === "decli2" ? {} : { legendMode: "embedded" as const }),
  ...(id === "orto" ? {} : { exclusiveGroup: "derivados" }),
  source: {
    format: "tms", url: `${R2}/${id}/{z}/{x}/{reverseY}.png`, credit: "",
    bounds, minimumLevel, maximumLevel, tileWidth: 256, tileHeight: 256,
  },
});


// Cópias 2D rastreáveis em public/geojson; metadados em docs/maue-geojson-provenance.json.
const vectorLayers: ProjectLayerConfig[] = [
  {
    id: "micro-bacias", name: "Microbacias", description: "Microbacias do levantamento fornecido", kind: "vector", defaultVisible: false, panelOrder: 3, opacityControl: true,
    source: { format: "geojson", url: "/geojson/micro_bacias.geojson", autoZoom: false,
      style: { stroke: "#FFFFFF", strokeWidth: 1.5, fillOpacity: 0.35, clampToGround: true, zIndex: 3,
        classification: { property: "cor", classes: Object.fromEntries(microbasinColors.map((color, index) => [String(index), { fill: color, stroke: color }])) },
        outline: { property: "cor", colors: microbasinColors, width: 1.5 } },
      popup: { titleProperty: "nome", fields: [
        { property: "area_ha", label: "Área", decimals: 2, suffix: " ha" },
        { property: "perimetro_km", label: "Perímetro", decimals: 2, suffix: " km" },
        { property: "STREAM_ID", label: "Trecho de referência", format: "integer" } ] } },
  },
  {
    id: "curvas-3m", name: "Curvas de nível (3 m)", description: "Cotas da fonte; datum vertical não informado", kind: "contours", defaultVisible: false, panelOrder: 4,
    source: { format: "geojson", url: "/geojson/curvas_3m.geojson", autoZoom: false,
      style: { stroke: "#000000", strokeWidth: 1, clampToGround: true, zIndex: 5 },
      popup: { title: "Curva de nível", fields: [{ property: "cota_m", label: "Cota da fonte", decimals: 0, suffix: " m" }] } },
  },
  {
    id: "rede-drenagem", name: "Rede de drenagem", description: "Ordem de Strahler preservada da fonte", kind: "drainage", defaultVisible: false, panelOrder: 5,
    source: { format: "geojson", url: "/geojson/rede_drenagem.geojson", autoZoom: false,
      style: { stroke: "#00E5FF", strokeWidth: 1, clampToGround: true, zIndex: 10,
        classification: { property: "STRAHLER", classes: {
          1: { stroke: "#00E5FF", strokeWidth: 1, zIndex: 10 },
          2: { stroke: "#14B8F0", strokeWidth: 1.6, zIndex: 11 },
          3: { stroke: "#1E88E5", strokeWidth: 2.4, zIndex: 12 },
          4: { stroke: "#1546D8", strokeWidth: 3.4, zIndex: 13 },
          5: { stroke: "#0B2A9E", strokeWidth: 4.4, zIndex: 14 } } } },
      popup: { title: "Drenagem", fields: [
        { property: "STREAM_ID", label: "Trecho", format: "integer" },
        { property: "STRAHLER", label: "Ordem de Strahler", format: "integer" },
        { property: "area_contribuicao_ha", label: "Área de contribuição", decimals: 2, suffix: " ha" },
        { property: "comprimento_m", label: "Comprimento", decimals: 1, suffix: " m" } ] } },
  },
  {
    id: "ramas", name: "Ramas", description: "Áreas e estatísticas do levantamento fornecido", kind: "vector", defaultVisible: false, panelOrder: 2, opacityControl: true,
    source: { format: "geojson", url: "/geojson/ramas.geojson", autoZoom: false,
      style: { stroke: "#FF6A00", strokeWidth: 2, fill: "#FF6A00", fillOpacity: 0.18, clampToGround: true, zIndex: 15 },
      popup: { titleProperty: "nome", fields: [
        { property: "ENCLOSED_AREA", label: "Área", decimals: 3, suffix: " ha" },
        { property: "PERIMETER", label: "Perímetro", decimals: 1, suffix: " m" },
        { property: "AVG_ELEV_M", label: "Altitude média da fonte", decimals: 1, suffix: " m" },
        { property: "AVG_SLOPE_DEG", label: "Declividade média", decimals: 2, suffix: "°" },
        { property: "AVG_SLOPE_PCT", label: "Declividade média", decimals: 2, suffix: " %" },
        { property: "AVG_ASPECT", label: "Orientação média" } ] } },
  },
  {
    id: "perimetro-sigef", name: "Perímetro SIGEF", description: "Perímetro conforme arquivo fornecido; não substitui documento cadastral", kind: "property-boundary", defaultVisible: false, panelOrder: 1,
    source: { format: "geojson", url: "/geojson/peri_sigef.geojson", autoZoom: false,
      style: { stroke: "#FFD400", strokeWidth: 2.5, fillOpacity: 0, clampToGround: true, zIndex: 20 },
      popup: { titleProperty: "nome", fields: [
        { property: "registro_m", label: "Matrículas" },
        { property: "status", label: "Situação informada" },
        { property: "ENCLOSED_AREA", label: "Área informada", decimals: 2, suffix: " ha" },
        { property: "PERIMETER", label: "Perímetro informado", decimals: 3, suffix: " km" } ] } },
  },
];

export const project: ProjectConfig = {
  ...templateProject,
  id: "maue", name: "Maue", location: "Baependi-MG",
  // Enquadramento inicial estimado pelos tiles locais da ortofoto no nível 14.
  initialCamera: { longitude: -44.80225, latitude: -22.03473, height: 10000, heading: 0, pitch: -90, roll: 0 },
  layers: [
    ...templateProject.layers,
    raster("orto", "Ortofoto", "orthomosaic", [-44.8242188, -22.1059988, -44.6484374, -21.9430455], 11, 20),
    raster("aspect", "Orientação das vertentes", "aspect", reliefBounds, 8, 17),
    raster("decli", "Declividade (graus)", "slope", reliefBounds, 8, 17),
    // Legenda externa a configurar posteriormente; referência IBGE informada pelo responsável, ainda não documentada.
    raster("decli2", "Declividade (%)", "slope", [-45, -22.5937261, -44.2968749, -21.9430455], 9, 18),
    raster("mds", "Modelo Digital de Superfície", "dsm", [-45, -22.2687641, -44.6484374, -21.9430455], 10, 19),
    raster("mdt", "Modelo Digital do Terreno", "dtm", reliefBounds, 8, 17),
    ...vectorLayers,
  ],
  scenes: [],
  diagnostic: { steps: [] },
  developmentTools: { modelAlignment: false, cropAuthoring: false, cameraCapture: false },
};
