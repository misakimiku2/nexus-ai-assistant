import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Brain, Sparkles, User, Zap, Mic, FolderOpen, ExternalLink, Plus, MoreVertical, Trash2, Edit3, Activity, CheckCircle2, XCircle, Loader2, X, Music, Camera, Image as ImageIcon, Smile, Heart, Star, Ghost, Cat, Dog, Play } from 'lucide-react';
import { NexusLogo } from './NexusLogo';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/utils';
import { ImageCropper } from './ImageCropper';

interface VoiceSettingsProps {
  isDarkMode: boolean;
}

interface EngineConfig {
  path: string;
  backend: 'GPU' | 'CPU';
  downloadUrl: string;
  isReady: boolean;
}

interface Persona {
  id: string;
  name: string;
  icon: any;
  avatarUrl?: string;
  isCustom?: boolean;
}

const engines = ['Fish Speech', 'ChatTTS'];

const PRESET_ICONS = [
  { id: 'brain', icon: Brain },
  { id: 'sparkles', icon: Sparkles },
  { id: 'user', icon: User },
  { id: 'smile', icon: Smile },
  { id: 'heart', icon: Heart },
  { id: 'star', icon: Star },
  { id: 'ghost', icon: Ghost },
  { id: 'cat', icon: Cat },
  { id: 'dog', icon: Dog },
];

const AddPersonaModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onAdd: (persona: Persona) => void;
  isDarkMode: boolean;
}> = ({ isOpen, onClose, onAdd, isDarkMode }) => {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [refText, setRefText] = useState('');
  const [tracks, setTracks] = useState([]);
  const [pitch, setPitch] = useState(1.0);
  const [speed, setSpeed] = useState(1.0);
  
  const [avatarType, setAvatarType] = useState<'icon' | 'image'>('icon');
  const [selectedIcon, setSelectedIcon] = useState('user');
  const [customAvatar, setCustomAvatar] = useState<string | null>(null);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [croppingImage, setCroppingImage] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setName('');
      setRefText('');
      setTracks([
        { id: 'calm', name: t('settings.voice.addModal.tracks.calm') },
        { id: 'battle', name: t('settings.voice.addModal.tracks.battle') },
      ]);
      setPitch(1.0);
      setSpeed(1.0);
      setAvatarType('icon');
      setSelectedIcon('user');
      setCustomAvatar(null);
      setShowIconPicker(false);
    }
  }, [isOpen, t]);

  const handleAddTrack = () => {
    const newTrackName = prompt(t('settings.voice.addModal.addTrack'));
    if (newTrackName) {
      setTracks([...tracks, { id: Date.now().toString(), name: newTrackName }]);
    }
  };

  const handleDeleteTrack = (id: string) => {
    setTracks(tracks.filter(t => t.id !== id));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setCroppingImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCropComplete = (croppedImage: string) => {
    setCustomAvatar(croppedImage);
    setAvatarType('image');
    setCroppingImage(null);
  };

  const handleConfirm = () => {
    if (!name.trim()) return;
    
    const newPersona: Persona = {
      id: Date.now().toString(),
      name: name,
      icon: avatarType === 'icon' ? (PRESET_ICONS.find(i => i.id === selectedIcon)?.icon || User) : User,
      avatarUrl: avatarType === 'image' ? (customAvatar || undefined) : undefined,
      isCustom: true
    };
    
    onAdd(newPersona);
    onClose();
  };

  if (!isOpen) return null;

  const CurrentIcon = PRESET_ICONS.find(i => i.id === selectedIcon)?.icon || User;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className={cn(
            "w-full max-w-lg rounded-3xl border shadow-2xl overflow-hidden",
            isDarkMode ? "bg-zinc-700 border-zinc-600" : "bg-white border-zinc-200"
          )}
        >
          <div className="flex items-center justify-between p-6 border-b border-zinc-600/10">
            <h3 className={cn("text-lg font-bold", isDarkMode ? "text-zinc-100" : "text-zinc-900")}>
              {t('settings.voice.addModal.title')}
            </h3>
            <button onClick={onClose} className="p-2 hover:bg-zinc-700/10 rounded-xl transition-colors">
              <X size={20} />
            </button>
          </div>

          <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
            {/* Avatar & Name */}
            <div className="flex items-end gap-4">
              <div className="relative">
                <div 
                  className={cn(
                    "w-24 h-24 rounded-2xl border-2 flex items-center justify-center overflow-hidden cursor-pointer transition-all",
                    isDarkMode ? "bg-zinc-700 border-zinc-600" : "bg-zinc-50 border-zinc-200",
                    "hover:border-indigo-500/50 shadow-sm",
                    "transform-gpu" // Anti-aliasing trick
                  )}
                  style={{ transform: 'translateZ(0)' }} // Anti-aliasing trick
                  onClick={() => fileInputRef.current?.click()}
                >
                  {avatarType === 'image' && customAvatar ? (
                    <img src={customAvatar} alt="Avatar" className="w-full h-full object-cover rounded-2xl" />
                  ) : (
                    <CurrentIcon size={48} className="text-indigo-500" />
                  )}
                  
                  <div 
                    className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 flex items-center justify-center transition-opacity"
                  >
                    <Camera size={24} className="text-white" />
                  </div>
                </div>
                
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowIconPicker(!showIconPicker);
                  }}
                  className="absolute -bottom-1 -right-1 p-1.5 bg-indigo-600 text-white rounded-lg shadow-lg hover:bg-indigo-500 transition-all z-10"
                >
                  <Smile size={14} />
                </button>

                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  accept="image/*" 
                  onChange={handleFileChange} 
                />

                {/* Icon Picker Popover */}
                <AnimatePresence>
                  {showIconPicker && (
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.9 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.9 }}
                      className={cn(
                        "absolute top-full left-0 mt-2 p-3 rounded-2xl border shadow-2xl z-20 grid grid-cols-3 gap-2 w-48",
                        isDarkMode ? "bg-zinc-700 border-zinc-600" : "bg-white border-zinc-200"
                      )}
                    >
                      {PRESET_ICONS.map((item) => {
                        const Icon = item.icon;
                        return (
                          <button
                            key={item.id}
                            onClick={() => {
                              setSelectedIcon(item.id);
                              setAvatarType('icon');
                              setShowIconPicker(false);
                            }}
                            className={cn(
                              "p-2 rounded-lg transition-colors",
                              selectedIcon === item.id ? "bg-indigo-500/10 text-indigo-500" : "hover:bg-zinc-700/10 text-zinc-500"
                            )}
                          >
                            <Icon size={20} />
                          </button>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="flex-1 space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-zinc-500">
                  {t('settings.voice.addModal.name')}
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('settings.voice.addModal.namePlaceholder')}
                  className={cn(
                    "w-full px-4 py-3 rounded-xl border outline-none transition-all",
                    isDarkMode 
                      ? "bg-zinc-700 border-zinc-600 text-zinc-200 focus:border-indigo-500/50" 
                      : "bg-zinc-50 border-zinc-200 text-zinc-900 focus:border-indigo-500/50"
                  )}
                />
              </div>
            </div>

            {/* Reference Text */}
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-zinc-500">
                {t('settings.voice.addModal.refText')}
              </label>
              <textarea
                value={refText}
                onChange={(e) => setRefText(e.target.value)}
                placeholder={t('settings.voice.addModal.refTextPlaceholder')}
                className={cn(
                  "w-full h-24 px-4 py-3 rounded-xl border outline-none transition-all resize-none",
                  isDarkMode 
                    ? "bg-zinc-700 border-zinc-600 text-zinc-200 focus:border-indigo-500/50" 
                    : "bg-zinc-50 border-zinc-200 text-zinc-900 focus:border-indigo-500/50"
                )}
              />
            </div>

            {/* Audio Track Management */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold uppercase tracking-widest text-zinc-500">
                  {t('settings.voice.addModal.audioTrack')}
                </label>
                <button 
                  onClick={handleAddTrack}
                  className="text-[10px] font-bold text-indigo-500 hover:text-indigo-400 flex items-center gap-1 uppercase tracking-wider"
                >
                  <Plus size={12} />
                  {t('settings.voice.addModal.addTrack')}
                </button>
              </div>
              <div className="space-y-2">
                {tracks.map((t) => (
                  <div 
                    key={t.id}
                    className={cn(
                      "flex items-center justify-between px-4 py-2 rounded-xl border",
                      isDarkMode ? "bg-zinc-700 border-zinc-600" : "bg-zinc-50 border-zinc-200"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <Music size={14} className="text-indigo-500" />
                      <span className={cn("text-sm", isDarkMode ? "text-zinc-300" : "text-zinc-600")}>{t.name}</span>
                    </div>
                    <button 
                      onClick={() => handleDeleteTrack(t.id)}
                      className="p-1.5 text-zinc-500 hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Sliders */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold uppercase tracking-widest text-zinc-500">
                    {t('settings.voice.addModal.pitch')}
                  </label>
                  <span className="text-xs font-mono text-indigo-500">{pitch.toFixed(1)}x</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="2.0"
                  step="0.1"
                  value={pitch}
                  onChange={(e) => setPitch(parseFloat(e.target.value))}
                  className="w-full accent-indigo-500"
                />
              </div>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold uppercase tracking-widest text-zinc-500">
                    {t('settings.voice.addModal.speed')}
                  </label>
                  <span className="text-xs font-mono text-indigo-500">{speed.toFixed(1)}x</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="2.0"
                  step="0.1"
                  value={speed}
                  onChange={(e) => setSpeed(parseFloat(e.target.value))}
                  className="w-full accent-indigo-500"
                />
              </div>
            </div>
          </div>

          <div className="p-6 border-t border-zinc-600/10 flex gap-3">
            <button
              onClick={onClose}
              className={cn(
                "flex-1 py-3 rounded-xl font-bold text-sm transition-all",
                isDarkMode ? "bg-zinc-700 text-zinc-300 hover:bg-zinc-600" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
              )}
            >
              {t('settings.voice.addModal.cancel')}
            </button>
            <button
              onClick={handleConfirm}
              disabled={!name.trim()}
              className={cn(
                "flex-1 py-3 rounded-xl font-bold text-sm transition-all shadow-lg",
                name.trim() 
                  ? "bg-indigo-600 text-white hover:bg-indigo-500 shadow-indigo-600/20" 
                  : isDarkMode ? "bg-zinc-700 text-zinc-500 cursor-not-allowed" : "bg-zinc-200 text-zinc-400 cursor-not-allowed"
              )}
            >
              {t('settings.voice.addModal.confirm')}
            </button>
          </div>
        </motion.div>
      </div>

      <AnimatePresence>
        {croppingImage && (
          <ImageCropper
            image={croppingImage}
            onCropComplete={handleCropComplete}
            onCancel={() => setCroppingImage(null)}
            isDarkMode={isDarkMode}
          />
        )}
      </AnimatePresence>
    </>
  );
};

export const VoiceSettings: React.FC<VoiceSettingsProps> = ({ isDarkMode }) => {
  const { t } = useTranslation();
  const [engine, setEngine] = useState(engines[0]);
  const [persona, setPersona] = useState('philosopher');
  const [smartEmotion, setSmartEmotion] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [testText, setTestText] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  
  // Engine Configs
  const [engineConfigs, setEngineConfigs] = useState<Record<string, EngineConfig>>({
    'Fish Speech': { path: '/models/fish-speech', backend: 'GPU', downloadUrl: 'https://github.com/fishaudio/fish-speech', isReady: false },
    'ChatTTS': { path: '/models/chat-tts', backend: 'CPU', downloadUrl: 'https://github.com/2noise/ChatTTS', isReady: true },
  });

  // Personas
  const [personas, setPersonas] = useState<Persona[]>([
    { id: 'philosopher', name: t('settings.voice.personas.philosopher'), icon: Brain },
    { id: 'assistant', name: t('settings.voice.personas.assistant'), icon: User },
    { id: 'friend', name: t('settings.voice.personas.friend'), icon: Sparkles },
  ]);

  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  const currentConfig = engineConfigs[engine];

  const handleAddPersona = (newPersona: Persona) => {
    setPersonas(prev => [...prev, newPersona]);
  };

  const handleCheckPath = () => {
    setIsDetecting(true);
    setTimeout(() => {
      setEngineConfigs(prev => ({
        ...prev,
        [engine]: { ...prev[engine], isReady: true }
      }));
      setIsDetecting(false);
    }, 2000);
  };

  const handleVoiceTest = () => {
    if (!testText.trim()) return;
    setIsTesting(true);
    setTimeout(() => {
      setIsTesting(false);
    }, 3000);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8 pb-12"
    >
      <AddPersonaModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onAdd={handleAddPersona}
        isDarkMode={isDarkMode} 
      />

      {/* Status Bar */}
      <div className={cn(
        "flex items-center justify-between px-4 py-2 rounded-xl border text-[10px] font-bold tracking-widest uppercase",
        isDarkMode ? "bg-zinc-700/80 border-zinc-600 text-zinc-400" : "bg-zinc-50 border-zinc-200 text-zinc-500"
      )}>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Activity size={12} className="text-indigo-500" />
            <span>{t('settings.voice.status.vram')}: <span className="text-indigo-400">2.4GB / 8GB</span></span>
          </div>
          <div className="flex items-center gap-2">
            <div className={cn(
              "w-1.5 h-1.5 rounded-full animate-pulse",
              currentConfig.isReady ? "bg-emerald-500" : "bg-red-500"
            )} />
            <span className={currentConfig.isReady ? "text-emerald-500" : "text-red-500"}>
              {currentConfig.isReady ? t('settings.voice.status.ready') : t('settings.voice.status.notReady')}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <NexusLogo size={12} />
          <span>Backend: {currentConfig.backend}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        {/* Engine Selection & Config */}
        <section className="flex flex-col space-y-4">
          <h4 className={cn("text-xs font-bold uppercase tracking-widest", isDarkMode ? "text-zinc-400" : "text-zinc-500")}>
            {t('settings.voice.engine')}
          </h4>
          <div className={cn(
            "p-5 border rounded-2xl space-y-6 flex-1",
            isDarkMode ? "bg-zinc-700/50 border-zinc-600/50" : "bg-zinc-50 border-zinc-200"
          )}>
            <div className="grid grid-cols-2 gap-2 bg-zinc-700/20 p-1 rounded-xl border border-zinc-600/10">
              {engines.map((e) => (
                <button
                  key={e}
                  onClick={() => setEngine(e)}
                  className={cn(
                    "py-2 text-sm font-medium rounded-lg transition-all",
                    engine === e 
                      ? "bg-indigo-600 text-white shadow-md" 
                      : isDarkMode 
                        ? "text-zinc-400 hover:text-zinc-200" 
                        : "text-zinc-500 hover:text-zinc-900"
                  )}
                >
                  {e}
                </button>
              ))}
            </div>

            {/* Detailed Config */}
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-bold uppercase text-zinc-500">{t('settings.voice.modelPath')}</label>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={handleCheckPath}
                      disabled={isDetecting}
                      className={cn(
                        "px-2 py-1 rounded-lg border font-bold text-[10px] transition-all flex items-center gap-1 uppercase tracking-wider",
                        isDarkMode 
                          ? "bg-zinc-700 border-zinc-600 text-zinc-400 hover:text-zinc-200 disabled:opacity-50" 
                          : "bg-zinc-100 border-zinc-200 text-zinc-500 hover:text-zinc-900 disabled:opacity-50"
                      )}
                    >
                      {isDetecting ? <Loader2 size={10} className="animate-spin" /> : <Zap size={10} />}
                      {isDetecting ? t('settings.voice.checking') : t('settings.voice.checkPath')}
                    </button>
                    <div className="flex items-center gap-1">
                      {currentConfig.isReady ? (
                        <CheckCircle2 size={12} className="text-emerald-500" />
                      ) : (
                        <XCircle size={12} className="text-red-500" />
                      )}
                    </div>
                  </div>
                </div>
                <div className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-xl border text-sm w-full",
                  isDarkMode ? "bg-zinc-700 border-zinc-600 text-zinc-300" : "bg-white border-zinc-200 text-zinc-600"
                )}>
                  <FolderOpen size={14} className="text-indigo-500" />
                  <input 
                    type="text"
                    value={currentConfig.path}
                    onChange={(e) => setEngineConfigs(prev => ({
                      ...prev,
                      [engine]: { ...prev[engine], path: e.target.value, isReady: false }
                    }))}
                    className="bg-transparent outline-none flex-1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase text-zinc-500">{t('settings.voice.backend')}</label>
                  <div className="flex gap-1 bg-zinc-700/20 p-1 rounded-xl border border-zinc-600/10">
                    {['GPU', 'CPU'].map((b) => (
                      <button
                        key={b}
                        onClick={() => setEngineConfigs(prev => ({
                          ...prev,
                          [engine]: { ...prev[engine], backend: b as 'GPU' | 'CPU' }
                        }))}
                        className={cn(
                          "flex-1 py-1.5 text-xs font-bold rounded-lg transition-all",
                          currentConfig.backend === b 
                            ? "bg-indigo-600/20 text-indigo-400 border border-indigo-500/30" 
                            : "text-zinc-500 hover:text-zinc-300"
                        )}
                      >
                        {b}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase text-zinc-500">{t('settings.voice.downloadLink')}</label>
                  <a 
                    href={currentConfig.downloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      "flex items-center justify-center gap-2 h-[34px] rounded-xl border text-xs font-bold transition-all",
                      isDarkMode ? "bg-zinc-700 border-zinc-600 text-zinc-300 hover:bg-zinc-600" : "bg-zinc-100 border-zinc-200 text-zinc-600 hover:bg-zinc-200"
                    )}
                  >
                    <ExternalLink size={14} />
                    GitHub
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Persona Gallery */}
        <section className="flex flex-col space-y-4">
          <div className="flex items-center justify-between">
            <h4 className={cn("text-xs font-bold uppercase tracking-widest", isDarkMode ? "text-zinc-400" : "text-zinc-500")}>
              {t('settings.voice.persona')}
            </h4>
            <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-tighter bg-indigo-500/10 px-2 py-0.5 rounded">
              {personas.length} Available
            </span>
          </div>
          <div className={cn(
            "p-5 border rounded-2xl flex-1 overflow-y-auto custom-scrollbar",
            isDarkMode ? "bg-zinc-700/50 border-zinc-600/50" : "bg-zinc-50 border-zinc-200"
          )}>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {personas.map((p) => {
                const Icon = p.icon;
                const isSelected = persona === p.id;
                return (
                  <div key={p.id} className="relative group">
                    <button
                      onClick={() => setPersona(p.id)}
                      className={cn(
                        "w-full flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all relative overflow-hidden transform-gpu",
                        isSelected 
                          ? "bg-indigo-500/10 border-indigo-500/50 text-indigo-500 dark:text-indigo-400 shadow-lg shadow-indigo-500/5" 
                          : isDarkMode
                            ? "bg-zinc-700 border-zinc-600 text-zinc-500 hover:border-zinc-600"
                            : "bg-white border-zinc-200 text-zinc-500 hover:border-zinc-300"
                      )}
                      style={{ transform: 'translateZ(0)' }}
                    >
                      <div className="w-8 h-8 flex items-center justify-center overflow-hidden rounded-lg">
                        {p.avatarUrl ? (
                          <img src={p.avatarUrl} alt={p.name} className="w-full h-full object-cover" />
                        ) : (
                          <Icon size={24} />
                        )}
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-wider">{p.name}</span>
                      {isSelected && (
                        <motion.div 
                          layoutId="active-persona"
                          className="absolute bottom-0 left-0 right-0 h-1 bg-indigo-500"
                        />
                      )}
                    </button>
                    
                    {/* Actions Menu */}
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMenu(activeMenu === p.id ? null : p.id);
                        }}
                        className={cn(
                          "p-1 rounded-lg transition-colors",
                          isDarkMode ? "hover:bg-zinc-700 text-zinc-500" : "hover:bg-zinc-200 text-zinc-400"
                        )}
                      >
                        <MoreVertical size={14} />
                      </button>
                    </div>

                    <AnimatePresence>
                      {activeMenu === p.id && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.9, y: -10 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.9, y: -10 }}
                          className={cn(
                            "absolute top-8 right-2 z-10 rounded-xl shadow-xl p-1 min-w-[80px]",
                            isDarkMode ? "bg-zinc-700 border border-zinc-600" : "bg-white border border-zinc-200"
                          )}
                        >
                          <button className={cn(
                            "w-full flex items-center gap-2 px-2 py-1.5 text-[10px] font-bold rounded-lg transition-colors",
                            isDarkMode ? "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700" : "text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100"
                          )}>
                            <Edit3 size={12} />
                            {t('settings.voice.actions.edit')}
                          </button>
                          <button className="w-full flex items-center gap-2 px-2 py-1.5 text-[10px] font-bold text-red-500/70 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors">
                            <Trash2 size={12} />
                            {t('settings.voice.actions.delete')}
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
              
              {/* Add Persona Button */}
              <button
                onClick={() => setIsModalOpen(true)}
                className={cn(
                  "flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border border-dashed transition-all",
                  isDarkMode 
                    ? "border-zinc-600 text-zinc-600 hover:border-zinc-600 hover:text-zinc-400 hover:bg-zinc-700/50" 
                    : "border-zinc-300 text-zinc-400 hover:border-zinc-400 hover:text-zinc-600 hover:bg-zinc-100"
                )}
              >
                <Plus size={24} />
                <span className="text-[10px] font-bold uppercase tracking-wider">{t('settings.voice.addPersona')}</span>
              </button>
            </div>
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Voice Test Section */}
        <section className="space-y-4">
          <h4 className={cn("text-xs font-bold uppercase tracking-widest", isDarkMode ? "text-zinc-400" : "text-zinc-500")}>
            {t('settings.voice.test.header')}
          </h4>
          <div className={cn(
            "p-4 border rounded-2xl space-y-3",
            isDarkMode ? "bg-zinc-700/50 border-zinc-600/50" : "bg-zinc-50 border-zinc-200"
          )}>
            <textarea 
              value={testText}
              onChange={(e) => setTestText(e.target.value)}
              placeholder={t('settings.voice.test.placeholder')}
              className={cn(
                "w-full h-24 px-4 py-3 rounded-xl border outline-none transition-all resize-none text-sm",
                isDarkMode 
                  ? "bg-zinc-700 border-zinc-600 text-zinc-200 focus:border-indigo-500/50" 
                  : "bg-white border-zinc-200 text-zinc-900 focus:border-indigo-500/50"
              )}
            />
            <div className="flex justify-end">
              <button
                onClick={handleVoiceTest}
                disabled={isTesting || !testText.trim()}
                className={cn(
                  "px-6 py-2.5 rounded-xl font-bold text-xs transition-all flex items-center gap-2 shadow-lg uppercase tracking-wider",
                  isTesting || !testText.trim()
                    ? isDarkMode ? "bg-zinc-700 text-zinc-600 cursor-not-allowed" : "bg-zinc-200 text-zinc-400 cursor-not-allowed"
                    : "bg-indigo-600 text-white hover:bg-indigo-500 shadow-indigo-600/20"
                )}
              >
                {isTesting ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    {t('settings.voice.test.testing')}
                  </>
                ) : (
                  <>
                    <Play size={14} fill="currentColor" />
                    {t('settings.voice.test.button')}
                  </>
                )}
              </button>
            </div>
          </div>
        </section>

        {/* Smart Emotion Toggle */}
        <section className="space-y-4">
          <h4 className={cn("text-xs font-bold uppercase tracking-widest", isDarkMode ? "text-zinc-400" : "text-zinc-500")}>
            {t('settings.voice.smartEmotion')}
          </h4>
          <div className={cn(
            "p-5 border rounded-2xl flex items-center justify-between",
            isDarkMode ? "bg-zinc-700/50 border-zinc-600/50" : "bg-zinc-50 border-zinc-200"
          )}>
            <div className="flex items-center gap-4">
              <div className={cn(
                "p-3 rounded-xl",
                smartEmotion ? "bg-amber-500/10 text-amber-500" : isDarkMode ? "bg-zinc-700 text-zinc-600" : "bg-white text-zinc-400"
              )}>
                <Zap size={20} />
              </div>
              <div>
                <p className={cn("text-sm font-medium", isDarkMode ? "text-zinc-200" : "text-zinc-900")}>
                  {t('settings.voice.smartEmotion')}
                </p>
                <p className={cn("text-xs", isDarkMode ? "text-zinc-400" : "text-zinc-500")}>
                  {t('settings.voice.smartEmotionDesc')}
                </p>
              </div>
            </div>
            <button
              onClick={() => setSmartEmotion(!smartEmotion)}
              className={cn(
                "w-12 h-6 rounded-full p-1 transition-all relative",
                smartEmotion ? "bg-indigo-600" : "bg-zinc-300 dark:bg-zinc-600"
              )}
            >
              <motion.div 
                className="w-4 h-4 bg-white rounded-full shadow-sm"
                animate={{ x: smartEmotion ? 24 : 0 }}
              />
            </button>
          </div>
        </section>
      </div>

      {/* Waveform Preview */}
      <section className="space-y-4">
        <h4 className={cn("text-xs font-bold uppercase tracking-widest", isDarkMode ? "text-zinc-400" : "text-zinc-500")}>
          {t('settings.voice.preview')}
        </h4>
        <div className={cn(
          "h-[74px] flex items-center justify-center gap-1.5 border rounded-2xl relative overflow-hidden",
          isDarkMode ? "bg-zinc-700/30 border-zinc-600/50" : "bg-zinc-50/50 border-zinc-200"
        )}>
          {[...Array(60)].map((_, i) => (
            <motion.div
              key={i}
              className="w-1 bg-indigo-500/40 rounded-full"
              animate={{ height: isTesting || smartEmotion ? [10, 50, 10] : 10 }}
              transition={{ 
                repeat: Infinity, 
                duration: 1 + Math.random(),
                delay: i * 0.02 
              }}
            />
          ))}
          <motion.div 
            animate={{ 
              opacity: (isTesting || smartEmotion) ? 0 : 1,
              scale: (isTesting || smartEmotion) ? 0.95 : 1
            }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
          >
            <div className="flex items-center gap-2 opacity-20">
              <Mic size={14} />
              <span className="text-[10px] font-bold tracking-widest uppercase">Live Preview</span>
            </div>
          </motion.div>
        </div>
      </section>
    </motion.div>
  );
};
