class VerbalWebAudioInput extends AudioWorkletProcessor {
    process(inputs: Float32Array[][]) {
        // Check if no more data available
        if (inputs[0].length === 0) {
            return false;
        }

        // Post data to main thread
        this.port.postMessage({
            sampleRate: sampleRate,
            inputs: [...inputs.map((input) => [...input.map((channel) => channel.slice())])],
        });

        // Continue while data available
        return true;
    }
}

registerProcessor("VerbalWebAudioInput", VerbalWebAudioInput);
