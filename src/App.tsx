/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useRef, useEffect, type ChangeEvent } from 'react';
import { Plus, Upload, Trophy, RotateCcw, X, Sparkles, Loader2, AlertCircle, Move, Trash2, Settings, Key, Github, Star } from 'lucide-react';

// --- 类型定义 ---
interface Item {
  id: string;
  name: string;
  image: string;
}

type GameState = 'idle' | 'guessing' | 'success' | 'fail';
type CatEmotion = 'neutral' | 'thinking' | 'happy' | 'sad';

// --- 常量配置 ---
const STORAGE_KEY = 'cat_guess_items_ts_v1';
const API_KEY_STORAGE = 'cat_guess_gemini_key';
const GITHUB_URL = "https://github.com/mowtwo/cat-guess-game"; // 请替换为你的实际仓库地址

const DEFAULT_ITEMS: Item[] = [
  {
    id: 'default_1',
    name: '纸巾',
    image: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="20" y="40" width="60" height="40" fill="%23eee" stroke="%23ccc" stroke-width="2"/><path d="M30 40 Q50 10 70 40" fill="%23fff" stroke="%23ddd"/></svg>'
  },
  {
    id: 'default_2',
    name: '萝卜',
    image: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M50 90 Q20 40 50 40 Q80 40 50 90" fill="orange"/><path d="M50 40 L40 10 M50 40 L50 5 M50 40 L60 10" stroke="green" stroke-width="3"/></svg>'
  }
];

const MAX_UPLOAD_SIZE = 1024 * 1024; // 1MB

// --- 工具函数：图像压缩 ---
const compressImage = (base64Str: string, maxWidth = 400, maxHeight = 400): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;
      if (width > height) {
        if (width > maxWidth) { height *= maxWidth / width; width = maxWidth; }
      } else if (height > maxHeight) {
        width *= maxHeight / height; height = maxHeight;
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      }
    };
  });
};

// --- Gemini AI 分析 ---
const analyzeImage = async (base64Image: string, apiKey: string): Promise<string> => {
  if (!apiKey) throw new Error("MISSING_KEY");

  const base64Data = base64Image.split(',')[1];
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: "请识别这张图片中的物品名称，只返回名称，不要超过4个字。" },
          { inlineData: { mimeType: "image/jpeg", data: base64Data } }
        ]
      }]
    })
  });

  if (!response.ok) throw new Error("API_ERROR");

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) throw new Error("EMPTY_RESPONSE");
  return text;
};

