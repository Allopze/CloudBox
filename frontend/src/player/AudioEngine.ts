/**
 * Interface that all audio engines must implement.
 * This abstracts away the differences between standard HTML5 Audio
 * and custom renderers like the MIDI engine.
 */
export interface IAudioEngine {
    /**
     * Load a source URL.
     * @param url The authenticated URL to play (or blob URL)
     * @param fileId Optional file ID for caching/logging purposes
     */
    load(url: string, fileId?: string): Promise<void>;

    /**
     * Start playback.
     */
    play(): Promise<void>;

    /**
     * Pause playback.
     */
    pause(): void;

    /**
     * Seek to a specific time in seconds.
     */
    seek(time: number): void;

    /**
     * Set volume (0.0 to 1.0).
     */
    setVolume(volume: number): void;

    /**
     * Get current playback time in seconds.
     */
    readonly currentTime: number;

    /**
     * Get total duration in seconds.
     */
    readonly duration: number;

    /**
     * Subscribe to an event.
     */
    on(event: AudioEngineEvent, callback: (...args: any[]) => void): void;

    /**
     * Unsubscribe from an event.
     */
    off(event: AudioEngineEvent, callback: (...args: any[]) => void): void;

    /**
     * Cleanup resources.
     */
    destroy(): void;
}

export type AudioEngineEvent =
    | 'timeupdate'
    | 'ended'
    | 'error'
    | 'loadedmetadata'
    | 'play'
    | 'pause'
    | 'waiting'
    | 'canplay';
