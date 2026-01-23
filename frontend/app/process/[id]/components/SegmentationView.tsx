'use client';

import { useState } from 'react';
import { ZoomIn, ZoomOut } from 'lucide-react';

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
}

interface Props {
  imageUrl: string;
  boundingBoxes: BoundingBox[];
}

export default function SegmentationView({ imageUrl, boundingBoxes }: Props) {
  const [zoom, setZoom] = useState(1);

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Check Segmentation</h3>
          <p className="text-sm text-gray-600 mt-1">
            Detected {boundingBoxes.length} check{boundingBoxes.length !== 1 ? 's' : ''} on page
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}
            className="p-2 hover:bg-gray-100 rounded"
            disabled={zoom <= 0.5}
          >
            <ZoomOut size={18} />
          </button>
          <span className="text-sm font-medium text-gray-700 min-w-[3rem] text-center">
            {(zoom * 100).toFixed(0)}%
          </span>
          <button
            onClick={() => setZoom(Math.min(2, zoom + 0.25))}
            className="p-2 hover:bg-gray-100 rounded"
            disabled={zoom >= 2}
          >
            <ZoomIn size={18} />
          </button>
        </div>
      </div>

      <div className="relative overflow-auto border rounded-lg bg-gray-50">
        <div
          className="relative inline-block min-w-full"
          style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}
        >
          <img src={imageUrl} alt="Check segmentation" className="block" />
          
          {boundingBoxes.map((box, index) => (
            <div
              key={index}
              className="absolute border-2 border-green-500 bg-green-500/10"
              style={{
                left: `${box.x}px`,
                top: `${box.y}px`,
                width: `${box.width}px`,
                height: `${box.height}px`,
              }}
            >
              <div className="absolute -top-6 left-0 px-2 py-1 bg-green-500 text-white text-xs rounded">
                Check #{index + 1} ({(box.confidence * 100).toFixed(0)}%)
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        {boundingBoxes.map((box, index) => (
          <div key={index} className="p-3 bg-gray-50 rounded-lg border">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium text-gray-900">Check #{index + 1}</span>
              <span className="text-xs text-gray-600">
                Confidence: {(box.confidence * 100).toFixed(1)}%
              </span>
            </div>
            <div className="text-xs text-gray-600 space-y-1">
              <div className="flex justify-between">
                <span>Position:</span>
                <span className="font-mono">({box.x}, {box.y})</span>
              </div>
              <div className="flex justify-between">
                <span>Size:</span>
                <span className="font-mono">{box.width} × {box.height}</span>
              </div>
              <div className="flex justify-between">
                <span>Aspect Ratio:</span>
                <span className="font-mono">{(box.width / box.height).toFixed(2)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
