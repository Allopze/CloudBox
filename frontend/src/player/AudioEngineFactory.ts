import { IAudioEngine } from './AudioEngine';
import { HtmlAudioEngine } from './HtmlAudioEngine';

export function pickEngine(_fileName: string): IAudioEngine {
    return new HtmlAudioEngine();
}
