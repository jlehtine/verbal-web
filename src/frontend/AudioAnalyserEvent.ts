import { TypedEvent, TypedEventTarget } from "../shared/event";

export type AudioAnalyserEventTarget<O> = TypedEventTarget<O, AudioAnalyserEventMap<O>>;

export interface AudioAnalyserEventMap<O> {
    analyser: AudioAnalyserEvent<O>;
}

export interface AudioAnalyserEvent<O> extends TypedEvent<O, "analyser"> {
    timestamp: number;
    analyser: AnalyserNode;
    rms: number;
    silence: boolean;
}

export type AudioAnalyserEventFunc<O> = (event: AudioAnalyserEvent<O>) => void;
