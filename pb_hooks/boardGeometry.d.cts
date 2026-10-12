type Point = { x: number; y: number };
type TrackHole = Point & { id: number; seat: number; position: number; marker: 'red' | 'green' | null };
type LaneHole = Point & { id: string; seat: number; position: number };
type BoardSide = {
  seat: number;
  from: Point;
  to: Point;
  along: Point;
  inward: Point;
  length: number;
  holes: Point[];
  track: TrackHole[];
  red: Point;
  green: Point;
  home: LaneHole[];
  base: LaneHole[];
};
type BoardGeometry = {
  sideCount: number;
  trackCount: number;
  radius: number;
  center: Point;
  corners: Point[];
  sides: BoardSide[];
};
declare const geometryModule: {
  boardSides(mode: string, capacity: number): number;
  trackLength(sideCount: number): number;
  startIndex(seat: number): number;
  trackIndex(seat: number, progress: number, sideCount: number): number;
  homeEntryProgress(seat: number, sideCount: number): number;
  oppositeSeat(seat: number, sideCount: number): number;
  geometry(sideCount: number): BoardGeometry;
  BASE_PER_SIDE: 5;
  HOME_PER_SIDE: 5;
  TRACK_PER_SIDE: 18;
};
export = geometryModule;