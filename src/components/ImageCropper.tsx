import React, { useState, useCallback } from 'react';
import Cropper, { Area, Point } from 'react-easy-crop';
import { X, Check, RotateCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

interface ImageCropperProps {
  image: string;
  onCropComplete: (croppedImage: string) => void;
  onCancel: () => void;
  aspect?: number;
  isDarkMode?: boolean;
}

export const ImageCropper: React.FC<ImageCropperProps> = ({ 
  image, 
  onCropComplete, 
  onCancel,
  aspect = 1,
  isDarkMode = true
}) => {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  const onCropChange = (crop: Point) => {
    setCrop(crop);
  };

  const onZoomChange = (zoom: number) => {
    setZoom(zoom);
  };

  const onCropCompleteInternal = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const createImage = (url: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const image = new Image();
      image.addEventListener('load', () => resolve(image));
      image.addEventListener('error', (error) => reject(error));
      image.setAttribute('crossOrigin', 'anonymous');
      image.src = url;
    });

  const getCroppedImg = async (
    imageSrc: string,
    pixelCrop: Area,
    rotation = 0
  ): Promise<string> => {
    const image = await createImage(imageSrc);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      return '';
    }

    const rotRad = (rotation * Math.PI) / 180;
    const { width: bBoxWidth, height: bBoxHeight } = rotateSize(
      image.width,
      image.height,
      rotation
    );

    canvas.width = bBoxWidth;
    canvas.height = bBoxHeight;

    ctx.translate(bBoxWidth / 2, bBoxHeight / 2);
    ctx.rotate(rotRad);
    ctx.translate(-image.width / 2, -image.height / 2);

    ctx.drawImage(image, 0, 0);

    const data = ctx.getImageData(
      pixelCrop.x,
      pixelCrop.y,
      pixelCrop.width,
      pixelCrop.height
    );

    canvas.width = pixelCrop.width;
    canvas.height = pixelCrop.height;

    ctx.putImageData(data, 0, 0);

    return canvas.toDataURL('image/jpeg');
  };

  const rotateSize = (width: number, height: number, rotation: number) => {
    const rotRad = (rotation * Math.PI) / 180;

    return {
      width:
        Math.abs(Math.cos(rotRad) * width) + Math.abs(Math.sin(rotRad) * height),
      height:
        Math.abs(Math.sin(rotRad) * width) + Math.abs(Math.cos(rotRad) * height),
    };
  };

  const handleSave = async () => {
    if (croppedAreaPixels) {
      try {
        const croppedImage = await getCroppedImg(image, croppedAreaPixels, rotation);
        onCropComplete(croppedImage);
      } catch (e) {
        console.error(e);
      }
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
    >
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className={cn(
          "border rounded-2xl w-full max-w-lg overflow-hidden flex flex-col shadow-2xl transition-colors duration-300",
          isDarkMode ? "bg-zinc-700 border-zinc-600" : "bg-white border-zinc-200"
        )}
      >
        <div className={cn(
          "p-4 border-b flex items-center justify-between",
          isDarkMode ? "border-zinc-700" : "border-zinc-100"
        )}>
          <h3 className={cn("font-medium", isDarkMode ? "text-white" : "text-zinc-900")}>裁剪头像</h3>
          <button onClick={onCancel} className={cn(
            "p-1 rounded-lg transition-colors",
            isDarkMode ? "text-zinc-400 hover:text-white hover:bg-zinc-600" : "text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100"
          )}>
            <X size={20} />
          </button>
        </div>

        <div className="relative h-80 w-full bg-black/5">
          <Cropper
            image={image}
            crop={crop}
            zoom={zoom}
            rotation={rotation}
            aspect={aspect}
            onCropChange={onCropChange}
            onCropComplete={onCropCompleteInternal}
            onZoomChange={onZoomChange}
            cropShape="round"
            showGrid={false}
            style={{
              containerStyle: { background: isDarkMode ? '#09090b' : '#f4f4f5' },
              cropAreaStyle: { border: '2px solid #6366f1', boxShadow: isDarkMode ? '0 0 0 9999em rgba(0, 0, 0, 0.5)' : '0 0 0 9999em rgba(255, 255, 255, 0.5)' }
            }}
          />
        </div>

        <div className="p-6 space-y-6">
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-medium">
              <span className={isDarkMode ? "text-zinc-400" : "text-zinc-500"}>缩放</span>
              <span className={isDarkMode ? "text-zinc-300" : "text-zinc-800"}>{Math.round(zoom * 100)}%</span>
            </div>
            <input
              type="range"
              value={zoom}
              min={1}
              max={3}
              step={0.1}
              aria-labelledby="Zoom"
              onChange={(e) => setZoom(Number(e.target.value))}
              className={cn(
                "w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-indigo-500",
                isDarkMode ? "bg-zinc-700" : "bg-zinc-200"
              )}
            />
          </div>

          <div className="flex items-center justify-between">
            <button 
              onClick={() => setRotation((prev) => (prev + 90) % 360)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg transition-all text-sm font-medium",
                isDarkMode 
                  ? "bg-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-600" 
                  : "bg-zinc-100 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200"
              )}
            >
              <RotateCw size={16} />
              旋转 90°
            </button>

            <div className="flex items-center gap-3">
              <button 
                onClick={onCancel}
                className={cn(
                  "px-4 py-2 rounded-lg transition-colors text-sm font-medium",
                  isDarkMode ? "text-zinc-400 hover:text-white" : "text-zinc-500 hover:text-zinc-900"
                )}
              >
                取消
              </button>
              <button 
                onClick={handleSave}
                className="flex items-center gap-2 px-6 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 transition-all text-sm font-medium shadow-lg shadow-indigo-600/20"
              >
                <Check size={16} />
                保存头像
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};
