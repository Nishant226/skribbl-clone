import React, { useRef, useEffect, useState } from 'react';
import { socket } from './socket';

function Canvas({ roomId, isDrawer }) {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#000000');
  const [lineWidth, setLineWidth] = useState(5);
  const [isEraser, setIsEraser] = useState(false);
  const [history, setHistory] = useState([]);

  const colors = ['#000000', '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#a855f7', '#ec4899', '#ffffff'];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Razor-sharp internal canvas resolution
    canvas.width = 600;
    canvas.height = 360;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    const initialDataUrl = canvas.toDataURL();
    setHistory([initialDataUrl]);

    socket.on('draw_start', ({ x, y, color, size }) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = size;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x, y);
    });

    socket.on('draw_move', ({ x, y }) => {
      ctx.lineTo(x, y);
      ctx.stroke();
    });

    socket.on('draw_end', () => {
      ctx.closePath();
    });

    // Automatic clean board on new round or drawer change
    socket.on('canvas_clear', () => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const clearedUrl = canvas.toDataURL();
      setHistory([clearedUrl]);
    });

    socket.on('draw_undo', ({ imageData }) => {
      const img = new Image();
      img.src = imageData;
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
      };
    });

    return () => {
      socket.off('draw_start');
      socket.off('draw_move');
      socket.off('draw_end');
      socket.off('canvas_clear');
      socket.off('draw_undo');
    };
  }, []);

  const saveState = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      setHistory((prev) => [...prev, canvas.toDataURL()]);
    }
  };

  const getCanvasCoords = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  };

  const startDrawing = (e) => {
    if (!isDrawer) return;
    setIsDrawing(true);
    const { x, y } = getCanvasCoords(e);
    const ctx = canvasRef.current.getContext('2d');
    
    ctx.strokeStyle = isEraser ? '#ffffff' : color;
    ctx.lineWidth = isEraser ? 24 : lineWidth;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);

    socket.emit('draw_start', { roomId, x, y, color: ctx.strokeStyle, size: ctx.lineWidth });
  };

  const draw = (e) => {
    if (!isDrawing || !isDrawer) return;
    const { x, y } = getCanvasCoords(e);
    const ctx = canvasRef.current.getContext('2d');
    
    ctx.lineTo(x, y);
    ctx.stroke();

    socket.emit('draw_move', { roomId, x, y });
  };

  const stopDrawing = () => {
    if (!isDrawing || !isDrawer) return;
    setIsDrawing(false);
    const ctx = canvasRef.current.getContext('2d');
    ctx.closePath();
    saveState();

    socket.emit('draw_end', { roomId });
  };

  const handleClear = () => {
    if (!isDrawer) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    const clearedUrl = canvas.toDataURL();
    setHistory([clearedUrl]);

    socket.emit('canvas_clear', { roomId });
  };

  const handleUndo = () => {
    if (!isDrawer || history.length <= 1) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    const newHistory = [...history];
    newHistory.pop();
    const previousStateUrl = newHistory[newHistory.length - 1];
    
    const img = new Image();
    img.src = previousStateUrl;
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      setHistory(newHistory);
      socket.emit('draw_undo', { roomId, imageData: previousStateUrl });
    };
  };

  return (
    <div className="flex flex-col items-center gap-3 w-full">
      
      {/* Canvas Element with Pointer Events for seamless mobile touch & desktop mouse support */}
      <div className="relative rounded-xl overflow-hidden shadow-lg border border-slate-700 bg-white">
        <canvas
          ref={canvasRef}
          onPointerDown={startDrawing}
          onPointerMove={draw}
          onPointerUp={stopDrawing}
          onPointerLeave={stopDrawing}
          style={{ width: '600px', height: '360px', touchAction: 'none' }}
          className={`block ${isDrawer ? 'cursor-crosshair' : 'cursor-not-allowed'}`}
        />
      </div>

      {/* Professional Drawing Tools Toolbar */}
      {isDrawer && (
        <div className="w-full max-w-[600px] bg-slate-900 border border-slate-800 p-3 rounded-2xl shadow-xl flex flex-col gap-2.5">
          
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 bg-slate-950 p-1.5 rounded-xl border border-slate-800">
              {colors.map((c) => (
                <button
                  key={c}
                  onClick={() => { setColor(c); setIsEraser(false); }}
                  style={{ backgroundColor: c }}
                  className={`w-5 h-5 rounded-lg transition transform hover:scale-110 ${
                    !isEraser && color === c ? 'ring-2 ring-purple-400 scale-110 shadow-md' : 'border border-slate-700'
                  }`}
                  title={c}
                />
              ))}
              <input
                type="color"
                value={color}
                disabled={isEraser}
                onChange={(e) => { setColor(e.target.value); setIsEraser(false); }}
                className="w-5 h-5 rounded-lg bg-transparent cursor-pointer border-0 p-0 ml-1"
                title="Custom Color"
              />
            </div>

            <div className="flex items-center gap-2">
              <button onClick={() => setIsEraser(!isEraser)} className={`px-3 py-1.5 text-xs font-bold rounded-xl transition shadow flex items-center gap-1.5 ${isEraser ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'}`}>
                {isEraser ? '✏️ Pen' : '🧹 Eraser'}
              </button>

              <button onClick={handleUndo} disabled={history.length <= 1} className="px-3 py-1.5 text-xs font-bold rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 border border-slate-700 transition">
                ↩️ Undo
              </button>

              <button onClick={handleClear} className="px-3.5 py-1.5 text-xs font-bold rounded-xl bg-red-600/80 hover:bg-red-600 text-white transition shadow">
                🗑️ Clear
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3 bg-slate-950 px-3.5 py-2 rounded-xl border border-slate-800">
            <span className="text-xs font-bold text-slate-400 flex items-center gap-1">
              <span>🖌️ Size:</span>
              <span className="text-purple-400 font-mono w-4">{lineWidth}</span>
            </span>
            <input
              type="range"
              min="2"
              max="35"
              value={lineWidth}
              onChange={(e) => setLineWidth(Number(e.target.value))}
              className="flex-1 accent-purple-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
            />
            <div className="w-5 flex justify-center items-center">
              <div 
                style={{ width: `${Math.min(lineWidth, 20)}px`, height: `${Math.min(lineWidth, 20)}px`, backgroundColor: isEraser ? '#ffffff' : color }}
                className="rounded-full border border-slate-600 shadow-sm"
              />
            </div>
          </div>

        </div>
      )}
    </div>
  );
}

export default Canvas;