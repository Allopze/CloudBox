import { create } from 'zustand';
import type { FileItem } from '../types';

interface MusicState {
  isPlaying: boolean;
  isMuted: boolean;
  shuffle: boolean;
  repeat: 'none' | 'one' | 'all';
  currentTrack: FileItem | null;
  queue: FileItem[];
  currentIndex: number;
  volume: number;
  progress: number;
  duration: number;

  play: (track: FileItem, queue?: FileItem[]) => void;
  pause: () => void;
  resume: () => void;
  next: () => void;
  previous: () => void;
  setVolume: (volume: number) => void;
  setProgress: (progress: number) => void;
  setDuration: (duration: number) => void;
  addToQueue: (track: FileItem) => void;
  clearQueue: () => void;
  setCurrentTrack: (track: FileItem | null) => void;
  setIsPlaying: (playing: boolean) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
  setQueue: (queue: FileItem[]) => void;
  playNext: () => void;
  playPrevious: () => void;
}

export const useMusicStore = create<MusicState>((set, get) => ({
  isPlaying: false,
  isMuted: false,
  shuffle: false,
  repeat: 'none',
  currentTrack: null,
  queue: [],
  currentIndex: -1,
  volume: 1,
  progress: 0,
  duration: 0,

  play: (track, queue) => {
    const newQueue = queue || [track];
    const index = newQueue.findIndex((t) => t.id === track.id);
    
    set({
      currentTrack: track,
      queue: newQueue,
      currentIndex: index >= 0 ? index : 0,
      isPlaying: true,
      progress: 0,
    });
  },

  pause: () => {
    set({ isPlaying: false });
  },

  resume: () => {
    set({ isPlaying: true });
  },

  next: () => {
    const { queue, currentIndex, shuffle, repeat } = get();
    if (shuffle) {
      const randomIndex = Math.floor(Math.random() * queue.length);
      const nextTrack = queue[randomIndex];
      set({
        currentTrack: nextTrack,
        currentIndex: randomIndex,
        progress: 0,
      });
    } else if (currentIndex < queue.length - 1) {
      const nextTrack = queue[currentIndex + 1];
      set({
        currentTrack: nextTrack,
        currentIndex: currentIndex + 1,
        progress: 0,
      });
    } else if (repeat === 'all') {
      const nextTrack = queue[0];
      set({
        currentTrack: nextTrack,
        currentIndex: 0,
        progress: 0,
      });
    }
  },

  previous: () => {
    const { queue, currentIndex, progress } = get();
    
    // If more than 3 seconds in, restart the track
    if (progress > 3) {
      set({ progress: 0 });
      return;
    }

    if (currentIndex > 0) {
      const prevTrack = queue[currentIndex - 1];
      set({
        currentTrack: prevTrack,
        currentIndex: currentIndex - 1,
        progress: 0,
      });
    }
  },

  setVolume: (volume) => {
    set({ volume });
  },

  setProgress: (progress) => {
    set({ progress });
  },

  setDuration: (duration) => {
    set({ duration });
  },

  addToQueue: (track) => {
    set((state) => ({
      queue: [...state.queue, track],
    }));
  },

  clearQueue: () => {
    set({
      queue: [],
      currentTrack: null,
      currentIndex: -1,
      isPlaying: false,
      progress: 0,
    });
  },

  setCurrentTrack: (track) => {
    set({ currentTrack: track });
  },

  setIsPlaying: (playing) => {
    set({ isPlaying: playing });
  },

  toggleMute: () => {
    set((state) => ({ isMuted: !state.isMuted }));
  },

  toggleShuffle: () => {
    set((state) => ({ shuffle: !state.shuffle }));
  },

  toggleRepeat: () => {
    set((state) => {
      const modes: ('none' | 'one' | 'all')[] = ['none', 'one', 'all'];
      const currentIdx = modes.indexOf(state.repeat);
      return { repeat: modes[(currentIdx + 1) % 3] };
    });
  },

  setQueue: (queue) => {
    set({ queue });
  },

  playNext: () => {
    get().next();
  },

  playPrevious: () => {
    get().previous();
  },
}));