export default function App() {
  const [items, setItems] = useState<Item[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : DEFAULT_ITEMS;
    } catch (e) {
      console.error("Failed to load items from storage:", e);
      return DEFAULT_ITEMS;
    }
  });

  const [geminiKey, setGeminiKey] = useState<string>(() => {
    return localStorage.getItem(API_KEY_STORAGE) || "";
  });

  const [score, setScore] = useState<number>(0);
  const [gameState, setGameState] = useState<GameState>('idle');
  const [catEmotion, setCatEmotion] = useState<CatEmotion>('neutral');
  const [targetItem, setTargetItem] = useState<Item | null>(null);
  const [catChoice, setCatChoice] = useState<Item | null>(null);
  const [catMessage, setCatMessage] = useState<string>("人类，快选一个东西让我猜！");
  const [isAiAnalyzing, setIsAiAnalyzing] = useState<boolean>(false);
  const [isAiTalking, setIsAiTalking] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [newItemName, setNewItemName] = useState<string>('');
  const [newItemImage, setNewItemImage] = useState<string | null>(null);
  const [draggedItemIndex, setDraggedItemIndex] = useState<number | null>(null);

  const intervalRef = useRef<number | null>(null);
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  useEffect(() => {
    localStorage.setItem(API_KEY_STORAGE, geminiKey);
  }, [geminiKey]);

  const speak = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'zh-CN';
      window.speechSynthesis.speak(utterance);
    }
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    if (gameState !== 'idle') return;
    setDraggedItemIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    const target = e.target as HTMLElement;
    setTimeout(() => { target.style.opacity = '0.3'; }, 0);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedItemIndex === null || draggedItemIndex === index) return;
    const newItems = [...items];
    const draggedItem = newItems.splice(draggedItemIndex, 1)[0];
    newItems.splice(index, 0, draggedItem);
    setItems(newItems);
    setDraggedItemIndex(index);
  };

  const handleItemClick = (item: Item) => {
    if (gameState !== 'idle') return;
    setTargetItem(item);
    speak(item.name);
    startCatGuessing(item);
  };

  const handleDeleteItem = (e: React.MouseEvent, itemId: string) => {
    e.stopPropagation();
    if (gameState !== 'idle') return;
    if (items.length <= 1) {
      setErrorMsg('仓库里至少要留一个东西喵！');
      setTimeout(() => setErrorMsg(''), 3000);
      return;
    }
    setItems(prev => prev.filter(item => item.id !== itemId));
  };

  const startCatGuessing = (userTarget: Item) => {
    setGameState('guessing');
    setCatEmotion('thinking');
    setCatChoice(null);
    setCatMessage("喵呜...让我想想...");
    setIsAiTalking(true);
    speak(userTarget.name);

    let ticks = 0;
    intervalRef.current = setInterval(() => {
      const chosen = items[Math.floor(Math.random() * items.length)];
      setCatChoice(chosen);
      itemRefs.current[chosen.id]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });

      if (++ticks >= 12) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        finalizeGuess(userTarget);
      }
    }, 200);
  };

  const finalizeGuess = (userTarget: Item) => {
    const currentItems = [...items];
    const finalPick = currentItems[Math.floor(Math.random() * currentItems.length)];
    setCatChoice(finalPick);

    if (finalPick.id === userTarget.id) {
      setGameState('success');
      setCatEmotion('happy');
      setScore(s => s + 1);
      setCatMessage("猜对了喵！");
      speak("真棒");
      setTimeout(() => {
        setGameState('idle');
        setCatEmotion('neutral');
        setCatMessage("人类，快选一个东西让我猜！");
        setIsAiTalking(false);
      }, 3000);
    } else {
      setGameState('fail');
      setCatEmotion('sad');
      setCatMessage("没猜中喵...");
    }
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_UPLOAD_SIZE) {
      setErrorMsg('图片太大啦！请选择 1MB 以内的图片喵~');
      return;
    }
    setErrorMsg('');
    const reader = new FileReader();
    reader.onloadend = async () => {
      const result = reader.result as string;
      setIsAiAnalyzing(true);
      try {
        const compressed = await compressImage(result);
        setNewItemImage(compressed);
        const name = await analyzeImage(compressed, geminiKey);
        setNewItemName(name);
      } catch (err: any) {
        if (err.message === "MISSING_KEY" || err.message === "API_ERROR") {
          setErrorMsg("AI 识别失败。请点击右上角设置图标检查 Gemini API Key 喵！");
          setIsSettingsOpen(true);
        } else {
          setErrorMsg("发生了未知错误喵...");
        }
        setNewItemName("未知物品");
      } finally {
        setIsAiAnalyzing(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const saveNewItem = () => {
    if (newItemName && newItemImage) {
      setItems(prev => [...prev, { id: Date.now().toString(), name: newItemName, image: newItemImage }]);
      setIsAddModalOpen(false);
      setNewItemName('');
      setNewItemImage(null);
    }
  };

  return (
    <div className="flex flex-col bg-orange-50 selection:bg-orange-200 min-h-screen font-sans text-gray-800">
      <style>{`.scrollbar-hide::-webkit-scrollbar { display: none; } .scrollbar-hide { scrollbar-width: none; } .drag-item { cursor: grab; } .drag-item:active { cursor: grabbing; }`}</style>

      <header className="top-0 z-50 sticky flex justify-between items-center bg-white/80 shadow-sm backdrop-blur-md p-4 border-orange-100 border-b">
        <div className="flex items-center gap-3">
          <div className="bg-orange-500 shadow-lg shadow-orange-200 p-2 rounded-xl"><Sparkles className="text-white" size={20} /></div>
          <h1 className="hidden sm:block font-black text-orange-900 text-xl tracking-tight">小猫猜猜乐</h1>
        </div>
        <div className="flex items-center gap-2">
          {/* GitHub Star 按钮 */}
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-1.5 bg-gray-900 hover:bg-black shadow-md px-3 py-1.5 rounded-full font-bold text-white text-xs transition-all"
          >
            <Github size={14} />
            <span className="hidden xs:inline">Give a Star</span>
            <Star size={14} className="text-yellow-400 group-hover:scale-125 transition-transform" />
          </a>

          <div className="flex items-center gap-2 bg-orange-100 shadow-inner px-3 py-1.5 rounded-full font-bold text-orange-800">
            <Trophy size={16} /> <span className="text-sm">{score}</span>
          </div>
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="hover:bg-orange-50 p-2 rounded-full text-orange-400 hover:text-orange-600 transition-colors"
          >
            <Settings size={20} />
          </button>
        </div>
      </header>

      <main className="flex flex-col flex-1 justify-center items-center gap-8 mx-auto p-4 w-full max-w-5xl">
        {errorMsg && !isAddModalOpen && !isSettingsOpen && (
          <div className="top-20 left-1/2 z-[100] fixed flex items-center gap-2 bg-red-500 shadow-lg px-6 py-2 rounded-full font-bold text-white text-sm -translate-x-1/2 animate-bounce">
            <AlertCircle size={16} /> {errorMsg}
          </div>
        )}

        <div className="relative flex flex-col justify-center items-center w-full min-h-[300px]">
          <div className="relative flex justify-center items-center w-56 h-56 transition-all duration-300">
            <svg viewBox="0 0 240 240" className={`w-full h-full drop-shadow-2xl ${gameState === 'guessing' ? 'animate-bounce' : ''}`}>
              <path d="M60 70 L40 20 L100 50 Z" fill="#FDBA74" stroke="#442c1d" strokeWidth="3" />
              <path d="M180 70 L200 20 L140 50 Z" fill="#333" stroke="#442c1d" strokeWidth="3" />
              <ellipse cx="120" cy="140" rx="85" ry="75" fill="white" stroke="#442c1d" strokeWidth="3" />
              <path d="M50 100 Q40 120 50 160 Q80 140 70 100 Z" fill="#FDBA74" opacity="0.8" />
              <path d="M190 100 Q200 120 190 160 Q160 140 170 100 Z" fill="#333" opacity="0.8" />
              <path d="M70 75 Q120 45 170 75 L175 90 Q120 75 65 90 Z" fill="#3b82f6" stroke="#1e3a8a" strokeWidth="2" />
              <path d="M120 45 L125 55 L135 55 L127 62 L130 72 L120 65 L110 72 L113 62 L105 55 L115 55 Z" fill="#facc15" />
              {catEmotion === 'thinking' ? (
                <><circle cx="95" cy="115" r="7" fill="#333" /><circle cx="145" cy="115" r="7" fill="#333" /><path d="M90 100 Q95 95 100 100" fill="none" stroke="#333" strokeWidth="2" /><path d="M140 100 Q145 95 150 100" fill="none" stroke="#333" strokeWidth="2" /></>
              ) : catEmotion === 'happy' ? (
                <><path d="M85 115 Q95 105 105 115" fill="none" stroke="#333" strokeWidth="3" /><path d="M135 115 Q145 105 155 115" fill="none" stroke="#333" strokeWidth="3" /></>
              ) : catEmotion === 'sad' ? (
                <><line x1="85" y1="110" x2="105" y2="120" stroke="#333" strokeWidth="3" /><line x1="85" y1="120" x2="105" y2="110" stroke="#333" strokeWidth="3" /><line x1="135" y1="110" x2="155" y2="120" stroke="#333" strokeWidth="3" /><line x1="135" y1="120" x2="155" y2="110" stroke="#333" strokeWidth="3" /></>
              ) : (
                <><circle cx="95" cy="120" r="10" fill="#333" /><circle cx="145" cy="120" r="10" fill="#333" /><circle cx="98" cy="116" r="4" fill="white" /><circle cx="148" cy="116" r="4" fill="white" /></>
              )}
              <path d="M115 135 L125 135 L120 142 Z" fill="#fda4af" /><path d="M120 142 Q110 150 100 145 M120 142 Q130 150 140 145" fill="none" stroke="#333" strokeWidth="2" />
            </svg>
            <div className={`absolute -top-12 left-1/2 -translate-x-1/2 w-48 bg-white border-2 border-orange-200 rounded-2xl p-2 shadow-lg text-xs font-bold text-center transition-opacity duration-500 ${isAiTalking ? 'opacity-100' : 'opacity-0'}`}>
              {catMessage}
              <div className="-bottom-2 left-1/2 absolute bg-white border-orange-200 border-r-2 border-b-2 w-4 h-4 rotate-45 -translate-x-1/2"></div>
            </div>
          </div>

          {gameState === 'fail' && (
            <div className="slide-in-from-bottom-4 z-50 flex gap-4 mt-8 animate-in duration-500 fade-in">
              <button onClick={() => targetItem && startCatGuessing(targetItem)} className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 shadow-xl px-8 py-3 rounded-2xl font-bold text-white active:scale-95 transition-all transform">
                <RotateCcw size={20} /> 再猜一次喵
              </button>
              <button onClick={() => { setGameState('idle'); setCatEmotion('neutral'); setIsAiTalking(false); }} className="bg-white hover:bg-gray-50 shadow-lg px-8 py-3 border border-gray-100 rounded-2xl font-bold text-gray-600 transition-all">
                换个物品
              </button>
            </div>
          )}
        </div>

        <div className="relative w-full">
          <div className="flex justify-between items-end mb-4 px-4">
            <div><h2 className="font-black text-orange-900 text-lg">物品仓库</h2><p className="font-medium text-orange-400 text-xs">长按拖动排序，点击物品开始猜测</p></div>
            <button onClick={() => setIsAddModalOpen(true)} className="bg-white hover:bg-orange-50 shadow-lg p-3 border border-orange-50 rounded-2xl text-orange-500 hover:scale-110 active:scale-90 transition-all"><Plus size={24} /></button>
          </div>

          <div className="relative">
            <div className={`absolute pointer-events-none transition-all duration-300 ease-out z-[60] ${gameState === 'guessing' ? 'opacity-100 scale-100' : 'opacity-0 scale-50'}`}
              style={{ left: catChoice && itemRefs.current[catChoice.id] ? itemRefs.current[catChoice.id]!.offsetLeft + 64 : '50%', top: '-10px', transform: 'translateX(-50%)' }}
            >
              <svg width="80" height="80" viewBox="0 0 100 100">
                <path d="M50 90 C30 90 20 70 20 50 C20 30 35 20 50 20 C65 20 80 30 80 50 C80 70 70 90 50 90" fill="white" stroke="#442c1d" strokeWidth="3" />
                <path d="M50 90 C30 90 20 70 20 50 L35 50 Q50 65 65 50 L80 50 C80 70 70 90 50 90" fill="#FDBA74" /><circle cx="35" cy="40" r="10" fill="#fda4af" /><circle cx="50" cy="30" r="10" fill="#fda4af" /><circle cx="65" cy="40" r="10" fill="#fda4af" /><ellipse cx="50" cy="65" rx="18" ry="15" fill="#fda4af" />
              </svg>
            </div>

            <div className="relative flex gap-6 px-6 py-12 min-h-[220px] overflow-x-auto snap-x scrollbar-hide">
              {items.map((item, index) => {
                const isCatThinking = catChoice?.id === item.id;
                const isSelected = targetItem?.id === item.id;
                return (
                  <div
                    key={item.id}
                    ref={el => {
                      itemRefs.current[item.id] = el
                    }}
                    draggable={gameState === 'idle'}
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragEnd={(e) => { (e.target as HTMLElement).style.opacity = '1'; setDraggedItemIndex(null); }}
                    onDragOver={(e) => handleDragOver(e, index)}
                    className={`group relative flex-shrink-0 w-32 h-44 flex flex-col items-center justify-between p-4 rounded-3xl border-2 transition-all duration-300 snap-center drag-item
                      ${isCatThinking && gameState === 'guessing' ? 'border-orange-400 bg-white scale-110 z-20 shadow-2xl shadow-orange-200'
                        : isSelected ? 'border-orange-500 bg-orange-50 ring-4 ring-orange-100/50 z-10'
                          : 'border-transparent bg-white/60 hover:bg-white hover:border-orange-200 shadow-md'}`}
                    onClick={() => handleItemClick(item)}
                  >
                    {gameState === 'idle' && (
                      <>
                        <div className="top-2 right-2 absolute group-hover:opacity-0 text-orange-200 transition-opacity">
                          <Move size={14} />
                        </div>
                        <button
                          onClick={(e) => handleDeleteItem(e, item.id)}
                          className="top-2 right-2 absolute hover:bg-red-50 opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-red-300 hover:text-red-500 transition-all"
                        >
                          <Trash2 size={16} />
                        </button>
                      </>
                    )}

                    <div className="flex justify-center items-center bg-orange-50/50 p-2 rounded-2xl w-24 h-24 overflow-hidden pointer-events-none">
                      <img src={item.image} alt={item.name} className="w-full h-full object-contain" />
                    </div>
                    <span className="mt-2 w-full font-black text-orange-900 text-sm text-center truncate pointer-events-none">{item.name}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </main>

      {/* 设置弹窗 */}
      {isSettingsOpen && (
        <div className="z-[120] fixed inset-0 flex justify-center items-center bg-orange-900/40 backdrop-blur-md p-6">
          <div className="relative bg-white shadow-2xl p-8 rounded-[2rem] w-full max-w-sm">
            <div className="flex justify-between items-center mb-6">
              <h3 className="flex items-center gap-2 font-black text-orange-950 text-xl"><Settings className="text-orange-500" size={20} /> 开发者设置</h3>
              <button onClick={() => setIsSettingsOpen(false)} className="bg-orange-50 p-2 rounded-full text-orange-500"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <div className="flex gap-3 bg-blue-50 p-4 rounded-2xl text-blue-700 text-xs leading-relaxed">
                <AlertCircle className="shrink-0" size={16} />
                <p>AI 物品识别需要 <b>Gemini API Key</b>。你可以从 Google AI Studio 免费获取。</p>
              </div>
              <div className="space-y-2">
                <label className="flex items-center gap-1 ml-1 font-bold text-orange-400 text-xs"><Key size={12} /> Gemini API Key</label>
                <input
                  type="password"
                  value={geminiKey}
                  onChange={(e) => setGeminiKey(e.target.value)}
                  placeholder="在此输入你的 API Key"
                  className="bg-orange-50 px-5 py-4 rounded-2xl outline-none ring-orange-200 focus:ring-2 w-full font-mono text-sm transition-all"
                />
              </div>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="bg-orange-950 hover:bg-black py-4 rounded-2xl w-full font-bold text-white transition-colors"
              >
                保存设置
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 添加物品弹窗 */}
      {isAddModalOpen && (
        <div className="z-[100] fixed inset-0 flex justify-center items-center bg-orange-900/40 backdrop-blur-md p-6">
          <div className="relative bg-white shadow-2xl p-8 rounded-[2rem] w-full max-w-md overflow-hidden">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-black text-orange-950 text-2xl">扩充仓库</h3>
              <button onClick={() => { setIsAddModalOpen(false); setErrorMsg(''); }} className="bg-orange-50 p-2 rounded-full text-orange-500"><X size={24} /></button>
            </div>
            {errorMsg && (
              <div
                className={`mb-4 p-4 rounded-xl flex items-center gap-2 text-sm font-bold border animate-shake ${errorMsg.includes('API Key') ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-red-50 text-red-600 border-red-100'}`}
              >
                <AlertCircle size={18} /> {errorMsg}
              </div>
            )}
            <div className="space-y-6">
              <div className="space-y-1">
                <label className="ml-2 font-bold text-orange-400 text-xs">物品名称</label>
                <input type="text" value={newItemName} onChange={(e) => setNewItemName(e.target.value)} placeholder={isAiAnalyzing ? "猫咪正在观察..." : "给它起个名字喵？"} className="bg-orange-50 px-6 py-4 rounded-2xl outline-none ring-orange-200 focus:ring-2 w-full font-bold transition-all" />
              </div>
              <div className="space-y-1">
                <label className="ml-2 font-bold text-orange-400 text-xs">上传图片 (限1MB)</label>
                <div className={`border-3 border-dashed rounded-[1.5rem] p-8 text-center cursor-pointer transition-all ${newItemImage ? 'border-orange-200' : 'border-orange-100 hover:border-orange-300 bg-orange-50/30'}`}
                  onClick={() => !isAiAnalyzing && document.getElementById('fileInput')?.click()}>
                  {isAiAnalyzing ? (
                    <div className="flex flex-col items-center gap-3 py-6"><Loader2 className="text-orange-400 animate-spin" size={40} /><p className="font-bold text-orange-400 text-sm">正在通过 AI 识别...</p></div>
                  ) : newItemImage ? (
                    <img src={newItemImage} className="mx-auto rounded-xl w-40 h-40 object-contain" />
                  ) : (
                    <div className="py-6"><Upload className="mx-auto mb-2 text-orange-200" size={40} /><p className="font-bold text-orange-300 text-xs">点我拍照或选图</p></div>
                  )}
                  <input id="fileInput" type="file" className="sr-only" accept="image/*" onChange={handleFileChange} />
                </div>
              </div>
              <button onClick={saveNewItem} disabled={!newItemName || !newItemImage || isAiAnalyzing}
                className={`w-full font-black py-5 rounded-2xl shadow-lg transition-all ${(!newItemName || !newItemImage || isAiAnalyzing) ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-orange-500 text-white hover:bg-orange-600 active:scale-95'}`}>
                存入仓库喵
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
