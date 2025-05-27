import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, Play, Pause, Volume2, Music } from 'lucide-react';

interface BeatInfo {
  time: number;
  energy: number;
  isStrongBeat: boolean;
  isRegularBeat: boolean;
}

export const AudioPlayer = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(50);
  const [beats, setBeats] = useState<BeatInfo[]>([]);
  const [currentBeatIndex, setCurrentBeatIndex] = useState(-1);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);

  const audioRef = useRef<HTMLAudioElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const animationFrameRef = useRef<number>();

  // Инициализация аудио контекста
  const initializeAudioContext = useCallback(async () => {
    if (!audioRef.current || audioContextRef.current) return;

    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioContext();
      
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      audioContextRef.current = audioContext;
    } catch (error) {
      console.error('Ошибка инициализации аудио контекста:', error);
    }
  }, []);

  const analyzeBeats = useCallback(async (audioBuffer: ArrayBuffer) => {
    if (!audioContextRef.current) return;

    setIsAnalyzing(true);
    setAnalysisProgress(0);

    try {
      const audioData = await audioContextRef.current.decodeAudioData(audioBuffer);
      const channelData = audioData.getChannelData(0);
      const sampleRate = audioData.sampleRate;
      const windowSize = 2048;
      const hopSize = 512;
      const detectedBeats: BeatInfo[] = [];

      // Анализ энергии в окнах
      const totalWindows = Math.floor((channelData.length - windowSize) / hopSize);
      
      for (let i = 0; i < channelData.length - windowSize; i += hopSize) {
        const windowData = channelData.slice(i, i + windowSize);
        
        // Вычисляем энергию и спектральный центроид
        let energy = 0;
        let spectralEnergy = 0;
        
        for (let j = 0; j < windowSize; j++) {
          const sample = windowData[j];
          energy += sample * sample;
          
          // Дополнительно учитываем высокочастотную энергию для лучшего определения ударных
          if (j > windowSize / 4) {
            spectralEnergy += sample * sample;
          }
        }
        
        energy = energy / windowSize;
        spectralEnergy = spectralEnergy / (windowSize * 0.75);
        
        const time = i / sampleRate;
        const combinedEnergy = energy + spectralEnergy * 0.3;

        detectedBeats.push({
          time,
          energy: combinedEnergy,
          isStrongBeat: false,
          isRegularBeat: false
        });

        // Обновляем прогресс
        const progress = Math.floor((i / (channelData.length - windowSize)) * 50);
        setAnalysisProgress(progress);
      }

      setAnalysisProgress(60);

      // Определение сильных и обычных долей
      const energies = detectedBeats.map(beat => beat.energy);
      const maxEnergy = Math.max(...energies);
      const avgEnergy = energies.reduce((sum, e) => sum + e, 0) / energies.length;
      const stdDev = Math.sqrt(energies.reduce((sum, e) => sum + Math.pow(e - avgEnergy, 2), 0) / energies.length);
      
    
      const strongThreshold = avgEnergy + stdDev * 1.2;
      const regularThreshold = avgEnergy + stdDev * 0.6;
      const minTimeBetweenBeats = 0.08; 

      let lastBeatTime = -minTimeBetweenBeats;

      for (let i = 2; i < detectedBeats.length - 2; i++) {
        const current = detectedBeats[i];
        const prev1 = detectedBeats[i - 1];
        const prev2 = detectedBeats[i - 2];
        const next1 = detectedBeats[i + 1];
        const next2 = detectedBeats[i + 2];

        // Проверяем, является ли текущая точка локальным максимумом
        const isLocalMax = current.energy > prev1.energy && 
                          current.energy > prev2.energy && 
                          current.energy > next1.energy && 
                          current.energy > next2.energy;

        if (isLocalMax && current.time - lastBeatTime >= minTimeBetweenBeats) {
          if (current.energy >= strongThreshold) {
            current.isStrongBeat = true;
            lastBeatTime = current.time;
          } else if (current.energy >= regularThreshold) {
            current.isRegularBeat = true;
            lastBeatTime = current.time;
          }
        }
      }

      setAnalysisProgress(100);
      setBeats(detectedBeats);
      

      
    } catch (error) {
      console.error('Ошибка анализа аудио:', error);
    } finally {
      setTimeout(() => {
        setIsAnalyzing(false);
        setAnalysisProgress(0);
      }, 500);
    }
  }, []);

  // Обработка загрузки файла
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setAudioFile(file);
    setBeats([]);
    setCurrentBeatIndex(-1);
    
    if (audioRef.current) {
      const url = URL.createObjectURL(file);
      audioRef.current.src = url;
      
      await initializeAudioContext();
      const arrayBuffer = await file.arrayBuffer();
      await analyzeBeats(arrayBuffer);
    }
  };

  // Воспроизведение/пауза
  const togglePlayPause = async () => {
    if (!audioRef.current || !audioFile) return;

    if (!audioContextRef.current) {
      await initializeAudioContext();
    }

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      await audioRef.current.play();
    }
  };

  // Обновление текущего времени
  const updateCurrentTime = useCallback(() => {
    if (audioRef.current && isPlaying) {
      const current = audioRef.current.currentTime;
      setCurrentTime(current);
      
      // Находим текущую долю среди всех долей (и сильных, и обычных)
      const allBeats = beats.filter(beat => beat.isStrongBeat || beat.isRegularBeat);
      let activeBeatIndex = -1;
      
      for (let i = allBeats.length - 1; i >= 0; i--) {
        if (allBeats[i].time <= current + 0.1) { // Небольшая задержка для синхронизации
          activeBeatIndex = i;
          break;
        }
      }
      
      setCurrentBeatIndex(activeBeatIndex);
    }
  }, [isPlaying, beats]);

  // Анимационный цикл
  useEffect(() => {
    if (isPlaying) {
      const animate = () => {
        updateCurrentTime();
        animationFrameRef.current = requestAnimationFrame(animate);
      };
      animate();
    } else {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying, updateCurrentTime]);

  // Обработчики событий аудио
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => setDuration(audio.duration);
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      setCurrentBeatIndex(-1);
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
    };
  }, []);

  // Обновление громкости
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume / 100;
    }
  }, [volume]);

  // Перемотка
  const handleSeek = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(event.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = value;
      setCurrentTime(value);
    }
  };

  // Форматирование времени
  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // Статистика долей
  const strongBeats = beats.filter(beat => beat.isStrongBeat);
  const regularBeats = beats.filter(beat => beat.isRegularBeat);
  const allBeats = beats.filter(beat => beat.isStrongBeat || beat.isRegularBeat);
  const currentBeat = currentBeatIndex >= 0 && currentBeatIndex < allBeats.length ? allBeats[currentBeatIndex] : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-100 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
          {/* Заголовок */}
          <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-8 text-center">
            <h1 className="text-3xl font-bold mb-2 flex items-center justify-center gap-3">
              <Music className="w-8 h-8" />
              Детектор сильных долей
            </h1>
            <p className="text-purple-100">Анализ и визуализация ритмической структуры музыки</p>
          </div>

          <div className="p-8 space-y-8">
            {/* Загрузка файла */}
            <div className="border-2 border-dashed border-gray-300 rounded-2xl p-8 text-center hover:border-purple-400 transition-colors">
              <div className="space-y-4">
                <div className="text-6xl">🎵</div>
                <div>
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      accept="audio/*"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    <div className="inline-flex items-center gap-3 bg-purple-600 text-white px-6 py-3 rounded-xl hover:bg-purple-700 transition-colors">
                      <Upload className="w-5 h-5" />
                      Выберите аудиофайл
                    </div>
                  </label>
                </div>
                <p className="text-gray-500 text-sm">Поддерживаются форматы: MP3, WAV, OGG, M4A</p>
              </div>
              
              {audioFile && (
                <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-xl">
                  <p className="text-green-800 font-medium">✓ {audioFile.name}</p>
                  <p className="text-green-600 text-sm">{(audioFile.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
              )}
            </div>

            {/* Анализ */}
            {isAnalyzing && (
              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6">
                <div className="text-center space-y-4">
                  <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto"></div>
                  <div className="space-y-2">
                    <p className="text-blue-800 font-medium">🔍 Анализируем аудио...</p>
                    <div className="w-full bg-blue-200 rounded-full h-2">
                      <div 
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${analysisProgress}%` }}
                      ></div>
                    </div>
                    <p className="text-blue-600 text-sm">{analysisProgress}% завершено</p>
                  </div>
                </div>
              </div>
            )}

            {/* Управление воспроизведением */}
            {audioFile && !isAnalyzing && (
              <div className="space-y-6">
                {/* Основные элементы управления */}
                <div className="bg-gray-50 rounded-2xl p-6">
                  <div className="flex items-center justify-center gap-8">
                    <button
                      onClick={togglePlayPause}
                      className={`w-16 h-16 rounded-full flex items-center justify-center text-white transition-all ${
                        isPlaying 
                          ? 'bg-red-500 hover:bg-red-600 shadow-lg shadow-red-200' 
                          : 'bg-green-500 hover:bg-green-600 shadow-lg shadow-green-200'
                      }`}
                    >
                      {isPlaying ? <Pause className="w-8 h-8" /> : <Play className="w-8 h-8 ml-1" />}
                    </button>
                    
                    <div className="flex items-center gap-4 text-xl font-mono">
                      <span className="bg-white px-4 py-2 rounded-lg border">
                        {formatTime(currentTime)}
                      </span>
                      <span className="text-gray-400">/</span>
                      <span className="bg-white px-4 py-2 rounded-lg border">
                        {formatTime(duration)}
                      </span>
                    </div>
                  </div>

                  {/* Временная шкала */}
                  <div className="mt-6 space-y-2">
                    <input
                      type="range"
                      min={0}
                      max={duration || 0}
                      value={currentTime}
                      onChange={handleSeek}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                    />
                    <div className="flex justify-between text-sm text-gray-500">
                      <span>0:00</span>
                      <span>{((currentTime / duration) * 100 || 0).toFixed(1)}%</span>
                      <span>{formatTime(duration)}</span>
                    </div>
                  </div>
                </div>

                {/* Громкость */}
                <div className="bg-gray-50 rounded-2xl p-6">
                  <div className="flex items-center gap-4">
                    <Volume2 className="w-6 h-6 text-gray-600" />
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={volume}
                      onChange={(e) => setVolume(Number(e.target.value))}
                      className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                    />
                    <span className="font-mono text-lg w-12 text-right">{volume}%</span>
                  </div>
                </div>
              </div>
            )}

            {/* Визуализация долей */}
            {beats.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-2xl p-6">
                <div className="space-y-6">
                  {/* Статистика */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="text-center p-4 bg-red-50 rounded-xl border border-red-200">
                      <div className="text-2xl font-bold text-red-600">{strongBeats.length}</div>
                      <div className="text-red-800 text-sm">Сильные доли</div>
                    </div>
                    <div className="text-center p-4 bg-blue-50 rounded-xl border border-blue-200">
                      <div className="text-2xl font-bold text-blue-600">{regularBeats.length}</div>
                      <div className="text-blue-800 text-sm">Обычные доли</div>
                    </div>
                    <div className="text-center p-4 bg-purple-50 rounded-xl border border-purple-200">
                      <div className="text-2xl font-bold text-purple-600">{allBeats.length}</div>
                      <div className="text-purple-800 text-sm">Всего долей</div>
                    </div>
                    <div className="text-center p-4 bg-yellow-50 rounded-xl border border-yellow-200">
                      <div className="text-2xl font-bold text-yellow-600">
                        {currentBeat ? (currentBeat.isStrongBeat ? 'СИЛЬНАЯ' : 'ОБЫЧНАЯ') : '—'}
                      </div>
                      <div className="text-yellow-800 text-sm">Текущая доля</div>
                    </div>
                  </div>

                  {/* Визуализация */}
                  {allBeats.length > 0 ? (
                    <div className="bg-gradient-to-t from-gray-100 to-white border-2 border-gray-200 rounded-xl p-4 overflow-hidden">
                      <div className="h-40 flex items-end gap-1 overflow-x-auto pb-2">
                        {allBeats.map((beat, index) => {
                          const height = Math.max(Math.min(beat.energy * 800, 100), 15);
                          const isActive = index === currentBeatIndex;
                          const isStrong = beat.isStrongBeat;
                          
                          return (
                            <div
                              key={index}
                              className={`relative transition-all duration-300 ${
                                isActive 
                                  ? 'transform scale-x-150 shadow-lg bg-gradient-to-t from-yellow-500 to-yellow-300' 
                                  : 'hover:scale-110'
                              }`}
                              style={{ 
                                height: `${height}%`,
                                minWidth: '10px',
                                width: '6px'
                              }}
                              title={`${beat.time.toFixed(2)}с - ${isStrong ? 'Сильная' : 'Обычная'} доля`}
                            >
                              <div 
                                className={`w-full h-full rounded-t-sm ${
                                  isActive
                                    ? isStrong 
                                      ? 'bg-gradient-to-t from-red-600 to-red-400 shadow-red-400' 
                                      : 'bg-gradient-to-t from-blue-600 to-blue-400 shadow-blue-400'
                                    : isStrong
                                      ? 'bg-gradient-to-t from-red-500 to-red-300 hover:from-red-600 hover:to-red-400'
                                      : 'bg-gradient-to-t from-blue-400 to-blue-200 hover:from-blue-500 hover:to-blue-300'
                                } ${isActive ? 'animate-pulse' : ''}`}
                              />
                            </div>
                          );
                        })}
                      </div>
                      
                      {/* Легенда */}
                      <div className="flex justify-center gap-6 mt-4 text-sm">
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 bg-gradient-to-t from-red-500 to-red-300 rounded"></div>
                          <span className="text-gray-700">Сильные доли</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 bg-gradient-to-t from-blue-400 to-blue-200 rounded"></div>
                          <span className="text-gray-700">Обычные доли</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 bg-gradient-to-t from-yellow-500 to-yellow-300 rounded animate-pulse"></div>
                          <span className="text-gray-700">Текущая доля</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center p-8 text-gray-500">
                      <p>Доли не обнаружены. Попробуйте другой аудиофайл с более выраженным ритмом.</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Скрытый аудио элемент */}
        <audio
          ref={audioRef}
          preload="metadata"
          crossOrigin="anonymous"
          className="hidden"
        />
      </div>

      <style>{`
        .slider::-webkit-slider-thumb {
          appearance: none;
          height: 20px;
          width: 20px;
          border-radius: 50%;
          background: #8b5cf6;
          cursor: pointer;
          box-shadow: 0 2px 6px rgba(139, 92, 246, 0.3);
        }
        .slider::-moz-range-thumb {
          height: 20px;
          width: 20px;
          border-radius: 50%;
          background: #8b5cf6;
          cursor: pointer;
          border: none;
          box-shadow: 0 2px 6px rgba(139, 92, 246, 0.3);
        }
      `}</style>
    </div>
  );
};