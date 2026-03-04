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
  CheckIcon,
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
  { mode: 'pan', label: 'Pan', icon: <MousePointer2Icon className="w-3.5 h-3.5" />, group: 'nav' },
  { mode: 'linear', label: 'Linear', icon: <Minus className="w-3.5 h-3.5" />, group: 'measure' },
  { mode: 'area-rect', label: 'Area Rect', icon: <SquareIcon className="w-3.5 h-3.5" />, group: 'measure' },
  { mode: 'area-polygon', label: 'Area Poly', icon: <PentagonIcon className="w-3.5 h-3.5" />, group: 'measure' },
  { mode: 'markup-rect', label: 'Markup Rect', icon: <SquareDashedIcon className="w-3.5 h-3.5" />, group: 'markup' },
  { mode: 'markup-text', label: 'Text', icon: <TypeIcon className="w-3.5 h-3.5" />, group: 'markup' },
  { mode: 'markup-arrow', label: 'Arrow', icon: <ArrowRightIcon className="w-3.5 h-3.5" />, group: 'markup' },
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
  const scaleSet = pageScale?.calibrated === true

  return (
    <div className="flex items-center gap-0.5 px-2 py-1.5 bg-gray-900 border-b border-gray-800 flex-nowrap overflow-hidden">
      {/* Set Scale — prominent button */}
      {scaleSet ? (
        <button
          onClick={() => onToolChange('set-scale')}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium transition-colors flex-shrink-0 ${
            activeTool === 'set-scale'
              ? 'bg-green-500 text-white'
              : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
          }`}
        >
          <CheckIcon className="w-3 h-3" />
          <span>Scale: 1in = {(pageScale!.pixelsPerFoot / 12).toFixed(1)}ft</span>
        </button>
      ) : (
        <button
          onClick={() => onToolChange('set-scale')}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-semibold transition-colors flex-shrink-0 ${
            activeTool === 'set-scale'
              ? 'bg-amber-500 text-white ring-2 ring-amber-300'
              : 'bg-amber-500 text-white hover:bg-amber-400'
          }`}
        >
          <RulerIcon className="w-3 h-3" />
          <span>Set Scale</span>
        </button>
      )}

      <div className="w-px h-5 bg-gray-700 mx-1.5" />

      {/* Tool buttons */}
      <div className="flex items-center gap-px">
        {tools.map((tool, i) => {
          const prevGroup = i > 0 ? tools[i - 1].group : tool.group
          return (
            <span key={tool.mode} className="flex items-center">
              {i > 0 && prevGroup !== tool.group && (
                <div className="w-px h-5 bg-gray-700 mx-1" />
              )}
              <button
                onClick={() => onToolChange(tool.mode)}
                title={tool.label}
                className={`p-1.5 rounded transition-colors ${
                  activeTool === tool.mode
                    ? 'bg-amber-500 text-white'
                    : 'text-gray-500 hover:text-white hover:bg-gray-800'
                }`}
              >
                {tool.icon}
              </button>
            </span>
          )
        })}
      </div>

      <div className="w-px h-5 bg-gray-700 mx-1.5" />

      {/* Page nav */}
      {!hidePagination && (
        <>
          <div className="flex items-center gap-0.5">
            <button
              onClick={onPrevPage}
              disabled={currentPage <= 0}
              className="p-1 rounded text-gray-500 hover:text-white hover:bg-gray-800 disabled:opacity-30"
            >
              <ChevronLeftIcon className="w-3.5 h-3.5" />
            </button>
            <span className="text-gray-400 text-[10px] font-medium min-w-[60px] text-center">
              {currentPage + 1} / {totalPages}
            </span>
            <button
              onClick={onNextPage}
              disabled={currentPage >= totalPages - 1}
              className="p-1 rounded text-gray-500 hover:text-white hover:bg-gray-800 disabled:opacity-30"
            >
              <ChevronRightIcon className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="w-px h-5 bg-gray-700 mx-1.5" />
        </>
      )}

      {/* Zoom */}
      <div className="flex items-center gap-0.5">
        <button onClick={onZoomOut} className="p-1 rounded text-gray-500 hover:text-white hover:bg-gray-800">
          <ZoomOutIcon className="w-3.5 h-3.5" />
        </button>
        <span className="text-gray-400 text-[10px] font-medium min-w-[32px] text-center">
          {Math.round(zoom * 100)}%
        </span>
        <button onClick={onZoomIn} className="p-1 rounded text-gray-500 hover:text-white hover:bg-gray-800">
          <ZoomInIcon className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Fullscreen — far right */}
      <div className="ml-auto flex-shrink-0">
        <button
          onClick={onToggleFullscreen}
          title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          className="p-1.5 rounded text-gray-500 hover:text-white hover:bg-gray-800 transition-colors"
        >
          {isFullscreen ? <Minimize2Icon className="w-3.5 h-3.5" /> : <Maximize2Icon className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  )
}
