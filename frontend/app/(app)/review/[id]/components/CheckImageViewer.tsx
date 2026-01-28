'use client';

import { useState } from 'react';
import Image from 'next/image';
import { ZoomIn, ZoomOut, RotateCw } from 'lucide-react';

interface Props {
  imageUrl: string;
}

export default function CheckImageViewer({ imageUrl }: Props) {
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 25, 200));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 25, 50));
  const handleRotate = () => setRotation(prev => (prev + 90) % 360);

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      {/* Controls */}
      <div className="px-4 py-3 border-b flex items-center justify-between bg-gray-50">
        <h3 className="font-semibold">Check Image</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={handleZoomOut}
            className="p-2 hover:bg-gray-200 rounded"
            title="Zoom Out"
          >
            <ZoomOut size={18} />
          </button>
          <span className="text-sm font-medium min-w-[60px] text-center">
            {zoom}%
          </span>
          <button
            onClick={handleZoomIn}
            className="p-2 hover:bg-gray-200 rounded"
            title="Zoom In"
          >
            <ZoomIn size={18} />
          </button>
          <div className="w-px h-6 bg-gray-300 mx-2" />
          <button
            onClick={handleRotate}
            className="p-2 hover:bg-gray-200 rounded"
            title="Rotate"
          >
            <RotateCw size={18} />
          </button>
        </div>
      </div>

      {/* Image */}
      <div className="p-4 bg-gray-100 overflow-auto" style={{ maxHeight: '600px' }}>
        <div className="flex items-center justify-center">
          <div
            style={{
              transform: `scale(${zoom / 100}) rotate(${rotation}deg)`,
              transition: 'transform 0.2s',
            }}
          >
            <img
              src={imageUrl}
              alt="Check"
              className="max-w-full h-auto shadow-lg"
            />
          </div>
        </div>
      </div>
    </div>
  );
}