export type MeasurementType = 'linear' | 'area'

export type ToolMode =
  | 'pan'
  | 'set-scale'
  | 'linear'
  | 'area-rect'
  | 'area-polygon'
  | 'markup-rect'
  | 'markup-text'
  | 'markup-arrow'

export interface Point {
  x: number
  y: number
}

export interface Measurement {
  id: string
  type: MeasurementType
  points: Point[]
  valueInFeet: number
  label: string
  pageIndex: number
}

export interface TakeoffItem {
  id: string
  name: string
  type: MeasurementType
  measurements: Measurement[]
  color: string
}

export interface PageScale {
  pageIndex: number
  pixelsPerFoot: number
  calibrated: boolean
}

export interface Markup {
  id: string
  type: 'rect' | 'text' | 'arrow'
  points: Point[]
  text?: string
  color: string
  pageIndex: number
}

export interface TakeoffProject {
  id: string
  name: string
  createdAt: string
  pdfData: ArrayBuffer | null
  pageCount: number
  pageScales: PageScale[]
  items: TakeoffItem[]
  markups: Markup[]
}
