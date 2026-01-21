'use client'

import { useState } from 'react'
import { ZoomIn, ZoomOut, RotateCw } from 'lucide-react'

interface ImageViewerProps {
    src: string
    alt: string
}

export default function ImageViewer({ src, alt }: ImageViewerProps) {
    const [scale, setScale] = useState(1)
    const [rotation, setRotation] = useState(0)

    const handleZoomIn = () => setScale(s => Math.min(s + 0.5, 3))
    const handleZoomOut = () => setScale(s => Math.max(s - 0.5, 1))
    const handleRotate = () => setRotation(r => (r + 90) % 360)

    return (
        <div className="bg-gray-100 rounded-lg border overflow-hidden h-full min-h-[500px] flex flex-col">
            <div className="p-2 border-b bg-white flex justify-end gap-2">
                <button onClick={handleZoomOut} className="p-2 hover:bg-gray-100 rounded" title="Zoom Out">
                    <ZoomOut className="w-5 h-5" />
                </button>
                <button onClick={handleZoomIn} className="p-2 hover:bg-gray-100 rounded" title="Zoom In">
                    <ZoomIn className="w-5 h-5" />
                </button>
                <button onClick={handleRotate} className="p-2 hover:bg-gray-100 rounded" title="Rotate">
                    <RotateCw className="w-5 h-5" />
                </button>
            </div>

            <div className="flex-1 overflow-auto flex items-center justify-center p-4">
                <div
                    style={{
                        transform: `scale(${scale}) rotate(${rotation}deg)`,
                        transition: 'transform 0.2s ease-in-out'
                    }}
                >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={src}
                        alt={alt}
                        className="max-w-full h-auto shadow-lg"
                    />
                </div>
            </div>
        </div>
    )
}
