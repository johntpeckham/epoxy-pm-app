'use client'

import {
  MousePointer2Icon,
  RulerIcon,
  Minus,
  SquareIcon,
  PentagonIcon,
  SquareDashedIcon,
  TypeIcon,
  ArrowRightIcon,
  ZoomInIcon,
  ZoomOutIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Maximize2Icon,
  Minimize2Icon,
} from 'lucide-react'
import type { ToolMode, PageScale } from './types'

interface TakeoffToolbarProps {
  activeTool: ToolMode
  onToolChange: (tool: ToolMode) => void
  currentPage: number
  totalPages: number
  onPrevPage: () => void
  onNextPage: () => void
  zoom: number
  onZoomIn: () => void
  onZoomOut: () => void
  pageScale: PageScale | undefined
  isFullscreen: boolean
  onToggleFullscreen: () => void
  hidePagination?: boolean
}

const tools: { mode: ToolMode; label: string; icon: React.ReactNode; group: string }[] = [
  { mode: 'pan', label: 'Pan / Select', icon: <MousePointer2Icon className="w-4 h-4" />, group: 'nav' },
  { mode: 'set-scale', label: 'Set Scale', icon: <RulerIcon className="w-4 h-4" />, group: 'scale' },
  { mode: 'linear', label: 'Linear Measure', icon: <Minus className="w-4 h-4" />, group: 'measure' },
  { mode: 'area-rect', label: 'Area (Rectangle)', icon: <SquareIcon className="w-4 h-4" />, group: 'measure' },
  { mode: 'area-polygon', label: 'Area (Polygon)', icon: <PentagonIcon className="w-4 h-4" />, group: 'measure' },
  { mode: 'markup-rect', label: 'Markup: Rect', icon: <SquareDashedIcon className="w-4 h-4" />, group: 'markup' },
  { mode: 'markup-text', label: 'Markup: Text', icon: <TypeIcon className="w-4 h-4" />, group: 'markup' },
  { mode: 'markup-arrow', label: 'Markup: Arrow', icon: <ArrowRightIcon className="w-4 h-4" />, group: 'markup' },
]

export default function TakeoffToolbar({
  activeTool,
  onToolChange,
  currentPage,
  totalPages,
  onPrevPage,
  onNextPage,
  zoom,
  onZoomIn,
  onZoomOut,
  pageScale,
  isFullscreen,
  onToggleFullscreen,
  hidePagination,
}: TakeoffToolbarProps) {
  return (
    <div className="flex items-center gap-1 px-3 py-2 bg-gray-900 border-b border-gray-700 flex-wrap">
      {/* Tool buttons */}
      <div className="flex items-center gap-0.5">
        {tools.map((tool, i) => {
          const prevGroup = i > 0 ? tools[i - 1].group : tool.group
          return (
            <span key={tool.mode} className="flex items-center">
              {i > 0 && prevGroup !== tool.group && (
                <div className="w-px h-6 bg-gray-700 mx-1" />
              )}
              <button
                onClick={() => onToolChange(tool.mode)}
                title={tool.label}
                className={`p-2 rounded transition-colors ${
                  activeTool === tool.mode
                    ? 'bg-amber-500 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                {tool.icon}
              </button>
            </span>
          )
        })}
      </div>

      <div className="w-px h-6 bg-gray-700 mx-2" />

      {/* Page nav */}
      {!hidePagination && (
        <>
          <div className="flex items-center gap-1">
            <button
              onClick={onPrevPage}
              disabled={currentPage <= 0}
              className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeftIcon className="w-4 h-4" />
            </button>
            <span className="text-gray-300 text-xs font-medium min-w-[80px] text-center">
              Page {currentPage + 1} of {totalPages}
            </span>
            <button
              onClick={onNextPage}
              disabled={currentPage >= totalPages - 1}
              className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRightIcon className="w-4 h-4" />
            </button>
          </div>

          <div className="w-px h-6 bg-gray-700 mx-2" />
        </>
      )}

      {/* Zoom */}
      <div className="flex items-center gap-1">
        <button
          onClick={onZoomOut}
          className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-gray-800"
        >
          <ZoomOutIcon className="w-4 h-4" />
        </button>
        <span className="text-gray-300 text-xs font-medium min-w-[40px] text-center">
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={onZoomIn}
          className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-gray-800"
        >
          <ZoomInIcon className="w-4 h-4" />
        </button>
      </div>

      <div className="w-px h-6 bg-gray-700 mx-2" />

      {/* Scale indicator */}
      <div className="text-xs text-gray-400">
        {pageScale?.calibrated
          ? `Scale: 1' = ${pageScale.pixelsPerFoot.toFixed(1)}px`
          : 'Scale: Not set'}
      </div>

      {/* Fullscreen toggle — pushed to far right */}
      <div className="ml-auto">
        <button
          onClick={onToggleFullscreen}
          title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          className="p-2 rounded text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
        >
          {isFullscreen ? (
            <Minimize2Icon className="w-4 h-4" />
          ) : (
            <Maximize2Icon className="w-4 h-4" />
          )}
        </button>
      </div>
    </div>
  )
}
