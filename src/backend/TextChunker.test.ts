import { TextChunkerResult, TextChunk, TextChunker, TextChunkerParams } from "./TextChunker";
import { test, expect } from "@jest/globals";
import { LoremIpsum } from "lorem-ipsum";

const CHUNKER_MAX_ROUNDS = 100;

const lorem = new LoremIpsum();
const input = lorem.generateParagraphs(10).replace(/h/gi, "😊").replace(/m/gi, "🍄‍🟫").replace(/t/gi, "🧑‍💻");

const nonOverlappingChunksParams: TextChunkerParams = {
    minChunkSize: 100,
    maxChunkSize: 200,
    minChunkOverlap: 0,
    maxChunkOverlap: 0,
};

const overlappingChunksParams: TextChunkerParams = {
    minChunkSize: 100,
    maxChunkSize: 200,
    minChunkOverlap: 10,
    maxChunkOverlap: 20,
};

test("chunk immediate input to non-overlapping chunks", () => {
    runChunkerRounds(nonOverlappingChunksParams, input, nonOverlappingCheck);
});

test("chunk immediate input to overlapping chunks", () => {
    runChunkerRounds(overlappingChunksParams, input);
});

test("chunk flowing input to non-overlapping chunks", () => {
    runChunkerRounds(nonOverlappingChunksParams, undefined, nonOverlappingCheck, randomUpdateInputFunc(input, 20));
});

test("chunk flowing input to overlapping chunks", () => {
    runChunkerRounds(overlappingChunksParams, undefined, undefined, randomUpdateInputFunc(input, 20));
});

function randomUpdateInputFunc(input: string, maxAppend: number) {
    let buffered = 0;
    return () => {
        let finish;
        let append;
        const appendNum = Math.ceil(Math.random() * maxAppend);
        if (appendNum > 0 && buffered < input.length) {
            const appendEnd = Math.max(buffered + appendNum, input.length);
            append = input.slice(buffered, appendEnd);
            buffered = appendEnd;
        }
        if (buffered >= input.length) {
            finish = true;
        }
        return { finish: finish, append: append };
    };
}

function runChunkerRounds(
    params: TextChunkerParams,
    input?: string,
    checkChunk?: (result: TextChunkerResult, prevChunk?: TextChunk, prevResult?: TextChunkerResult) => void,
    updateInput?: () => { finish?: boolean; append?: string },
): TextChunkerResult | undefined {
    const chunker = new TextChunker(params, input);
    let text = input ?? "";
    let finished = input !== undefined;
    let prevResult;
    let prevChunk;
    for (let round = 0; !prevResult?.done && round < CHUNKER_MAX_ROUNDS; round++) {
        const result = chunker.chunk();
        checkGeneric(params, text, finished, result, prevResult?.value);
        if (checkChunk) {
            checkChunk(result, prevChunk, prevResult);
        }
        prevResult = result;
        if (result.value !== undefined) {
            prevChunk = result.value;
        }
        if (updateInput) {
            const update = updateInput();
            if (update.append !== undefined) {
                chunker.append(update.append);
                text += update.append;
            }
            if (update.finish) {
                chunker.finish();
                finished = true;
            }
        }
    }
    expect(prevResult?.done).toBe(true);
    expect(prevChunk?.end ?? 0).toStrictEqual(text.length);
    return prevResult;
}

/**
 * Generic checks for chunkers.
 *
 * @param params chunker parameters
 * @param text supplied input
 * @param finished whether input is finished
 * @param result chunker result
 * @param prevChunk previous chunk, if any
 */
function checkGeneric(
    params: TextChunkerParams,
    text: string,
    finished = true,
    result: { done: boolean; value?: TextChunk },
    prevChunk: TextChunk | undefined,
) {
    const prevChunkEnd = prevChunk?.end ?? 0;

    // End of input was reached on previous chunk
    if (finished && prevChunk?.end === text.length) {
        expect(result.done).toBe(true);
        expect(result.value).toBeUndefined();
    }

    // Otherwise some input is remaining or pending
    else {
        expect(result.done).toBe(false);

        // If input is finished or there is enough buffered input then we expect a chunk
        if (finished || text.length - prevChunkEnd - 2 >= params.minChunkSize) {
            expect(result.value).toBeDefined();
        }

        // Check the resulting chunk
        if (result.value) {
            const chunk = result.value;

            // Chunk must be within the input
            expect(chunk.start).toBeGreaterThanOrEqual(0);
            expect(chunk.start).toBeLessThan(text.length);
            expect(chunk.end).toBeGreaterThan(chunk.start);
            expect(chunk.end).toBeLessThanOrEqual(text.length);

            // Chunk must be connected to or overlapping with the previous chunk
            expect(chunk.start).toBeLessThanOrEqual(prevChunkEnd);
            expect(chunk.end).toBeGreaterThan(prevChunkEnd);

            // Chunk must respect the strictly limiting chunker parameters
            expect(chunk.end - chunk.start).toBeLessThanOrEqual(params.maxChunkSize);
            expect(prevChunkEnd - chunk.start).toBeLessThanOrEqual(params.maxChunkOverlap);
        }
    }
}

function nonOverlappingCheck(result: TextChunkerResult, prevChunk?: TextChunk) {
    if (result.value !== undefined) {
        expect(result.value.start).toStrictEqual(prevChunk?.end ?? 0);
    }
}
