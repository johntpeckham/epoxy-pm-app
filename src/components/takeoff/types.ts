export type MeasurementType = 'linear' | 'area'

export type ToolMode =
  | 'pan'
  | 'set-scale'
  | 'linear'
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
  perimeterFt: number
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
  displayName?: string
  thumbnailDataUrl: string | null
  arrayBuffer: ArrayBuffer | null
  pdfBase64: string | null
  pdfId?: string
}

export interface TakeoffProject {
  id: string
  name: string
  createdAt: string
  pages: TakeoffPage[]
  items: TakeoffItem[]
  pageScales: Record<string, number>
  markups: Markup[]
  pageRenderedSizes?: Record<string, { w: number; h: number }>
}

// ─── Serializable types for localStorage ───

export interface SerializedTakeoffPage {
  pdfIndex: number
  pageIndex: number
  pdfName: string
  displayName?: string
  thumbnailDataUrl: string | null
  pdfBase64: string | null
}

export interface SerializedTakeoffProject {
  id: string
  name: string
  createdAt: string
  pages: SerializedTakeoffPage[]
  items: TakeoffItem[]
  pageScales: Record<string, number>
  markups: Markup[]
  pageRenderedSizes?: Record<string, { w: number; h: number }>
}
