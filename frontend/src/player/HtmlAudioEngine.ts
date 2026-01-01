import { IAudioEngine, AudioEngineEvent } from './AudioEngine';

export class HtmlAudioEngine implements IAudioEngine {
    private audio: HTMLAudioElement;
    private listeners: Map<AudioEngineEvent, Set<(...args: any[]) => void>> = new Map();

    constructor() {
        this.audio = new Audio();
        this.attachListeners();
    }

    private attachListeners() {
        const eventMap: Record<AudioEngineEvent, string> = {
            'timeupdate': 'timeupdate',
            'ended': 'ended',
            'error': 'error',
            'loadedmetadata': 'loadedmetadata',
            'play': 'play',
            'pause': 'pause',
            'waiting': 'waiting',
            'canplay': 'canplay'
        };

        Object.entries(eventMap).forEach(([engineEvent, domEvent]) => {
            this.audio.addEventListener(domEvent, (e) => this.emit(engineEvent as AudioEngineEvent, e));
        });
    }

    load(url: string): Promise<void> {
        return new Promise((resolve, reject) => {
            // Small reset
            this.audio.pause();
            this.audio.currentTime = 0;

            const onCanPlay = () => {
                this.audio.removeEventListener('canplay', onCanPlay);
                this.audio.removeEventListener('error', onError);
                resolve();
            };

            const onError = (_e: Event) => {
                this.audio.removeEventListener('canplay', onCanPlay);
                this.audio.removeEventListener('error', onError);
                reject(new Error('Failed to load audio source'));
            };

            this.audio.addEventListener('canplay', onCanPlay);
            this.audio.addEventListener('error', onError);

            this.audio.src = url;
            this.audio.load();
        });
    }

    async play(): Promise<void> {
        return this.audio.play();
    }

    pause(): void {
        this.audio.pause();
    }

    seek(time: number): void {
        if (isFinite(time)) {
            this.audio.currentTime = time;
        }
    }

    setVolume(volume: number): void {
        this.audio.volume = Math.max(0, Math.min(1, volume));
    }

    get currentTime(): number {
        return this.audio.currentTime;
    }

    get duration(): number {
        return this.audio.duration;
    }

    on(event: AudioEngineEvent, callback: (...args: any[]) => void): void {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event)!.add(callback);
    }

    off(event: AudioEngineEvent, callback: (...args: any[]) => void): void {
        const callbacks = this.listeners.get(event);
        if (callbacks) {
            callbacks.delete(callback);
        }
    }

    private emit(event: AudioEngineEvent, ...args: any[]): void {
        const callbacks = this.listeners.get(event);
        if (callbacks) {
            callbacks.forEach(cb => cb(...args));
        }
    }

    destroy(): void {
        this.audio.pause();
        this.audio.src = '';
        this.listeners.clear();
        // Remove DOM listeners? They are attached to the element we just created and abandoned, 
        // garbage collection should handle it, but typically good practice to remove if we kept refs.
        // For now simplistic approach is fine as we don't reuse the element.
    }
}
