// Utility functions for splitting text into chunks on word or grapheme boundaries
import { IteratorCloner } from "./IteratorCloner";
import Graphemer from "graphemer";

const graphemer = new Graphemer();

const realpha = /^\p{Alphabetic}/u;

type GraphemeIterable = Iterable<string>;

/**
 * Chunking parameters for a text chunker.
 */
export interface TextChunkerParams {
    /** Maximum chunk size in characters */
    readonly maxChunkSize: number;

    /** Minimum chunk size in characters (soft limit) */
    readonly minChunkSize: number;

    /** Maximum chunk overlap for consequent chunks in characters */
    readonly maxChunkOverlap: number;

    /** Minimum chunk overlap for consequent chunks in characters (soft limit) */
    readonly minChunkOverlap: number;
}

export type TextChunkerResult =
    | {
          done: true;
          value: undefined;
      }
    | {
          done: false;
          value: TextChunk | undefined;
      };

/**
 * Text chunk position within a string as code unit indexes.
 * The end index is exclusive.
 */
export interface TextChunk {
    start: number;
    end: number;
}

/**
 * Splits text into chunks of specified length and having a specified
 * amount over overlap between adjacent chunks.
 */
export class TextChunker {
    private readonly params;
    private text;
    private finished = false;
    private chunked = 0;

    /**
     * Constructs a new instance.
     * If text is specified then no more input is expected.
     * If text is not specified then additional text may be appended
     * to the chunker using append() and finally finish()
     * must be called to mark the end of input.
     *
     * @param params parameters for chunking
     * @param text text to be chunked
     */
    constructor(params: TextChunkerParams, text?: string) {
        this.params = params;
        this.text = text ?? "";
        if (text !== undefined) {
            this.finished = true;
        }
    }

    /**
     * Appends new text to chunker.
     *
     * @param text text
     */
    append(text: string) {
        if (this.finished) {
            throw new Error("Input already finished");
        }
        this.text += text;
    }

    /**
     * Marks the end of input.
     */
    finish() {
        this.finished = true;
    }

    /**
     * Returns the next chunk and whether chunking is completed.
     * It is also possible that no chunk is returned if not enough
     * new data is available.
     *
     * @returns an object with two properties:
     *      done - whether all chunks processed,
     *      value - the next chunk or undefined if no chunk currently available
     */
    chunk(): TextChunkerResult {
        // Check if all text chunked
        if (this.finished && this.chunked >= this.text.length) {
            return { done: true, value: undefined };
        }

        // Determine the next chunk, if any available at this time
        else {
            const giter = new IteratorCloner(graphemer.iterateGraphemes(this.text));
            const start = boundaryIndexLeftOf(
                giter,
                Math.max(this.chunked - this.params.minChunkOverlap, 0),
                Math.max(this.chunked - this.params.maxChunkOverlap, 0),
            );
            let end;

            // Check if rest of the input can be included in one chunk
            if (this.finished && this.text.length - start <= this.params.maxChunkSize) {
                end = this.text.length;
            }

            // Otherwise determine the next chunk
            else {
                end = boundaryIndexLeftOf(giter, start + this.params.maxChunkSize, start + this.params.minChunkSize);
            }

            // Check if finished or enough new content available
            if (this.finished || end - start >= this.params.minChunkSize) {
                this.chunked = end;
                return { done: false, value: { start: start, end: end } };
            }

            // Otherwise wait for new content
            else {
                return { done: false, value: undefined };
            }
        }
    }
}

/**
 * Returns the boundary index left of the specified index within the specified
 * offset range.
 *
 * @param graphemes graphemes
 * @param index starting index
 * @param minIndex minimum index
 * @returns boundary index
 */
function boundaryIndexLeftOf(giter: GraphemeIterable, index: number, minIndex: number) {
    let bi = lastBoundaryIndex(giter, index);
    if (bi < minIndex) {
        bi = graphemeIndexAtOrAfter(giter, minIndex);
    }
    return bi;
}

/**
 * Returns the index of the last word boundary in the specified string segment.
 *
 * @param graphemes graphemes
 * @param end end index of the string segment
 * @returns index of the last alphabetic boundary in the specified string segment
 */
function lastBoundaryIndex(giter: GraphemeIterable, end: number) {
    let gind = 0;
    let lastalpha = false;
    let lastb = 0;
    for (const g of giter) {
        // Check if alphabetic boundary found
        const alpha = g.match(realpha) !== null;
        if (alpha && !lastalpha) {
            lastb = gind;
        }
        lastalpha = alpha;

        // Jump to next grapheme index
        const nextgind = gind + g.length;
        if (nextgind <= end) {
            gind = nextgind;
        } else {
            break;
        }
    }
    return lastb;
}

/**
 * Returns the next grapheme index at or after the target index.
 *
 * @param str string
 * @param index target index
 * @returns next grapheme index at or after the target index
 */
function graphemeIndexAtOrAfter(giter: GraphemeIterable, index: number) {
    let gind = 0;
    for (const g of giter) {
        const nextgind = gind + g.length;
        if (nextgind <= index) {
            gind = nextgind;
        } else {
            break;
        }
    }
    return gind;
}

/**
 * Chunks text.
 *
 * @param params chunking parameters
 * @param text input text
 * @returns text chunks
 */
export function chunkText(params: TextChunkerParams, text: string): string[] {
    const chunker = new TextChunker(params, text);
    const chunks: string[] = [];
    let result;
    do {
        result = chunker.chunk();
        const v = result.value;
        if (v !== undefined) {
            chunks.push(text.slice(v.start, v.end));
        }
    } while (!result.done);
    return chunks;
}
