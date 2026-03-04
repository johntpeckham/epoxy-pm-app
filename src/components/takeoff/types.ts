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
  pageKey: string
}

export interface TakeoffItem {
  id: string
  name: string
  type: MeasurementType
  measurements: Measurement[]
  color: string
}

export interface Markup {
  id: string
  type: 'rect' | 'text' | 'arrow'
  points: Point[]
  text?: string
  color: string
  pageKey: string
}

export interface PageScale {
  pageIndex: number
  pixelsPerFoot: number
  calibrated: boolean
}

export interface TakeoffPage {
  pdfIndex: number
  pageIndex: number
  pdfName: string
  thumbnailDataUrl: string | null
  arrayBuffer: ArrayBuffer
}

export interface TakeoffProject {
  id: string
  name: string
  createdAt: string
  pages: TakeoffPage[]
  items: TakeoffItem[]
  pageScales: Record<string, number>
  markups: Markup[]
}
